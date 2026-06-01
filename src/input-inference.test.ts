// TDD failing-test-first for v0.2.20 input-inference.
//
// Bug: Greet.md frontmatter has `inputs:` (empty/null), LLM
// generated `def compute(context, name): print("hello " + name)`.
// Forge-click reads frontmatter, sees no inputs, skips the modal,
// calls compute with no kwargs. Engine raises
// `TypeError: compute() missing 1 required positional argument: 'name'`.
//
// Fix (this prompt's): engine-side helper parses the Python signature
// at runtime, unions with frontmatter-declared inputs (declared
// first for UI ordering), returns the augmented set. The Python
// signature becomes the source of truth.
//
// Per cc-prompt-queue.md TDD hard rule: this test exists BEFORE
// the fix. All 9 cases fail today because
// `_forge_get_input_names` doesn't exist yet. After the fix lands
// they all pass. Pre-fix output goes into feedback §1.2 verbatim;
// post-fix output goes into §1.4 verbatim.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadPyodide } from 'pyodide';

function walk(dir: string, base = ''): Array<{ rel: string; abs: string }> {
  const out: Array<{ rel: string; abs: string }> = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(base, entry.name);
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs, rel));
    else out.push({ rel, abs });
  }
  return out;
}

let _pyodidePromise: Promise<any> | null = null;
function getPyodide(): Promise<any> {
  if (_pyodidePromise === null) _pyodidePromise = loadPyodide();
  return _pyodidePromise;
}

/** Build a full snippet body (frontmatter + English + Python facet)
 *  for the test. `inputsLine` is the frontmatter `inputs:` line
 *  verbatim (caller chooses empty, null, list, etc). `pythonFacet`
 *  is the code block content (or empty/undefined to omit the
 *  Python facet entirely). */
function buildSnippet(opts: {
  description?: string;
  inputsLine: string;
  pythonFacet?: string;
}): string {
  const desc = opts.description ?? 'test snippet';
  const pyBlock = opts.pythonFacet
    ? `\n# Python\n\n\`\`\`python\n${opts.pythonFacet}\n\`\`\`\n`
    : '';
  return `---
type: action
description: ${desc}
${opts.inputsLine}
---

# English

  ${desc}
${pyBlock}`;
}

/** Boot the engine + scan a single-file user-vault with the given
 *  snippet body at `<snippetId>.md`. Each test reboots a per-test
 *  registry state; the Pyodide instance itself is shared via the
 *  promise. */
async function bootWithSnippet(snippetId: string, body: string): Promise<any> {
  const py = await getPyodide();

  const engineDir = path.resolve(process.cwd(), 'assets/engine');
  if (!fs.existsSync(engineDir)) {
    throw new Error(`engine bundle not found at ${engineDir} — run npm run build first`);
  }

  try { py.FS.mkdir('/bundle'); } catch { /* exists */ }
  try { py.FS.mkdir('/bundle/engine'); } catch { /* exists */ }

  const created = new Set(['/bundle/engine']);
  for (const { rel, abs } of walk(engineDir)) {
    const parts = rel.split(path.sep);
    let cursor = '/bundle/engine';
    for (let i = 0; i < parts.length - 1; i++) {
      cursor = cursor + '/' + parts[i];
      if (!created.has(cursor)) {
        try { py.FS.mkdir(cursor); created.add(cursor); } catch { /* exists */ }
      }
    }
    const target = '/bundle/engine/' + parts.join('/');
    try { py.FS.writeFile(target, fs.readFileSync(abs)); } catch { /* already written */ }
  }

  // Reset the user-vault dir for each test so stale snippets don't
  // bleed across cases.
  try {
    // FS.unlink each existing user-vault file; FS.rmdir requires
    // empty.
    const listing = py.FS.readdir('/bundle/user-vault');
    for (const entry of listing) {
      if (entry === '.' || entry === '..') continue;
      try { py.FS.unlink(`/bundle/user-vault/${entry}`); } catch { /* dir or in-use */ }
    }
  } catch { /* dir doesn't exist yet */ }
  try { py.FS.mkdir('/bundle/user-vault'); } catch { /* exists */ }
  py.FS.writeFile(`/bundle/user-vault/${snippetId}.md`, body);

  await py.loadPackage(['pyyaml', 'numpy']);

  py.runPython(`
import sys
if '/bundle/engine' not in sys.path:
    sys.path.insert(0, '/bundle/engine')

from forge.core.snippet_registry import SnippetRegistry
from forge.core.graph_resolver import GraphResolver
from forge.core.executor import extract_python

# Fresh registry per test so cases don't see stale entries.
_forge_registry = SnippetRegistry()
_forge_registry.scan('/bundle/user-vault')
_forge_resolver = GraphResolver(_forge_registry)

# v0.2.20: verbatim copy of pyodide-host.ts:_forge_get_input_names.
# Drift-protection NOTE from v0.2.5 applies: keep aligned with the
# inlined Python in src/pyodide-host.ts. v1.1 centralization in
# forge.core.* collapses these duplicates.
import ast as _forge_ast
def _forge_get_input_names(snippet_id):
    # v0.2.21 race fix: refresh registry from MEMFS before resolving.
    relpath = f"/bundle/user-vault/{snippet_id}.md"
    try:
        _forge_registry.refresh_file(relpath)
    except Exception:
        pass
    snip = _forge_resolver.resolve(snippet_id)
    meta = snip.get("meta") or {}
    declared = [str(i) for i in (meta.get("inputs") or [])]
    body = snip.get("body") or ""
    try:
        code = extract_python(body)
    except Exception:
        return declared
    if not code or not code.strip():
        return declared
    try:
        tree = _forge_ast.parse(code)
    except SyntaxError:
        return declared
    sig_args = None
    for node in _forge_ast.walk(tree):
        if isinstance(node, _forge_ast.FunctionDef) and node.name == "compute":
            sig_args = (
                [a.arg for a in node.args.args]
                + [a.arg for a in node.args.kwonlyargs]
            )
            break
    if sig_args is None:
        return declared
    sig_args = [a for a in sig_args if a != "context"]
    out = list(declared)
    for a in sig_args:
        if a not in out:
            out.append(a)
    return out
`);

  return py;
}

// (1) Existence check — fails today because the helper isn't defined.
test('input-inference: _forge_get_input_names exists', async () => {
  const py = await bootWithSnippet(
    'Probe',
    buildSnippet({ inputsLine: 'inputs:', pythonFacet: 'def compute(context):\n    pass' }),
  );
  const exists = py.runPython(`'_forge_get_input_names' in dir()`);
  assert.equal(exists, true, '_forge_get_input_names should exist in Pyodide globals');
});

// (2) Greet bug repro — empty frontmatter inputs + signature with
// one extra param. The exact shape that fired the TypeError.
test('input-inference: signature with one extra param, empty frontmatter inputs', async () => {
  const py = await bootWithSnippet(
    'Greet',
    buildSnippet({
      inputsLine: 'inputs:',
      pythonFacet: 'def compute(context, name):\n    print("hello " + name)',
    }),
  );
  const result = py.runPython(`list(_forge_get_input_names("Greet"))`);
  const inputs = result.toJs();
  result.destroy?.();
  assert.deepEqual(inputs, ['name']);
});

// (3) Declared params matching signature — common authored-with-care case.
test('input-inference: signature with declared params matching', async () => {
  const py = await bootWithSnippet(
    'Foo',
    buildSnippet({
      inputsLine: 'inputs:\n  - foo',
      pythonFacet: 'def compute(context, foo):\n    return foo',
    }),
  );
  const result = py.runPython(`list(_forge_get_input_names("Foo"))`);
  const inputs = result.toJs();
  result.destroy?.();
  assert.deepEqual(inputs, ['foo']);
});

// (4) Declared-first ordering preserved when signature has extras.
// User explicitly listed `foo`; LLM added `bar`. Modal must show
// foo first (user-intended order), then bar appended.
test('input-inference: signature with extra params on top of declared', async () => {
  const py = await bootWithSnippet(
    'Extra',
    buildSnippet({
      inputsLine: 'inputs:\n  - foo',
      pythonFacet: 'def compute(context, foo, bar):\n    return foo + bar',
    }),
  );
  const result = py.runPython(`list(_forge_get_input_names("Extra"))`);
  const inputs = result.toJs();
  result.destroy?.();
  assert.deepEqual(inputs, ['foo', 'bar']);
});

// (5) No extras — empty inputs + bare compute(context). Modal should
// skip entirely.
test('input-inference: signature with no extra params', async () => {
  const py = await bootWithSnippet(
    'Bare',
    buildSnippet({
      inputsLine: 'inputs:',
      pythonFacet: 'def compute(context):\n    return "ok"',
    }),
  );
  const result = py.runPython(`list(_forge_get_input_names("Bare"))`);
  const inputs = result.toJs();
  result.destroy?.();
  assert.deepEqual(inputs, []);
});

// (6) Malformed Python falls back to declared. SyntaxError shouldn't
// crash the modal-open path.
test('input-inference: malformed Python falls back to declared', async () => {
  const py = await bootWithSnippet(
    'Broken',
    buildSnippet({
      inputsLine: 'inputs:\n  - foo',
      pythonFacet: 'def compute(SYNTAX ERROR',
    }),
  );
  const result = py.runPython(`list(_forge_get_input_names("Broken"))`);
  const inputs = result.toJs();
  result.destroy?.();
  assert.deepEqual(inputs, ['foo']);
});

// (7) Missing Python facet falls back to declared. The English-only
// shape that exists between authoring and first /generate.
test('input-inference: missing Python facet falls back to declared', async () => {
  const py = await bootWithSnippet(
    'Englishonly',
    buildSnippet({
      inputsLine: 'inputs:\n  - foo',
      // pythonFacet omitted → no # Python section in the body.
    }),
  );
  const result = py.runPython(`list(_forge_get_input_names("Englishonly"))`);
  const inputs = result.toJs();
  result.destroy?.();
  assert.deepEqual(inputs, ['foo']);
});

// (8) context is filtered. The engine implicitly passes context;
// the user never supplies it via the modal.
test('input-inference: context param is filtered even if listed first', async () => {
  const py = await bootWithSnippet(
    'Ctx',
    buildSnippet({
      inputsLine: 'inputs:',
      pythonFacet: 'def compute(context, x):\n    return x',
    }),
  );
  const result = py.runPython(`list(_forge_get_input_names("Ctx"))`);
  const inputs = result.toJs();
  result.destroy?.();
  assert.deepEqual(inputs, ['x']);
});

// (9) keyword-only params from PEP 3102 (compute(context, *, name)).
// Less common but valid Python; the helper must handle it.
test('input-inference: kwargs-only signature works', async () => {
  const py = await bootWithSnippet(
    'Kwonly',
    buildSnippet({
      inputsLine: 'inputs:',
      pythonFacet: 'def compute(context, *, name, count):\n    return f"{name}{count}"',
    }),
  );
  const result = py.runPython(`list(_forge_get_input_names("Kwonly"))`);
  const inputs = result.toJs();
  result.destroy?.();
  assert.deepEqual(inputs, ['name', 'count']);
});
