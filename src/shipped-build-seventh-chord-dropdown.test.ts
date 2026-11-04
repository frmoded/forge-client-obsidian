// 2026-11-03-1158 (R4 batch, after the build_triad pilot 1153) - the SHIPPED `exercises/build_seventh_chord` is Description-sourced and `quality` is a dropdown of its eight values in the Forge panel, proven on the real thing the way
// shipped-build-triad-dropdown.test.ts proves build_triad: the note as the plugin ships it (assets/vaults/music-theory/exercises/build_seventh_chord.md, the bundle mirror), read by the PRODUCTION Python block in real Pyodide, fed to the
// SAME model builder the panel renders from. The control is the note as it was (test/fixtures/vault/build_seventh_chord_free_text_quality.md: `quality` a free-text input): NO dropdown, so this is red against the old note. And the change
// must not move a pitch: the old and the new Python give the same chord for all 12 tonics x 8 qualities (96), through the real `build_chord` of the real music engine; a missing `quality` is the declared default; a bad one fails the same way.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test as baseTest } from 'node:test';

import { WHEELS_PRESENT, engine } from './test-support/real-rhythm-engine.ts';
import { extractProductionPythonBlock } from './test-support/extract-python-block.ts';
import { extractPythonSection } from './v2-note-core.ts';
import { buildInputFieldModels } from './forge-panel-strip-core.ts';

const skip = WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels';
const test = (name: string, fn: () => Promise<void>) => baseTest(name, { skip, timeout: 300_000 }, fn);
const ROOT = path.resolve(import.meta.dirname, '..');
const SHIPPED = fs.readFileSync(path.join(ROOT, 'assets/vaults/music-theory/exercises/build_seventh_chord.md'), 'utf8');
const BEFORE = fs.readFileSync(path.join(ROOT, 'test/fixtures/vault/build_seventh_chord_free_text_quality.md'), 'utf8');
const QUALITIES = ['maj7', 'dom7', 'min7', 'half_dim7', 'dim7', 'dom9', 'dom11', 'dom13'];

let booted: any = null;
async function boot(): Promise<any> {
  if (booted) return booted;
  const py = await engine();
  try { py.FS.mkdir('/bundle/user-vault'); } catch { /* exists */ }
  py.FS.writeFile('/bundle/user-vault/build_seventh_chord.md', SHIPPED);
  py.FS.writeFile('/bundle/user-vault/build_seventh_chord_before.md', BEFORE);
  py.runPython(extractProductionPythonBlock());
  booted = py;
  return py;
}
function call(py: any, fn: string, snippetId: string): Record<string, any> {
  py.globals.set('_t_snippet_id', snippetId);
  const proxy = py.runPython(`${fn}(_t_snippet_id)`);
  const out = proxy.toJs({ dict_converter: Object.fromEntries });
  proxy.destroy?.();
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Array.isArray(v) ? Array.from(v as any) : v]));
}
function panelFields(py: any, snippetId: string) {
  const derivedEnums = call(py, '_forge_get_input_enums', snippetId) as Record<string, string[]>;
  const defaults = call(py, '_forge_get_input_defaults', snippetId) as Record<string, string>;
  return { derivedEnums, defaults, fields: buildInputFieldModels({ inputs: ['tonic', 'quality'], cached: {}, enums: {}, widgets: {}, defaults, derivedEnums }) };
}

test('CONTROL (the note as it was): quality is a free-text input, so the panel renders NO dropdown for it', async () => {
  const py = await boot();
  const p = panelFields(py, 'build_seventh_chord_before');
  assert.deepEqual(p.derivedEnums, {}, 'no enum derived from the old signature');
  assert.deepEqual(p.fields.map((f) => [f.name, f.kind]), [['tonic', 'text'], ['quality', 'text']]);
});

test('the shipped note is Description-sourced and its quality is a dropdown of the eight values, "maj7" selected; tonic stays a text field with no default', async () => {
  const py = await boot();
  assert.match(SHIPPED, /^source_facet: description$/m);
  const p = panelFields(py, 'build_seventh_chord');
  assert.deepEqual(p.derivedEnums, { quality: QUALITIES });
  assert.deepEqual(p.defaults, { quality: '"maj7"' }, 'the declared default, as JSON text (the panel convention); tonic declares none');
  const [tonic, quality] = p.fields;
  assert.deepEqual([tonic.name, tonic.kind], ['tonic', 'text']);
  assert.equal((tonic as { value: string }).value, '', 'tonic is still blank and required');
  assert.equal(quality.kind, 'enum');
  if (quality.kind === 'enum') {
    assert.deepEqual(quality.options.map((o) => o.label), QUALITIES);
    assert.equal(quality.value, '"maj7"', 'the dropdown starts on maj7');
  }
});

test('nothing else moves: the old and the new Python give the same chord for all 12 tonics x 8 qualities (96), through the real build_chord; a bad quality fails the same way', async () => {
  const py = await boot();
  const oldPy = extractPythonSection(BEFORE), newPy = extractPythonSection(SHIPPED);
  assert.ok(oldPy && newPy && oldPy !== newPy, 'two different texts are compared');
  py.globals.set('_t_old', oldPy); py.globals.set('_t_new', newPy); py.globals.set('_t_qualities', QUALITIES);
  const rows = py.runPython(`
from forge.music.lib import build_chord
def _load(src):
    ns = {'build_chord': build_chord}
    exec(src, ns)
    return ns['compute']
_old, _new = _load(_t_old), _load(_t_new)
_tonics = ['C4', 'C#4', 'D4', 'Eb4', 'E4', 'F4', 'F#4', 'G4', 'Ab4', 'A4', 'Bb4', 'B4']
_out = []
for _t in _tonics:
    for _q in _t_qualities:
        _out.append([_t, _q, list(_old(None, _t, _q)), list(_new(None, _t, _q))])
_out
`).toJs();
  assert.equal(rows.length, 96);
  for (const [t, q, before, after] of rows) assert.deepEqual(after, before, `${t} ${q}`);
  assert.deepEqual(rows[0].slice(2), [['C4', 'E4', 'G4', 'B4'], ['C4', 'E4', 'G4', 'B4']], 'sanity: C4 maj7 is C4 E4 G4 B4 (the comparison is not of two empty lists)');
  assert.ok(rows.every((r: any) => r[2].length >= 4), 'every chord has at least four notes');
  assert.deepEqual(Array.from(py.runPython(`list(_new(None, 'C4'))`)), ['C4', 'E4', 'G4', 'B4'], 'a call without `quality` is the declared default, maj7');
  const errs = py.runPython(`
def _err(f):
    try:
        f(None, 'C4', 'nope'); return 'no error'
    except Exception as e:
        return type(e).__name__
[_err(_old), _err(_new)]
`).toJs();
  assert.deepEqual(errs, ['KeyError', 'KeyError'], 'an unknown quality fails the same way in both');
});
