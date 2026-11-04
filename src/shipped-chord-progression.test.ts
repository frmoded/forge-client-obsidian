// 2026-11-03-1158 (R4 batch) - the SHIPPED `exercises/chord_progression` is Description-sourced (its Recipe from the real /generate service) and gives the SAME Score as the note it replaces, for a stated table of 24 input
// rows, through the real `form` of the real music engine; and the panel model of each of its three inputs is stated (key_name and progression text; mode_name text too - the service typed it `str`, not an enum, so the panel
// shows the same three text fields as before, see the FEEDBACK). The old note is test/fixtures/vault/chord_progression_before.md. A row the engine refuses must be refused the same way by both.
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
const SHIPPED = fs.readFileSync(path.join(ROOT, 'assets/vaults/music-theory/exercises/chord_progression.md'), 'utf8');
const BEFORE = fs.readFileSync(path.join(ROOT, 'test/fixtures/vault/chord_progression_before.md'), 'utf8');

/** The table: key, mode, progression. Rows 23 and 24 are refused by the engine (a bad mode, a bad numeral): both notes must refuse them identically. */
const ROWS: Array<[string, string, string[]]> = [
  ['C', 'major', ['I', 'IV', 'I', 'V', 'I']], ['C', 'major', ['I', 'vi', 'IV', 'V']], ['G', 'major', ['I', 'V', 'vi', 'IV']], ['D', 'major', ['I', 'IV', 'V', 'I']],
  ['A', 'major', ['ii', 'V', 'I']], ['F', 'major', ['I', 'IV', 'V']], ['B-', 'major', ['I', 'V', 'vi', 'iii', 'IV', 'I', 'IV', 'V']], ['E', 'major', ['I', 'IV', 'I', 'V', 'I']],
  ['A-', 'major', ['I', 'IV', 'V', 'I']], ['C', 'major', ['vii°', 'I']], ['C', 'major', ['V7', 'I']], ['C', 'major', ['I']],
  ['C', 'minor', ['i', 'iv', 'V', 'i']], ['A', 'minor', ['i', 'VI', 'III', 'VII']], ['D', 'minor', ['i', 'iv', 'v', 'i']], ['E', 'minor', ['i', 'VII', 'VI', 'V']], ['F#', 'minor', ['i', 'iv', 'i']],
  ['C', 'dorian', ['i', 'IV', 'i']], ['D', 'phrygian', ['i', 'II', 'i']], ['F', 'lydian', ['I', 'II', 'I']], ['G', 'mixolydian', ['I', 'VII', 'IV', 'I']],
  ['C', 'major', []],
  ['C', 'bogus', ['I']], ['C', 'major', ['Q']],
];

let booted: any = null;
async function boot(): Promise<any> {
  if (booted) return booted;
  const py = await engine();
  try { py.FS.mkdir('/bundle/user-vault'); } catch { /* exists */ }
  py.FS.writeFile('/bundle/user-vault/chord_progression.md', SHIPPED);
  py.FS.writeFile('/bundle/user-vault/chord_progression_before.md', BEFORE);
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
const panel = (py: any, snippetId: string) => {
  const derivedEnums = call(py, '_forge_get_input_enums', snippetId) as Record<string, string[]>;
  const defaults = call(py, '_forge_get_input_defaults', snippetId) as Record<string, string>;
  return { derivedEnums, defaults, fields: buildInputFieldModels({ inputs: ['key_name', 'mode_name', 'progression'], cached: {}, enums: {}, widgets: {}, defaults, derivedEnums }) };
};

test('the shipped note is Description-sourced, with the three inputs required (no defaults), and the panel shows the same three text fields as the note it replaces (mode_name is a plain str: the service did not type it as an enum)', async () => {
  const py = await boot();
  assert.match(SHIPPED, /^source_facet: description$/m);
  for (const id of ['chord_progression_before', 'chord_progression']) {
    const p = panel(py, id);
    assert.deepEqual(p.derivedEnums, {}, `${id}: no enum`);
    assert.deepEqual(p.defaults, {}, `${id}: no default: all three are required`);
    assert.deepEqual(p.fields.map((f) => [f.name, f.kind, (f as { value: string }).value]), [['key_name', 'text', ''], ['mode_name', 'text', ''], ['progression', 'text', '']], id);
  }
});

test('nothing moves: the old and the new Python give the same Score for 24 stated rows (key, mode, progression), through the real form; the two refused rows are refused the same way', async () => {
  const py = await boot();
  const oldPy = extractPythonSection(BEFORE), newPy = extractPythonSection(SHIPPED);
  assert.ok(oldPy && newPy && oldPy !== newPy, 'two different texts are compared');
  py.globals.set('_t_old', oldPy); py.globals.set('_t_new', newPy); py.globals.set('_t_rows', JSON.stringify(ROWS));
  const out = JSON.parse(py.runPython(`
import json
from forge.music.lib import form
from music21 import harmony, chord, key, meter, tempo
def _load(src):
    ns = {'form': form}
    exec(src, ns)
    return ns['compute']
_old, _new = _load(_t_old), _load(_t_new)
def _ser(score):
    ms = []
    for m in score.recurse().getElementsByClass('Measure'):
        ms.append({'n': m.number, 'symbols': [c.figure for c in m.getElementsByClass(harmony.ChordSymbol)],
                   'chords': [[p.nameWithOctave for p in c.pitches] + [c.quarterLength] for c in m.getElementsByClass(chord.Chord) if not isinstance(c, harmony.ChordSymbol)]})
    k = score.recurse().getElementsByClass(key.Key); t = score.recurse().getElementsByClass(meter.TimeSignature); mm = score.recurse().getElementsByClass(tempo.MetronomeMark)
    return {'key': [[x.tonic.name, x.mode] for x in k], 'ts': [x.ratioString for x in t], 'bpm': [x.number for x in mm], 'measures': ms}
def _run(f, row):
    try:
        return {'ok': _ser(f(None, row[0], row[1], row[2]))}
    except Exception as e:
        return {'err': type(e).__name__}
json.dumps([[row, _run(_old, row), _run(_new, row)] for row in json.loads(_t_rows)])
`));
  assert.equal(out.length, 24);
  for (const [row, before, after] of out) assert.deepEqual(after, before, JSON.stringify(row));
  const ok = out.filter((r: any) => 'ok' in r[1]);
  assert.equal(ok.length, 22, 'sanity: 22 rows are drawn, 2 are refused');
  assert.deepEqual(out.slice(22).map((r: any) => [r[1].err, r[2].err]), [['ScaleException', 'ScaleException'], [out[23][1].err, out[23][1].err]]);
  assert.ok(out[23][1].err, 'the bad numeral is refused (not drawn)');
  assert.deepEqual(out[0][2].ok.ts, ['4/4'], 'the new note keeps 4/4'); assert.deepEqual(out[0][2].ok.bpm, [90], 'and 90 BPM');
  assert.deepEqual(out[0][2].ok.measures.map((m: any) => m.symbols[0]), ['C', 'F', 'C', 'G', 'C'], 'sanity: I IV I V I in C major is C F C G C (the comparison is not of two empty Scores)');
  assert.equal(ok.every((r: any) => r[1].ok.measures.length === ROWS[out.indexOf(r)][2].length), true, 'a bar per numeral');
});
