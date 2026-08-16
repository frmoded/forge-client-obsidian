// Drain 2026-08-16-1700 — an enum-literal Input type renders a dropdown.
//
// `Input mood: 'happy' | 'sad' | 'grumpy' = "happy".` transpiles to
// `def compute(context, mood: Literal['happy','sad','grumpy'] = 'happy')`
// — verified against the real transpiler before this was written. The Run
// dialog rendered it as a plain text box anyway, because dropdowns were
// triggered only by `input_enums:` frontmatter.
//
// That mattered beyond polish: no wizard tool can set `input_enums:`, so
// an enum note authored over MCP could not get the dropdown at all. The
// type IS the option list; deriving from it removes the parallel
// declaration entirely.
//
// Options travel as JSON text (value) plus the bare literal (label),
// which is the convention drain 1900 established for defaults: selecting
// `happy` must submit exactly what typing `"happy"` would have. Storing
// the bare text would break an enum like `'5' | '6'`, where JSON.parse
// would hand the engine the number 5 instead of the string "5".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadPyodide } from 'pyodide';

import { extractProductionPythonBlock } from './test-support/extract-python-block.ts';
import { enumOptions, initialDerivedEnumValue } from './derived-enums-core.ts';
import { resolveInputRendering } from './input-widget-core.ts';
import { coerceRunInputValues } from './input-widget-core.ts';
import { resolveSubmittedInputs } from './run-input-defaults-core.ts';

// ---------------------------------------------------------------- pure core

test('derived-enum: options carry JSON values with bare labels', () => {
  assert.deepEqual(enumOptions(['happy', 'sad']), [
    { value: '"happy"', label: 'happy' },
    { value: '"sad"', label: 'sad' },
  ]);
});

test('derived-enum: selecting an option submits what typing it would have', () => {
  // The round-trip §4 demands. `'5' | '6'` is the case bare text breaks.
  const opts = enumOptions(['5', '6']);
  const typed = coerceRunInputValues({ n: '"5"' });      // what typing "5" gives
  const picked = coerceRunInputValues({ n: opts[0].value });
  assert.deepEqual(picked, typed);
  assert.equal(picked.n, '5', 'must stay the STRING "5", not the number 5');
});

test('derived-enum: the declared default is pre-selected', () => {
  const opts = enumOptions(['happy', 'sad', 'grumpy']);
  assert.equal(initialDerivedEnumValue(undefined, opts, '"happy"'), '"happy"');
});

test('derived-enum: a cached previous choice beats the declared default', () => {
  const opts = enumOptions(['happy', 'sad']);
  assert.equal(initialDerivedEnumValue('"sad"', opts, '"happy"'), '"sad"');
});

test('derived-enum: a cached value that is no longer a valid option is ignored', () => {
  const opts = enumOptions(['happy', 'sad']);
  assert.equal(initialDerivedEnumValue('"grumpy"', opts, '"happy"'), '"happy"');
});

test('derived-enum: NO declared default starts blank, so required-input still fires', () => {
  // §8 — a dropdown must not silently supply a value for an input the
  // author declared without a default. Blank keeps 1900's missing-required
  // path reachable instead of quietly submitting the first option.
  const opts = enumOptions(['happy', 'sad']);
  assert.equal(initialDerivedEnumValue(undefined, opts, undefined), '');

  const out = resolveSubmittedInputs({ mood: '' }, {});
  assert.deepEqual(out.missingRequired, ['mood']);
});

// ------------------------------------------------------------- precedence

test('derived-enum: a derived enum renders as a dropdown', () => {
  const r = resolveInputRendering('mood', {}, {}, { mood: ['happy', 'sad'] });
  assert.equal(r.kind, 'enum');
  assert.deepEqual((r as any).allowed, ['happy', 'sad']);
  assert.equal((r as any).source, 'derived');
});

test('derived-enum: frontmatter input_enums WINS over the derived type', () => {
  // §4's recommendation, and the right way round: frontmatter is the
  // explicit override. The note contradicts itself, so warn.
  const r = resolveInputRendering(
    'mood', { mood: ['a', 'b'] }, {}, { mood: ['happy', 'sad'] });
  assert.equal(r.kind, 'enum');
  assert.deepEqual((r as any).allowed, ['a', 'b']);
  assert.equal((r as any).source, 'frontmatter');
  assert.equal((r as any).conflict, true, 'the author should be told');
});

test('derived-enum: a widget still wins over a derived enum', () => {
  const r = resolveInputRendering('mood', {}, { mood: 'piano' }, { mood: ['a'] });
  assert.equal(r.kind, 'widget');
  assert.equal((r as any).conflict, true);
});

test('derived-enum: a non-enum input is still a text field', () => {
  // Regression guard — the fix must not touch ordinary inputs.
  assert.equal(resolveInputRendering('word', {}, {}, {}).kind, 'text');
  assert.equal(resolveInputRendering('word', {}, {}, { other: ['a'] }).kind, 'text');
});

test('derived-enum: the pre-existing two-argument call still behaves', () => {
  // resolveInputRendering is called elsewhere without the new argument.
  assert.equal(resolveInputRendering('x', {}, {}).kind, 'text');
  assert.equal(resolveInputRendering('x', { x: ['a'] }, {}).kind, 'enum');
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

const MOOD_NOTE = `---
type: action
inputs:
  - mood
---

# Description

The enum demo the driver hit live.

# Recipe

Input mood: 'happy' | 'sad' | 'grumpy' = "happy".
If mood == "happy":
  Return "yay".
Return "aw".
`;

const PLAIN_NOTE = `---
type: action
inputs:
  - word
---

# Description

No enum anywhere.

# Recipe

Input word: str = "hooray".
Return word + "!".
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
    try { py.FS.writeFile('/bundle/engine/' + parts.join('/'), fs.readFileSync(abs)); }
    catch { /* already written */ }
  }
  try { py.FS.mkdir('/bundle/user-vault'); } catch { /* exists */ }
  py.FS.writeFile('/bundle/user-vault/mood.md', MOOD_NOTE);
  py.FS.writeFile('/bundle/user-vault/plain.md', PLAIN_NOTE);

  await py.loadPackage(['pyyaml', 'numpy']);
  py.runPython(extractProductionPythonBlock());
  _booted = py;
  return py;
}

function inputEnums(py: any, snippetId: string): Record<string, string[]> {
  py.globals.set('_forge_input_enums_snippet_id', snippetId);
  const proxy = py.runPython(
    `_forge_get_input_enums(_forge_input_enums_snippet_id)`);
  const out = proxy.toJs({ dict_converter: Object.fromEntries });
  proxy.destroy?.();
  // toJs leaves inner lists as Arrays already; normalise for deepEqual.
  return Object.fromEntries(
    Object.entries(out).map(([k, v]) => [k, Array.from(v as any)]));
}

test('derived-enum: the resolved signature yields the literal options', async () => {
  const py = await boot();
  assert.deepEqual(inputEnums(py, 'mood'), { mood: ['happy', 'sad', 'grumpy'] });
});

test('derived-enum: a note with no enum yields nothing', async () => {
  const py = await boot();
  assert.deepEqual(inputEnums(py, 'plain'), {});
});

test('derived-enum: an unresolvable snippet yields nothing rather than throwing', async () => {
  const py = await boot();
  assert.deepEqual(inputEnums(py, 'no-such-note'), {});
});

test('derived-enum: end to end — the mood note dropdown runs its branch', async () => {
  const py = await boot();
  const options = enumOptions(inputEnums(py, 'mood').mood);
  // What the dialog would submit when the user picks "sad".
  const picked = options.find(o => o.label === 'sad')!;
  const { values } = resolveSubmittedInputs({ mood: picked.value }, { mood: '"happy"' });
  const kwargs = coerceRunInputValues(values);

  py.globals.set('_forge_snippet_id', 'mood');
  py.globals.set('_forge_inputs_in', kwargs as any);
  py.globals.set('_forge_vault_name', '');
  const tuple = py.runPython(`
_forge_compute(_forge_snippet_id, [], _forge_inputs_in.to_py(), _forge_vault_name)
`);
  const result = tuple.get(0);
  tuple.destroy?.();
  assert.equal(result, 'aw', 'picking "sad" must take the non-happy branch');
});
