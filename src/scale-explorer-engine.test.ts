// 2026-11-04-1170 (Scale Explorer 1 of 4): the TypeScript scale table against the engine's music21 (real Pyodide, the vendored wheels and the engine bundle, as composition-engine.test.ts boots them).
// Every one of the 21 plain tonic spellings (7 letters x natural / sharp / flat) x each of the 9 scale types the block knows: the pitch names with octaves must be music21's own (its `-` for a flat, `--` for a double flat, read as `b`).
// music21 knows every one of the 9: major, minor (natural), harmonic minor, melodic minor (ascending), Dorian, Phrygian, Lydian, Mixolydian, Locrian — so nothing is hand-pinned; "ionian" and "aeolian" are the block's names for major and natural minor.
// The engine's own `diatonic_scale` (major / minor only) is checked as well: it is the chip the vault teaches the scale with. Skipped (visibly) without the music wheels.
// Pins the MECHANISM (TS table == music21 for these inputs); if music21's spelling rule changes this SHOULD go red — reassess, don't just rewrite.
import { test as baseTest } from 'node:test';
import assert from 'node:assert/strict';

import { WHEELS_PRESENT, engine } from './test-support/real-rhythm-engine.ts';
import { SCALE_TYPES, scalePitches, tonicNamesFor, type ScaleType } from './scale-explorer-core.ts';

const skip = WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels';
const test = (name: string, fn: () => Promise<void>) => baseTest(name, { skip, timeout: 300_000 }, fn);

const M21_CLASS: Record<ScaleType, string> = {
  major: 'MajorScale', dorian: 'DorianScale', phrygian: 'PhrygianScale', lydian: 'LydianScale', mixolydian: 'MixolydianScale',
  'natural minor': 'MinorScale', locrian: 'LocrianScale', 'harmonic minor': 'HarmonicMinorScale', 'melodic minor': 'MelodicMinorScale',
};
const TONICS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'].flatMap((l) => [l, `${l}#`, `${l}b`]);

/** music21's ascending pitches from tonic{octave} to tonic{octave+1}, `-` read as `b`; null where music21 itself cannot build the scale (a tonic it refuses). */
async function m21(py: any, cls: string, tonic: string, octave: number): Promise<string[] | null> {
  py.globals.set('_t', tonic.replace(/b$/, '-'));
  py.globals.set('_o', octave);
  const out = py.runPython([
    'import json as _j',
    'from music21 import scale as _s',
    'try:',
    `  _sc = _s.${cls}(_t)`,
    '  _r = [p.nameWithOctave for p in _sc.getPitches(f"{_t}{_o}", f"{_t}{_o + 1}")]',
    'except Exception as _e:',
    '  _r = None',
    '_j.dumps(_r)',
  ].join('\n'));
  const names = JSON.parse(out) as string[] | null;
  return names ? names.map((n) => n.replace(/-/g, 'b')) : null;
}

test('the scale table equals music21 for every plain tonic spelling x every scale type (octave 4), double accidentals included', async () => {
  const py = await engine();
  let compared = 0;
  const mismatches: string[] = [];
  for (const type of SCALE_TYPES) {
    for (const tonic of TONICS) {
      const want = await m21(py, M21_CLASS[type], tonic, 4);
      if (!want) continue;
      compared++;
      const got = scalePitches(tonic, type, 4);
      if (JSON.stringify(got) !== JSON.stringify(want)) mismatches.push(`${tonic} ${type}: ours ${got.join(' ')} / music21 ${want.join(' ')}`);
    }
  }
  assert.deepEqual(mismatches, []);
  assert.ok(compared >= SCALE_TYPES.length * 15, `compared ${compared} scales: the check ran (non-vacuity)`);
});

test('the 12 dropdown tonics x the 9 types: all 108 are in music21 and equal to it, at octaves 3 and 5 too', async () => {
  const py = await engine();
  let compared = 0;
  for (const type of SCALE_TYPES) {
    for (const tonic of tonicNamesFor(type)) {
      for (const octave of [3, 4, 5]) {
        const want = await m21(py, M21_CLASS[type], tonic, octave);
        assert.ok(want, `music21 builds ${tonic} ${type}`);
        assert.deepEqual(scalePitches(tonic, type, octave), want, `${tonic}${octave} ${type}`);
        compared++;
      }
    }
  }
  assert.equal(compared, 12 * 9 * 3);
});

test('the engine\'s own diatonic_scale chip (major / minor) agrees with the table for the 12 tonics', async () => {
  const py = await engine();
  for (const [mode, type] of [['major', 'major'], ['minor', 'natural minor']] as const) {
    for (const tonic of tonicNamesFor(type)) {
      py.globals.set('_t', tonic.replace(/b$/, '-'));
      const out = py.runPython(['import json as _j', 'from forge.music.lib import diatonic_scale', `_j.dumps(diatonic_scale(_t, ${JSON.stringify(mode)}, [4, 5]))`].join('\n'));
      assert.deepEqual((JSON.parse(out) as string[]).map((n) => n.replace(/-/g, 'b')), scalePitches(tonic, type, 4), `${tonic} ${mode}`);
    }
  }
});

test('a control that can fail: a wrong table entry (Dorian with a major third) is caught by the same comparison', async () => {
  const py = await engine();
  const want = await m21(py, 'DorianScale', 'D', 4);
  assert.ok(want);
  assert.notDeepEqual(scalePitches('D', 'major', 4), want, 'D major is not D dorian: the comparison tells them apart');
});
