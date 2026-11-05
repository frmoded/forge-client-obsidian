// 2026-11-04-1172 (Scale Explorer 3 of 4): `diatonicChords` against the engine's music21 (real Pyodide, the vendored wheels, the engine bundle): for all 12 tonics (the dropdown's names) x major and natural minor, the triads and the sevenths
// music21's RomanNumeral gives in the key are the chords the table stacks, note for note (pitch names without octaves: the SPELLING agrees too); and the seven major-key triads that `chord_progression` realizes through the real `form`
// (the engine fixtures' route: forge.music.lib.form) in C, G and B-flat are the diatonic triads' pitches. Skipped (visibly) without the music wheels.
// Pins the MECHANISM (the table == music21 for these inputs); if music21's roman-numeral realization changes this SHOULD go red - reassess, don't just rewrite.
import { test as baseTest } from 'node:test';
import assert from 'node:assert/strict';

import { WHEELS_PRESENT, engine } from './test-support/real-rhythm-engine.ts';
import { diatonicChords } from './diatonic-chords-core.ts';
import { tonicNamesFor, type ScaleType } from './scale-explorer-core.ts';

const skip = WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels';
const test = (name: string, fn: () => Promise<void>) => baseTest(name, { skip, timeout: 300_000 }, fn);

const toM21 = (n: string) => n.replace(/b/g, '-').replace(/^-/, 'b');
const fromM21 = (n: string) => n.replace(/-/g, 'b');
const NUMERALS: Record<string, { triads: string[]; sevenths: string[]; mode: string }> = {
  major: { mode: 'major', triads: ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'viio'], sevenths: ['I7', 'ii7', 'iii7', 'IV7', 'V7', 'vi7', 'vii/o7'] },
  'natural minor': { mode: 'minor', triads: ['i', 'iio', 'III', 'iv', 'v', 'VI', 'VII'], sevenths: ['i7', 'ii/o7', 'III7', 'iv7', 'v7', 'VI7', 'VII7'] },
};

async function roman(py: any, tonic: string, mode: string, numerals: string[]): Promise<string[][]> {
  py.globals.set('_t', toM21(tonic));
  py.globals.set('_m', mode);
  py.globals.set('_n', numerals);
  return JSON.parse(py.runPython(['import json as _j', 'from music21 import key as _k, roman as _r', '_key = _k.Key(_t, _m)', '_j.dumps([[p.name for p in _r.RomanNumeral(n, _key).pitches] for n in _n])'].join('\n')));
}

for (const [type, spec] of Object.entries(NUMERALS)) {
  for (const sevenths of [false, true]) {
    test(`${type}: the ${sevenths ? 'seventh chords' : 'triads'} of all 12 tonics equal music21's RomanNumeral realization in the key, spelling included`, async () => {
      const py = await engine();
      let compared = 0;
      const odd: string[] = [];
      for (const tonic of tonicNamesFor(type as ScaleType)) {
        const theirs = await roman(py, tonic, spec.mode, sevenths ? spec.sevenths : spec.triads);
        const mine = diatonicChords(tonic, type as ScaleType, sevenths);
        mine.forEach((c, i) => {
          const want = theirs[i].map(fromM21);
          const got = c.notes.map((n) => n.name.replace(/\d+$/, ''));
          compared++;
          if (JSON.stringify(got) !== JSON.stringify(want)) odd.push(`${tonic} ${type} degree ${i + 1}: ours ${got.join(' ')} / music21 ${want.join(' ')}`);
        });
      }
      assert.deepEqual(odd, []);
      assert.equal(compared, 7 * 12);
    });
  }
}

test('the seven major-key triads that chord_progression realizes through the real engine (form) in C, G and B-flat are the diatonic triads\' pitches, bar by bar', async () => {
  const py = await engine();
  for (const key of ['C', 'G', 'Bb']) {
    py.globals.set('_k', toM21(key));
    const bars: string[][][] = JSON.parse(py.runPython([
      'import json as _j', 'from forge.music.lib import form as _form',
      '_s = _form(key_name=_k, mode_name="major", tempo_bpm=90, ts_str="4/4", progression=["I", "ii", "iii", "IV", "V", "vi", "vii°"])',
      '_o = []',
      'for _m in _s.recurse().getElementsByClass("Measure"):', '  _o.append([[p.nameWithOctave for p in _c.pitches] for _c in _m.recurse().getElementsByClass("Chord")])',
      '_j.dumps(_o)',
    ].join('\n')));
    assert.equal(bars.length, 7, `${key}: seven bars`);
    const mine = diatonicChords(key, 'major', false);
    bars.forEach((chords, i) => {
      assert.ok(chords.length >= 1);
      for (const chord of chords) assert.deepEqual(chord.map((n) => fromM21(n).replace(/\d+$/, '')), mine[i].notes.map((n) => n.name.replace(/\d+$/, '')), `${key} bar ${i + 1} (${mine[i].numeral} ${mine[i].label})`);
    });
  }
});

test('a control that can fail: a wrong chord (the ii of C major spelled as the IV) is caught by the same comparison', async () => {
  const py = await engine();
  const theirs = await roman(py, 'C', 'major', ['ii']);
  assert.notDeepEqual(diatonicChords('C', 'major', false)[3].notes.map((n) => n.name.replace(/\d+$/, '')), theirs[0].map(fromM21));
});
