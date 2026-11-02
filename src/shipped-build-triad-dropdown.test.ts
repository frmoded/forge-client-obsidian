// 2026-10-31-1138 (music-theory polish 2, R5) - `quality` of the SHIPPED `exercises/build_triad` is a dropdown in the Forge panel, proven end to end on the real thing: the note as the plugin ships it
// (assets/vaults/music-theory/exercises/build_triad.md, the bundle mirror), read by the PRODUCTION Python block (`_forge_get_input_enums`, `_forge_get_input_defaults`) in real Pyodide, fed to the SAME model builder the panel
// renders from (buildInputFieldModels, forge-panel-strip-core.ts: frontmatter enum over derived enum). The control is the note as it was (test/fixtures/vault/build_triad_free_text_quality.md: `quality` a free-text input):
// it must give NO dropdown, so this test is red against the old note. And the change must not move a single pitch: the old and the new Python give the same triad for all 12 tonics x 4 qualities, through the real
// `build_triad_chord` of the real music engine.
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
const SHIPPED = fs.readFileSync(path.join(ROOT, 'assets/vaults/music-theory/exercises/build_triad.md'), 'utf8');
const BEFORE = fs.readFileSync(path.join(ROOT, 'test/fixtures/vault/build_triad_free_text_quality.md'), 'utf8');

let booted: any = null;
async function boot(): Promise<any> {
  if (booted) return booted;
  const py = await engine();
  try { py.FS.mkdir('/bundle/user-vault'); } catch { /* exists */ }
  py.FS.writeFile('/bundle/user-vault/build_triad.md', SHIPPED);
  py.FS.writeFile('/bundle/user-vault/build_triad_before.md', BEFORE);
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
/** What the panel renders for a note: the sources main.ts builds (the host's two reads; no frontmatter enum), through the panel's own model builder. */
function panelFields(py: any, snippetId: string) {
  const derivedEnums = call(py, '_forge_get_input_enums', snippetId) as Record<string, string[]>;
  const defaults = call(py, '_forge_get_input_defaults', snippetId) as Record<string, string>;
  return { derivedEnums, defaults, fields: buildInputFieldModels({ inputs: ['tonic', 'quality'], cached: {}, enums: {}, widgets: {}, defaults, derivedEnums }) };
}

test('CONTROL (the note as it was): quality is a free-text input, so the panel renders NO dropdown for it', async () => {
  const py = await boot();
  const p = panelFields(py, 'build_triad_before');
  assert.deepEqual(p.derivedEnums, {}, 'no enum derived from the old signature');
  assert.deepEqual(p.fields.map((f) => [f.name, f.kind]), [['tonic', 'text'], ['quality', 'text']]);
});

test('the shipped note: quality is a dropdown of major, minor, diminished, augmented, "major" selected; tonic stays a text field with no default', async () => {
  const py = await boot();
  const p = panelFields(py, 'build_triad');
  assert.deepEqual(p.derivedEnums, { quality: ['major', 'minor', 'diminished', 'augmented'] });
  assert.deepEqual(p.defaults, { quality: '"major"' }, 'the declared default, as JSON text (the panel convention); tonic declares none');
  const [tonic, quality] = p.fields;
  assert.deepEqual([tonic.name, tonic.kind], ['tonic', 'text']);
  assert.equal((tonic as { value: string }).value, '', 'tonic is still blank and required');
  assert.equal(quality.name, 'quality');
  assert.equal(quality.kind, 'enum');
  if (quality.kind === 'enum') {
    assert.deepEqual(quality.options.map((o) => o.label), ['major', 'minor', 'diminished', 'augmented']);
    assert.equal(quality.value, '"major"', 'the dropdown starts on major');
    assert.equal(quality.options.find((o) => o.value === quality.value)?.label, 'major');
  }
});

test('nothing else moves: the old and the new Python give the same triad for all 12 tonics x 4 qualities, through the real build_triad_chord', async () => {
  const py = await boot();
  const oldPy = extractPythonSection(BEFORE), newPy = extractPythonSection(SHIPPED);
  assert.ok(oldPy && newPy && oldPy !== newPy, 'two different texts are compared');
  py.globals.set('_t_old', oldPy); py.globals.set('_t_new', newPy);
  const rows = py.runPython(`
from forge.music.lib import build_triad_chord
def _load(src):
    ns = {'build_triad_chord': build_triad_chord}
    exec(src, ns)
    return ns['compute']
_old, _new = _load(_t_old), _load(_t_new)
_tonics = ['C4', 'C#4', 'D4', 'Eb4', 'E4', 'F4', 'F#4', 'G4', 'Ab4', 'A4', 'Bb4', 'B4']
_out = []
for _t in _tonics:
    for _q in ['major', 'minor', 'diminished', 'augmented']:
        _out.append([_t, _q, list(_old(None, _t, _q)), list(_new(None, _t, _q))])
_out
`).toJs();
  assert.equal(rows.length, 48);
  for (const [t, q, before, after] of rows) assert.deepEqual(after, before, `${t} ${q}`);
  assert.deepEqual(rows[0].slice(2), [['C4', 'E4', 'G4'], ['C4', 'E4', 'G4']], 'sanity: C4 major is C4 E4 G4 (the comparison is not of two empty lists)');
  // the declared default is what a call without `quality` uses
  assert.deepEqual(Array.from(py.runPython(`list(_new(None, 'C4'))`)), ['C4', 'E4', 'G4']);
});
