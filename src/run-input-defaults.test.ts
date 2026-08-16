// TDD failing-test-first — drain 2026-08-15-1900.
//
// Bug (CCQA test-reports/2026-08-15-1842-tutorial-vault-smoke.md):
// the Run dialog submits a literal empty string for a field the user
// left blank, so a declared `Input word: str = "hooray"` default never
// applies. `excited.md` returns "!" instead of "hooray!"; `factorial.md`
// crashes with `'<=' not supported between instances of 'str' and 'int'`
// because `""` reaches `n <= 1`.
//
// Investigation (recorded here because the fix shape follows from it):
//   - `_forge_resolve_action_code('excited')` →
//         def compute(context, word: str = 'hooray')
//     so the default IS present in what actually runs. The dialog just
//     never sees it: `getInputNames` returns names only.
//   - `_forge_compute('excited', [], {'word': ''})` → "!"   (the bug)
//     `_forge_compute('excited', [], {})`          → "hooray!" (correct)
//     so omitting the key is mechanically sufficient — Python's own
//     default binding does the rest.
//   - `_forge_compute('required', [], {})` → `compute() missing 1
//     required positional argument: 'y'`. So omit-on-blank must be
//     gated on "this input HAS a default"; a blank required input has
//     to be flagged in the dialog instead, or the fix trades a wrong
//     answer for a cryptic crash.
//   - The transpiled signature also carries defaults for the legacy
//     leading-typed-`Let` path (`Let x: int = 5.` →
//     `def compute(context, x: int = 5)`), so one mechanism covers both
//     declaration styles.
//
// The pure-core cases below run in microseconds; the Pyodide cases
// drive the REAL production helper (extracted from src/pyodide-host.ts
// at test time, per the fixture-drift HARD RULE) against the REAL
// bundled tutorial notes, and assert CCQA's exact repro values.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadPyodide } from 'pyodide';

import {
  initialInputValue,
  resolveSubmittedInputs,
} from './run-input-defaults-core.ts';
import { coerceRunInputValues } from './input-widget-core.ts';
import { extractProductionPythonBlock } from './test-support/extract-python-block.ts';

// ---------------------------------------------------------------- pure core

test('run-input-defaults: a declared default pre-fills the field', () => {
  assert.equal(initialInputValue('word', {}, { word: '"hooray"' }), '"hooray"');
});

test('run-input-defaults: a cached value from the last run beats the default', () => {
  assert.equal(
    initialInputValue('word', { word: '"yay"' }, { word: '"hooray"' }),
    '"yay"',
  );
});

test('run-input-defaults: an empty cached value falls back to the default', () => {
  // Otherwise clearing the box once would leave it blank forever, and
  // the user would never see what they are about to get.
  assert.equal(initialInputValue('word', { word: '' }, { word: '"hooray"' }), '"hooray"');
});

test('run-input-defaults: no cache and no default is still an empty box', () => {
  assert.equal(initialInputValue('word', {}, {}), '');
});

test('run-input-defaults: a blank field with a declared default is omitted', () => {
  const out = resolveSubmittedInputs({ word: '' }, { word: '"hooray"' });
  assert.deepEqual(out.values, {}, 'blank + default → key omitted so Python binds its own default');
  assert.deepEqual(out.missingRequired, []);
});

test('run-input-defaults: a blank field with NO declared default is flagged, not silently ""', () => {
  const out = resolveSubmittedInputs({ y: '' }, {});
  assert.deepEqual(out.missingRequired, ['y']);
});

test('run-input-defaults: an explicitly typed value passes through untouched', () => {
  // Regression guard — the fix must not touch non-blank submissions.
  const out = resolveSubmittedInputs(
    { word: '"yay"', n: '0', flag: 'false' },
    { word: '"hooray"', n: '5', flag: 'true' },
  );
  assert.deepEqual(out.values, { word: '"yay"', n: '0', flag: 'false' });
  assert.deepEqual(out.missingRequired, []);
});

test('run-input-defaults: a whitespace-only value is a real value, not a blank', () => {
  const out = resolveSubmittedInputs({ sep: ' ' }, { sep: '","' });
  assert.deepEqual(out.values, { sep: ' ' });
  assert.deepEqual(out.missingRequired, []);
});

test('run-input-defaults: the caller\'s values object is not mutated', () => {
  const values = { word: '' };
  resolveSubmittedInputs(values, { word: '"hooray"' });
  assert.deepEqual(values, { word: '' });
});

// ------------------------------------------------------- Pyodide end-to-end

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

const LET_DEFAULT_NOTE = `---
type: action
inputs:
  - x
---

# Description

Legacy leading-typed-Let declaration (drain 1610), no Input keyword.

# Recipe

Let x: int = 5.
Return x + 1.
`;

const REQUIRED_NOTE = `---
type: action
inputs:
  - y
---

# Description

A required input — declared, but with no default.

# Recipe

Input y: str.
Return y + "!".
`;

const LIST_BOOL_NOTE = `---
type: action
inputs:
  - xs
  - flag
---

# Description

CCQA flagged list/bool as untested.

# Recipe

Input xs: list = [1, 2].
Input flag: bool = True.
If flag:
  Return xs.
Return [].
`;

let _booted: any = null;
async function boot(): Promise<any> {
  if (_booted) return _booted;
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
    try {
      py.FS.writeFile('/bundle/engine/' + parts.join('/'), fs.readFileSync(abs));
    } catch { /* already written */ }
  }
  try { py.FS.mkdir('/bundle/user-vault'); } catch { /* exists */ }

  // The REAL bundled tutorial notes — the ones CCQA ran — not a
  // paraphrase of them.
  const vault = path.resolve(process.cwd(), 'assets/vaults/forge-tutorial');
  py.FS.writeFile('/bundle/user-vault/excited.md',
    fs.readFileSync(path.join(vault, '03-functions/excited.md')));
  py.FS.writeFile('/bundle/user-vault/factorial.md',
    fs.readFileSync(path.join(vault, '08-recursion/factorial.md')));
  py.FS.writeFile('/bundle/user-vault/letdefault.md', LET_DEFAULT_NOTE);
  py.FS.writeFile('/bundle/user-vault/required.md', REQUIRED_NOTE);
  py.FS.writeFile('/bundle/user-vault/listbool.md', LIST_BOOL_NOTE);

  await py.loadPackage(['pyyaml', 'numpy']);

  // Drain 2026-08-16-1310 — extraction shared with the other suites that
  // need the production block, rather than a seventh copy of the regex.
  py.runPython(extractProductionPythonBlock());


  _booted = py;
  return py;
}

/** The production `getInputDefaults` boundary. node --test can't import
 *  PyodideHostInstance (it pulls in `obsidian`), so the JS side of the
 *  call is reproduced here; the PYTHON side is the production helper
 *  loaded above. */
function getInputDefaults(py: any, snippetId: string): Record<string, string> {
  py.globals.set('_forge_input_defaults_snippet_id', snippetId);
  const proxy = py.runPython(
    `_forge_get_input_defaults(_forge_input_defaults_snippet_id)`,
  );
  const out = proxy.toJs({ dict_converter: Object.fromEntries });
  proxy.destroy?.();
  return out as Record<string, string>;
}

/** Everything the Run button does after the user clicks it, minus the
 *  DOM: collect → resolve blanks against declared defaults → coerce →
 *  dispatch to the engine. */
function runAsModalWould(
  py: any,
  snippetId: string,
  fieldValues: Record<string, string>,
): { result: unknown; stdout: string; missingRequired: string[] } {
  const defaults = getInputDefaults(py, snippetId);
  const { values, missingRequired } = resolveSubmittedInputs(fieldValues, defaults);
  if (missingRequired.length > 0) {
    // The modal stays open and dispatches nothing.
    return { result: undefined, stdout: '', missingRequired };
  }
  const kwargs = coerceRunInputValues(values);
  py.globals.set('_forge_snippet_id', snippetId);
  py.globals.set('_forge_inputs_in', kwargs as any);
  py.globals.set('_forge_vault_name', '');
  const tuple = py.runPython(`
_forge_compute(
    _forge_snippet_id,
    [],
    _forge_inputs_in.to_py() if _forge_inputs_in else {},
    _forge_vault_name,
)
`);
  const result = tuple.get(0);
  const stdout = tuple.get(1);
  tuple.destroy?.();
  return { result, stdout: String(stdout ?? ''), missingRequired: [] };
}

test('run-input-defaults: the declared default is readable from the resolved signature', async () => {
  const py = await boot();
  assert.deepEqual(getInputDefaults(py, 'excited'), { word: '"hooray"' });
  assert.deepEqual(getInputDefaults(py, 'factorial'), { n: '5' });
});

test('run-input-defaults: CCQA repro 1 — blank `word` on excited.md yields "hooray!"', async () => {
  const py = await boot();
  const { result } = runAsModalWould(py, 'excited', { word: '' });
  assert.equal(result, 'hooray!');
});

test('run-input-defaults: CCQA repro 2 — blank `n` on factorial.md yields 120, not a crash', async () => {
  const py = await boot();
  const { result } = runAsModalWould(py, 'factorial', { n: '' });
  assert.equal(result, 120);
});

test('run-input-defaults: a typed value still wins over the declared default', async () => {
  const py = await boot();
  assert.equal(runAsModalWould(py, 'excited', { word: '"yay"' }).result, 'yay!');
  assert.equal(runAsModalWould(py, 'factorial', { n: '5' }).result, 120);
});

test('run-input-defaults: the legacy typed-Let path carries defaults too', async () => {
  const py = await boot();
  assert.deepEqual(getInputDefaults(py, 'letdefault'), { x: '5' });
  assert.equal(runAsModalWould(py, 'letdefault', { x: '' }).result, 6);
});

test('run-input-defaults: a blank required input is flagged and nothing is dispatched', async () => {
  const py = await boot();
  const out = runAsModalWould(py, 'required', { y: '' });
  assert.deepEqual(getInputDefaults(py, 'required'), {});
  assert.deepEqual(out.missingRequired, ['y']);
  assert.equal(out.result, undefined);
});

test('run-input-defaults: list and bool defaults survive the round trip', async () => {
  const py = await boot();
  assert.deepEqual(getInputDefaults(py, 'listbool'), { xs: '[1, 2]', flag: 'true' });
  const { result } = runAsModalWould(py, 'listbool', { xs: '', flag: '' });
  assert.deepEqual(result?.toJs ? result.toJs() : result, [1, 2]);
});

test('run-input-defaults: an unresolvable snippet yields no defaults rather than throwing', async () => {
  const py = await boot();
  assert.deepEqual(getInputDefaults(py, 'no-such-note'), {});
});
