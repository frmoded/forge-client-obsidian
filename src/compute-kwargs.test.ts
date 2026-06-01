// TDD failing-test-first for the v0.2.6-latent Greet TypeError root
// cause discovered after the v0.2.17-v0.2.21 race-chase arc.
//
// The bug: server.ts:computeSnippet's Pyodide branch calls
// `host.computeViaEngine(snippetId, args)` with only TWO positional
// arguments. computeViaEngine's signature is `(snippet_id, args)`
// — no `inputs` parameter. The JS→Python boundary at
// pyodide-host.ts:831 hardcodes `{}` for inputs:
//
//   _forge_compute(_forge_snippet_id, list(_forge_args_in or []), {}, _forge_vault_name)
//
// User-supplied modal kwargs make it as far as server.ts but are
// then silently dropped at the JS-side boundary. Python's compute()
// runs with empty **kwargs → TypeError missing required positional.
//
// Race fixes v0.2.17-v0.2.21 were chasing a symptom (stale
// inventory) that masked this deeper boundary bug. The boundary
// bug is also why the race fixes "worked" against the suite-level
// tests but failed against production smoke — the suite tests
// never exercised computeViaEngine with non-empty kwargs.
//
// Per cc-prompt-queue.md TDD hard rule: failing tests added BEFORE
// any fix. Per the new "push every assertion to suite up to UI
// boundary" rule: the test exercises the production code path as
// close to the modal-submit moment as suite environment allows.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadPyodide } from 'pyodide';

const GREET_BODY = `---
type: action
description: Greet
inputs:
---

# English

  greet someone by name

# Python

\`\`\`python
def compute(context, name):
    print("hello " + name)
\`\`\`
`;

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

// Boot Pyodide with the bundled engine + a Greet.md fixture, then
// install verbatim copies of the production JS-side helpers from
// pyodide-host.ts. Each test calls them as the production code
// does so the JS↔Python boundary is exercised end-to-end.
async function bootGreet(): Promise<any> {
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

  // Reset user-vault per test so cases don't leak.
  try {
    const listing = py.FS.readdir('/bundle/user-vault');
    for (const entry of listing) {
      if (entry === '.' || entry === '..') continue;
      try { py.FS.unlink(`/bundle/user-vault/${entry}`); } catch { /* dir or in-use */ }
    }
  } catch { /* doesn't exist yet */ }
  try { py.FS.mkdir('/bundle/user-vault'); } catch { /* exists */ }
  py.FS.writeFile('/bundle/user-vault/Greet.md', GREET_BODY);

  await py.loadPackage(['pyyaml', 'numpy']);

  // v0.2.23: load the production inline Python block from
  // src/pyodide-host.ts dynamically. The block is bounded by the
  // `// _PYTHON_BLOCK_BEGIN` / `// _PYTHON_BLOCK_END` markers that
  // were added in v0.2.23. Extracting + executing it here means the
  // tests below exercise the SAME production helpers Pyodide loads
  // at plugin onload — not a hand-written mirror that can drift.
  //
  // This closes the v0.2.22 drift trap: the prior fixture defined
  // `_forge_run_snippet` with a 4-arg signature claiming "verbatim
  // mirror", but production was the 3-arg buggy version. Suite tests
  // passed against the fixture's pre-applied fix; production stayed
  // broken. The new approach makes that class of drift mechanically
  // impossible.
  //
  // The block expects `_forge_user_vault` to be the mount root the
  // engine scans; production sets `/bundle/user-vault`. We also need
  // the engine on sys.path — both prerequisites match what production
  // sets up before runPython hits the marker.
  const hostSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pyodide-host.ts'),
    'utf-8',
  );
  const blockMatch = hostSource.match(
    /\/\/ _PYTHON_BLOCK_BEGIN[\s\S]*?pyodide\.runPython\(`([\s\S]*?)`\);\s*\/\/ _PYTHON_BLOCK_END/,
  );
  if (!blockMatch) {
    throw new Error(
      'Could not locate the _PYTHON_BLOCK in src/pyodide-host.ts — '
      + 'the BEGIN/END markers are missing or the inline runPython('
      + ' shape has changed.',
    );
  }
  // The template literal lives inside the source as ES-string-escaped
  // text. Pyodide's runPython expects the un-escaped bytes (newlines,
  // single backslashes for Python escapes). esbuild/V8 do the
  // unescape at runtime; we must reproduce that here. The two
  // sequences that matter for our block:
  //   `\\` (source) → `\` (Python sees)
  //   `\${` (source) → `${` (Python sees — string interpolation
  //                           pass-through)
  // No other escapes are in the block currently. Keep this minimal.
  const productionPython = blockMatch[1]
    .replace(/\\\\/g, '\\')
    .replace(/\\\$\{/g, '${');

  py.runPython(productionPython);

  return py;
}

/** VERBATIM mirror of pyodide-host.ts:computeViaEngine impl post-
 *  v0.2.22. Drift-protection NOTE: keep aligned with the production
 *  impl. The post-fix shape threads inputs through via
 *  `_forge_inputs_in.to_py()` — canonical Pyodide cast from JS
 *  object → Python dict.
 *
 *  Renamed from computeViaEngine_v0_2_21_PreFix during the fix
 *  application: the mirror IS the production shape now. The test
 *  helper exists because node --test can't directly import
 *  PyodideHostInstance (which imports obsidian); recreating the
 *  shape inline lets us exercise the boundary without an obsidian
 *  shim. */
async function computeViaEngine_PreFix(
  py: any,
  snippetId: string,
  args: unknown[],
  inputs: Record<string, unknown> = {},
): Promise<{ result: unknown; stdout: string }> {
  py.globals.set('_forge_args_in', args as any);
  py.globals.set('_forge_snippet_id', snippetId);
  py.globals.set('_forge_inputs_in', inputs as any);
  py.globals.set('_forge_vault_name', '');
  const tuple = py.runPython(`
_forge_compute(
    _forge_snippet_id,
    list(_forge_args_in or []),
    _forge_inputs_in.to_py() if _forge_inputs_in else {},
    _forge_vault_name,
)
`);
  const result = tuple.get(0);
  const stdout = tuple.get(1);
  tuple.destroy?.();
  return { result, stdout: String(stdout ?? '') };
}

// (1) Direct Python call with non-empty inputs — documents that the
// Python side works correctly today. If this fails, the bug is in
// the engine, not the JS-side boundary.
test('compute-kwargs: _forge_compute direct call with non-empty inputs produces correct stdout', async () => {
  const py = await bootGreet();
  py.globals.set('_test_inputs', { name: 'world' });
  // The .to_py() cast is the canonical Pyodide pattern for JS
  // objects → Python dict. JsProxy alone isn't dict-iterable; the
  // prompt's suggested `dict(_forge_inputs_in or {})` cast doesn't
  // work for the same reason. The production fix must use .to_py().
  const tuple = py.runPython(
    `_forge_compute('Greet', [], _test_inputs.to_py() if _test_inputs else {}, '')`,
  );
  const stdout = tuple.get(1);
  tuple.destroy?.();
  assert.equal(
    stdout,
    'hello world\n',
    'Python _forge_compute should accept inputs kwarg and forward to exec_python',
  );
});

// (2) JS-side computeViaEngine with non-empty inputs — THE bug.
// Pre-fix the inputs arg is silently dropped; Python receives {};
// compute() raises missing-required-positional. Post-fix the inputs
// must flow through.
test('compute-kwargs: host.computeViaEngine with non-empty inputs produces correct stdout', async () => {
  const py = await bootGreet();
  const { stdout } = await computeViaEngine_PreFix(
    py,
    'Greet',
    [],
    { name: 'world' },
  );
  assert.equal(
    stdout,
    'hello world\n',
    'host.computeViaEngine should thread inputs through the JS↔Python boundary',
  );
});

// (3) Degenerate baseline: empty inputs against a signature that
// needs them → must raise an exec error. Documents current behavior;
// stays passing after the fix.
test('compute-kwargs: host.computeViaEngine with empty inputs raises exec error', async () => {
  const py = await bootGreet();
  await assert.rejects(
    () => computeViaEngine_PreFix(py, 'Greet', [], {}),
    (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      return /missing.*name|TypeError/i.test(msg);
    },
    'empty inputs against compute(context, name) should produce a missing-positional error',
  );
});

// (4) Distinct value — same root cause as (2), different value.
// Catches the trivial "always returns hello world" regression.
test('compute-kwargs: host.computeViaEngine with distinct kwarg value reaches Python', async () => {
  const py = await bootGreet();
  const { stdout } = await computeViaEngine_PreFix(
    py,
    'Greet',
    [],
    { name: 'foo' },
  );
  assert.equal(stdout, 'hello foo\n', 'value MUST reach Python compute()');
});

// (5) Full simulated Forge-click round-trip — getInputNames → modal
// (skipped, user types name) → computeViaEngine. The closest the
// suite can get to the user-visible UX.
test('compute-kwargs: full Forge-click round-trip — getInputNames → computeViaEngine', async () => {
  const py = await bootGreet();
  // Install getInputNames helper inline (verbatim from v0.2.21).
  py.runPython(`
import ast as _forge_ast
def _forge_get_input_names(snippet_id):
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
  // Step 1: simulate runSnippet — fetch the input names.
  const proxy = py.runPython(`list(_forge_get_input_names("Greet"))`);
  const inputs = proxy.toJs();
  proxy.destroy?.();
  assert.deepEqual(inputs, ['name'], 'getInputNames produces the right modal fields');

  // Step 2: simulate the user typing into the modal — submit kwargs.
  const userInput: Record<string, unknown> = { name: 'roundtrip' };

  // Step 3: simulate computeSnippetWithArgs → computeSnippet →
  // host.computeViaEngine. This is the boundary where the bug lives.
  const { stdout } = await computeViaEngine_PreFix(
    py,
    'Greet',
    [],
    userInput,
  );

  // Final: stdout should match what compute() prints with the value
  // the "user typed."
  assert.equal(
    stdout,
    'hello roundtrip\n',
    'full Forge-click round-trip must carry kwargs to Python compute()',
  );
});
