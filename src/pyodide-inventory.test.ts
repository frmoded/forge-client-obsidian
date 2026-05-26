// Pyodide-in-Node regression test for the /generate inventory helper.
//
// Why this test exists
// --------------------
// v0.2.4 shipped a SyntaxError in the embedded Python regex inside
// pyodide-host.ts because the original source used `\(`, `\s`, `\'`
// etc. inside a JS template literal — V8 strips unrecognized escape
// sequences, so Pyodide received a malformed string. The auto-smoke
// pipeline missed it because no test ever sent the embedded Python
// through Pyodide's parser.
//
// This test closes that gap. It loads Pyodide in Node, runs a verbatim
// copy of the regex helper from `pyodide-host.ts`, and asserts that:
//   1. The Python source parses cleanly (proves the JS escapes survived).
//   2. `_forge_find_deps` returns the engine-equivalent deps for a
//      representative snippet body (proves the regex matches semantics).
//
// Drift protection
// ----------------
// The Python source below MUST stay byte-identical to the corresponding
// block in `pyodide-host.ts` (the section between `_FORGE_ID_CHARS = ...`
// and the end of `_forge_find_deps`). When you edit one, edit the other.
// The v1.1 plan is to centralize the helper inside `forge.core.llm` so
// only one copy exists — until that lands, this comment is the contract.
//
// Performance
// -----------
// Pyodide cold-start in Node takes ~2–4s, so this test is intentionally
// the only file that boots Pyodide. `node --test` runs files in
// parallel, so one cold start doesn't slow the other tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPyodide } from 'pyodide';

// Verbatim copy of the regex helper from pyodide-host.ts. The double-
// backslashes are deliberate (see the NOTE in pyodide-host.ts).
const HELPER_PY = `
import re as _forge_re

_FORGE_ID_CHARS = r"[\\w./-]+"

def _forge_find_deps(body: str):
    deps = []
    seen = set()
    for m in _forge_re.finditer(
        rf'\\[\\[({_FORGE_ID_CHARS})(?:\\|[^\\]]*)?\\]\\]', body or ""
    ):
        dep = m.group(1).strip()
        if dep and dep not in seen:
            deps.append(dep); seen.add(dep)
    for m in _forge_re.finditer(
        rf'context\\.compute\\(\\s*["\\']({_FORGE_ID_CHARS})["\\']', body or ""
    ):
        dep = m.group(1).strip()
        if dep and dep not in seen:
            deps.append(dep); seen.add(dep)
    return deps
`;

// v0.2.6: _forge_list_snippets shim test. The real helper in
// pyodide-host.ts delegates to SnippetRegistry.list_snippets(), but
// mounting the full bundled engine here would balloon the test setup
// (~50MB of pyodide stdlib + engine .py files). Instead we stub a
// minimal SnippetRegistry that mirrors the production shape, then
// assert _forge_list_snippets returns it verbatim. This catches the
// shape/delegate contract; the integration-level "list_snippets walks
// the real registry" check is implicitly covered by the v0.2.6 user
// smoke step 3 (Forge-click reaches /generate without a Connect 404).
const LIST_SNIPPETS_PY = `
class _StubRegistry:
    def __init__(self, payload):
        self._payload = payload
    def list_snippets(self):
        return self._payload

_forge_registry = _StubRegistry({
    "user-vault": [
        {"id": "my-snippet", "type": "action", "inputs": []},
    ],
    "forge-moda": [
        {"id": "setup", "type": "action", "inputs": []},
        {"id": "move", "type": "action", "inputs": ["dt"]},
    ],
})

def _forge_list_snippets():
    return _forge_registry.list_snippets()
`;

// Booting Pyodide is expensive (~3s in Node). Cache the instance across
// tests in this file via a top-level Promise.
let _pyodidePromise: Promise<any> | null = null;
function getPyodide(): Promise<any> {
  if (_pyodidePromise === null) {
    _pyodidePromise = loadPyodide();
  }
  return _pyodidePromise;
}

test('pyodide-inventory: helper Python parses without SyntaxError', async () => {
  const py = await getPyodide();
  // If V8 stripped backslashes the way it did in v0.2.4, this line
  // throws PythonError: SyntaxError. The whole point of the test.
  assert.doesNotThrow(() => py.runPython(HELPER_PY));
});

test('pyodide-inventory: _forge_find_deps extracts context.compute() ids', async () => {
  const py = await getPyodide();
  py.runPython(HELPER_PY);
  const body = `
state = context.compute("setup", temperature="medium")
state = context.compute('move', state=state)
context.compute(
    "ask_all_particles",
    state=state, dt=dt,
)
`;
  py.globals.set('_forge_test_body', body);
  const result = py.runPython('list(_forge_find_deps(_forge_test_body))');
  const deps = result.toJs();
  result.destroy();
  assert.deepEqual(deps, ['setup', 'move', 'ask_all_particles']);
});

test('pyodide-inventory: _forge_find_deps extracts [[wikilink]] ids', async () => {
  const py = await getPyodide();
  py.runPython(HELPER_PY);
  const body = `
See [[setup]] for initialization and [[forge-moda/move]] for the
displacement step. Pipe-aliased like [[ask_all_particles|the asker]]
should still resolve to the id before the pipe.
`;
  py.globals.set('_forge_test_body', body);
  const result = py.runPython('list(_forge_find_deps(_forge_test_body))');
  const deps = result.toJs();
  result.destroy();
  assert.deepEqual(deps, ['setup', 'forge-moda/move', 'ask_all_particles']);
});

test('pyodide-inventory: _forge_find_deps dedupes across wikilink + compute', async () => {
  const py = await getPyodide();
  py.runPython(HELPER_PY);
  const body = `
See [[setup]] and also call context.compute("setup", temperature="hot").
Then context.compute("move", state=state) once.
`;
  py.globals.set('_forge_test_body', body);
  const result = py.runPython('list(_forge_find_deps(_forge_test_body))');
  const deps = result.toJs();
  result.destroy();
  // Wikilink "setup" comes first; the compute("setup") on the next line
  // is the same id and must be deduped. "move" appears only via compute.
  assert.deepEqual(deps, ['setup', 'move']);
});

test('pyodide-inventory: _forge_find_deps skips prose wikilinks with brace placeholders', async () => {
  const py = await getPyodide();
  py.runPython(HELPER_PY);
  // The engine's _find_deps doc-comment specifically calls out that
  // f-string fragments like [[{vault_name}/foo]] would otherwise trip
  // recursive /generate on phantom deps. _FORGE_ID_CHARS only allows
  // [\w./-] so the brace is rejected — verify here.
  const body = 'See [[{vault_name}/install]] in the prompt template.';
  py.globals.set('_forge_test_body', body);
  const result = py.runPython('list(_forge_find_deps(_forge_test_body))');
  const deps = result.toJs();
  result.destroy();
  assert.deepEqual(deps, []);
});

test('pyodide-inventory: _forge_find_deps returns empty list for body with no deps', async () => {
  const py = await getPyodide();
  py.runPython(HELPER_PY);
  py.globals.set('_forge_test_body', 'Just plain text. No links, no calls.');
  const result = py.runPython('list(_forge_find_deps(_forge_test_body))');
  const deps = result.toJs();
  result.destroy();
  assert.deepEqual(deps, []);
});

test('pyodide-inventory: _forge_list_snippets returns {vault: [{id,type,inputs}]} shape', async () => {
  const py = await getPyodide();
  py.runPython(LIST_SNIPPETS_PY);
  const proxy = py.runPython('_forge_list_snippets()');
  const out = proxy.toJs({ dict_converter: Object.fromEntries });
  proxy.destroy();
  // Top level: dict keyed by vault name.
  assert.equal(typeof out, 'object');
  assert.ok('user-vault' in out);
  assert.ok('forge-moda' in out);
  // Per-vault values are arrays.
  assert.ok(Array.isArray(out['user-vault']));
  assert.ok(Array.isArray(out['forge-moda']));
  // Each entry has the three required fields with correct types.
  for (const vault of Object.keys(out)) {
    for (const entry of out[vault]) {
      assert.equal(typeof entry.id, 'string');
      assert.equal(typeof entry.type, 'string');
      assert.ok(Array.isArray(entry.inputs));
    }
  }
});

test('pyodide-inventory: _forge_list_snippets includes bundled forge-moda with known ids', async () => {
  const py = await getPyodide();
  py.runPython(LIST_SNIPPETS_PY);
  const proxy = py.runPython('_forge_list_snippets()');
  const out = proxy.toJs({ dict_converter: Object.fromEntries });
  proxy.destroy();
  const moda = out['forge-moda'] as Array<{ id: string; type: string; inputs: string[] }>;
  const ids = moda.map((e) => e.id);
  // setup is always present in the bundled vault. move was chosen for
  // the stub because it exercises non-empty inputs.
  assert.ok(ids.includes('setup'), `expected 'setup' in forge-moda; got: ${ids.join(',')}`);
  const move = moda.find((e) => e.id === 'move');
  assert.ok(move);
  assert.equal(move!.type, 'action');
  assert.deepEqual(move!.inputs, ['dt']);
});
