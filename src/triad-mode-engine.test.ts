// 2026-11-05-1188 (Scale Explorer: `mode: triad`): `triadOfDegree` against the engine's music21 (real Pyodide, the vendored wheels, the engine bundle): for all 12 tonics (the dropdown's names) x major and natural minor, the triad on each of
// the seven degrees is the triad music21's RomanNumeral gives in the key, pitch names (spelling included) and the chord's quality (major / minor / diminished) agreeing. Skipped (visibly) without the music wheels.
// Pins the MECHANISM (our triads == music21's for these inputs); if music21's roman-numeral realization changes this SHOULD go red - reassess, don't just rewrite.
import { test as baseTest } from 'node:test';
import assert from 'node:assert/strict';

import { WHEELS_PRESENT, engine } from './test-support/real-rhythm-engine.ts';
import { tonicNamesFor, type ScaleType } from './scale-explorer-core.ts';
import { triadOfDegree } from './triad-mode-core.ts';

const skip = WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels';
const test = (name: string, fn: () => Promise<void>) => baseTest(name, { skip, timeout: 300_000 }, fn);

const toM21 = (n: string) => n.replace(/b/g, '-').replace(/^-/, 'b');
const fromM21 = (n: string) => n.replace(/-/g, 'b');
const KEYS: Record<string, { mode: string; numerals: string[]; qualities: string[] }> = {
  major: { mode: 'major', numerals: ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'viio'], qualities: ['major', 'minor', 'minor', 'major', 'major', 'minor', 'diminished'] },
  'natural minor': { mode: 'minor', numerals: ['i', 'iio', 'III', 'iv', 'v', 'VI', 'VII'], qualities: ['minor', 'diminished', 'major', 'minor', 'minor', 'major', 'major'] },
};

for (const [type, spec] of Object.entries(KEYS)) {
  test(`${type}: the triad on each degree, in all 12 tonics, is music21's RomanNumeral triad in the key (notes, spelling, quality)`, async () => {
    const py = await engine();
    let compared = 0;
    const odd: string[] = [];
    for (const tonic of tonicNamesFor(type as ScaleType)) {
      py.globals.set('_t', toM21(tonic));
      py.globals.set('_m', spec.mode);
      py.globals.set('_n', spec.numerals);
      const theirs: { pitches: string[]; quality: string }[] = JSON.parse(py.runPython([
        'import json as _j', 'from music21 import key as _k, roman as _r', '_key = _k.Key(_t, _m)',
        '_j.dumps([{"pitches": [p.name for p in _r.RomanNumeral(n, _key).pitches], "quality": _r.RomanNumeral(n, _key).quality} for n in _n])',
      ].join('\n')));
      for (let d = 1; d <= 7; d++) {
        const t = triadOfDegree(tonic, type as ScaleType, d);
        const want = theirs[d - 1].pitches.map(fromM21);
        compared++;
        if ([t.root, t.third, t.fifth].join(' ') !== want.join(' ')) odd.push(`${tonic} ${type} degree ${d}: ours ${t.root} ${t.third} ${t.fifth} / music21 ${want.join(' ')}`);
        if (t.quality !== spec.qualities[d - 1] || theirs[d - 1].quality !== spec.qualities[d - 1]) odd.push(`${tonic} ${type} degree ${d}: quality ours ${t.quality} / music21 ${theirs[d - 1].quality} / expected ${spec.qualities[d - 1]}`);
      }
    }
    assert.deepEqual(odd, []);
    assert.equal(compared, 7 * 12);
  });
}
