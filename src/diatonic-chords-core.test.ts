// 2026-11-04-1172 (Scale Explorer 3 of 4): the diatonic chords of a scale (stacked thirds on each degree, in the scale's own spelling) and the Roman numeral of a named chord in a scale. Stated tables for C major, A minor, G major, D natural minor
// (the four the prompt names) and A harmonic / melodic minor from their own notes; every scale type x 12 tonics builds without a gap. The engine check is diatonic-chords-engine.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diatonicChords, keyName, pcOfName, romanNumeral } from './diatonic-chords-core.ts';
import { SCALE_TYPES, tonicNamesFor, type ScaleType } from './scale-explorer-core.ts';

const row = (tonic: string, type: ScaleType, sevenths: boolean, field: 'numeral' | 'label') => diatonicChords(tonic, type, sevenths).map((c) => c[field]);

test('C major: the seven triads I ii iii IV V vi vii° named C Dm Em F G Am B°; the sevenths Imaj7 ii7 iii7 IVmaj7 V7 vi7 viiø7', () => {
  assert.deepEqual(row('C', 'major', false, 'numeral'), ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
  assert.deepEqual(row('C', 'major', false, 'label'), ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'B°']);
  assert.deepEqual(row('C', 'major', true, 'numeral'), ['Imaj7', 'ii7', 'iii7', 'IVmaj7', 'V7', 'vi7', 'viiø7']);
  assert.deepEqual(row('C', 'major', true, 'label'), ['Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'Am7', 'Bø7']);
});

test('G major (F# in the key): G Am Bm C D Em F#°, and the sevenths', () => {
  assert.deepEqual(row('G', 'major', false, 'label'), ['G', 'Am', 'Bm', 'C', 'D', 'Em', 'F#°']);
  assert.deepEqual(row('G', 'major', true, 'label'), ['Gmaj7', 'Am7', 'Bm7', 'Cmaj7', 'D7', 'Em7', 'F#ø7']);
  assert.deepEqual(row('G', 'major', false, 'numeral'), ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
});

test('A natural minor: i ii° III iv v VI VII = Am B° C Dm Em F G; the sevenths i7 iiø7 IIImaj7 iv7 v7 VImaj7 VII7', () => {
  assert.deepEqual(row('A', 'natural minor', false, 'numeral'), ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']);
  assert.deepEqual(row('A', 'natural minor', false, 'label'), ['Am', 'B°', 'C', 'Dm', 'Em', 'F', 'G']);
  assert.deepEqual(row('A', 'natural minor', true, 'numeral'), ['i7', 'iiø7', 'IIImaj7', 'iv7', 'v7', 'VImaj7', 'VII7']);
  assert.deepEqual(row('A', 'natural minor', true, 'label'), ['Am7', 'Bø7', 'Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7']);
});

test('D natural minor (Bb in the key): Dm E° F Gm Am Bb C', () => {
  assert.deepEqual(row('D', 'natural minor', false, 'label'), ['Dm', 'E°', 'F', 'Gm', 'Am', 'Bb', 'C']);
  assert.deepEqual(row('D', 'natural minor', false, 'numeral'), ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']);
  assert.deepEqual(row('D', 'natural minor', true, 'label'), ['Dm7', 'Eø7', 'Fmaj7', 'Gm7', 'Am7', 'Bbmaj7', 'C7']);
});

test('Eb natural minor is spelled by the SCALE (Cb, Db), not by the chord roots list: Ebm F° Gb Abm Bbm Cb Db', () => {
  assert.deepEqual(row('Eb', 'natural minor', false, 'label'), ['Ebm', 'F°', 'Gb', 'Abm', 'Bbm', 'Cb', 'Db']);
  assert.deepEqual(row('Eb', 'natural minor', false, 'numeral'), ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']);
});

test('harmonic minor builds on its OWN notes: A harmonic minor i ii° III+ iv V VI vii° = Am B° C+ Dm E F G#°; the sevenths include the minor-major and augmented-major sevenths the table does not name', () => {
  assert.deepEqual(row('A', 'harmonic minor', false, 'numeral'), ['i', 'ii°', 'III+', 'iv', 'V', 'VI', 'vii°']);
  assert.deepEqual(row('A', 'harmonic minor', false, 'label'), ['Am', 'B°', 'C+', 'Dm', 'E', 'F', 'G#°']);
  assert.deepEqual(row('A', 'harmonic minor', true, 'numeral'), ['imaj7', 'iiø7', 'III+maj7', 'iv7', 'V7', 'VImaj7', 'vii°7']);
  assert.deepEqual(row('A', 'harmonic minor', true, 'label'), ['Am(maj7)', 'Bø7', 'C+maj7', 'Dm7', 'E7', 'Fmaj7', 'G#°7']);
  assert.equal(diatonicChords('A', 'harmonic minor', true)[0].quality, null, 'not in the table');
});

test('melodic minor (ascending) from its own notes: A melodic minor i ii III+ IV V vi° vii° = Am Bm C+ D E F#° G#°', () => {
  assert.deepEqual(row('A', 'melodic minor', false, 'numeral'), ['i', 'ii', 'III+', 'IV', 'V', 'vi°', 'vii°']);
  assert.deepEqual(row('A', 'melodic minor', false, 'label'), ['Am', 'Bm', 'C+', 'D', 'E', 'F#°', 'G#°']);
  assert.deepEqual(row('A', 'melodic minor', true, 'label'), ['Am(maj7)', 'Bm7', 'C+maj7', 'D7', 'E7', 'F#ø7', 'G#ø7']);
});

test('the modes: D dorian is i ii III IV v vi° VII = Dm Em F G Am B° C', () => {
  assert.deepEqual(row('D', 'dorian', false, 'label'), ['Dm', 'Em', 'F', 'G', 'Am', 'B°', 'C']);
  assert.deepEqual(row('D', 'dorian', false, 'numeral'), ['i', 'ii', 'III', 'IV', 'v', 'vi°', 'VII']);
  assert.deepEqual(row('G', 'mixolydian', false, 'label'), ['G', 'Am', 'B°', 'C', 'Dm', 'Em', 'F']);
});

test('every scale type on every dropdown tonic, with and without sevenths, builds seven chords of 3 or 4 notes, ascending, each on its own degree (no chord the table cannot name)', () => {
  for (const type of SCALE_TYPES) for (const tonic of tonicNamesFor(type)) for (const sevenths of [false, true]) {
    const chords = diatonicChords(tonic, type, sevenths);
    assert.equal(chords.length, 7, `${tonic} ${type}`);
    chords.forEach((c, i) => {
      assert.equal(c.notes.length, sevenths ? 4 : 3);
      assert.ok(c.midis.every((m, j) => j === 0 || m > c.midis[j - 1]), 'ascending');
      assert.equal(c.degree, i + 1);
      assert.equal(c.root, c.notes[0].name.replace(/\d+$/, ''));
    });
  }
});

test('the chord tones come from the scale in octave 4 by default and a stated octave: C major V is G4 B4 D5; in octave 3 G3 B3 D4', () => {
  assert.deepEqual(diatonicChords('C', 'major')[4].notes.map((n) => n.name), ['G4', 'B4', 'D5']);
  assert.deepEqual(diatonicChords('C', 'major', false, 3)[4].midis, [55, 59, 62]);
  assert.deepEqual(diatonicChords('C', 'major', true)[4].midis, [67, 71, 74, 77]);
});

// ---- romanNumeral ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('romanNumeral: every diatonic triad and seventh of C major, A minor, G major and D natural minor, from the chord\'s name (root + quality), equals the row\'s numeral', () => {
  for (const [tonic, type] of [['C', 'major'], ['A', 'natural minor'], ['G', 'major'], ['D', 'natural minor']] as const) {
    for (const sevenths of [false, true]) {
      for (const c of diatonicChords(tonic, type, sevenths)) assert.equal(romanNumeral({ root: c.root, quality: c.quality! }, tonic, type), c.numeral, `${c.label} in ${tonic} ${type}`);
    }
  }
});

test('romanNumeral: case by the third, ° + ø7 °7 maj7 7 suffixes, the key\'s own spelling decides the degree (Cb is VI in Eb minor)', () => {
  assert.equal(romanNumeral({ root: 'G', quality: 'major' }, 'C', 'major'), 'V');
  assert.equal(romanNumeral({ root: 'G', quality: 'dom7' }, 'C', 'major'), 'V7');
  assert.equal(romanNumeral({ root: 'D', quality: 'minor' }, 'C', 'major'), 'ii');
  assert.equal(romanNumeral({ root: 'B', quality: 'diminished' }, 'C', 'major'), 'vii°');
  assert.equal(romanNumeral({ root: 'B', quality: 'half_dim7' }, 'C', 'major'), 'viiø7');
  assert.equal(romanNumeral({ root: 'F', quality: 'maj7' }, 'C', 'major'), 'IVmaj7');
  assert.equal(romanNumeral({ root: 'C', quality: 'augmented' }, 'A', 'harmonic minor'), 'III+');
  assert.equal(romanNumeral({ root: 'G#', quality: 'dim7' }, 'A', 'harmonic minor'), 'vii°7');
  assert.equal(romanNumeral({ root: 'Cb', quality: 'major' }, 'Eb', 'natural minor'), 'VI');
  assert.equal(romanNumeral({ root: 'G', quality: 'dom9' }, 'C', 'major'), 'V9');
});

test('romanNumeral: a chord whose root is not in the scale has none (null): no borrowed-chord numerals', () => {
  assert.equal(romanNumeral({ root: 'F#', quality: 'major' }, 'C', 'major'), null);
  assert.equal(romanNumeral({ root: 'Eb', quality: 'major' }, 'C', 'major'), null);
});

test('romanNumeral: inversion figures (the table\'s inversion number): I6 I64, V65 V43 V42, viiø65, IVmaj65; a 9th/11th/13th chord in inversion has none', () => {
  assert.equal(romanNumeral({ root: 'C', quality: 'major', inversion: 1 }, 'C', 'major'), 'I6');
  assert.equal(romanNumeral({ root: 'C', quality: 'major', inversion: 2 }, 'C', 'major'), 'I64');
  assert.equal(romanNumeral({ root: 'G', quality: 'dom7', inversion: 1 }, 'C', 'major'), 'V65');
  assert.equal(romanNumeral({ root: 'G', quality: 'dom7', inversion: 2 }, 'C', 'major'), 'V43');
  assert.equal(romanNumeral({ root: 'G', quality: 'dom7', inversion: 3 }, 'C', 'major'), 'V42');
  assert.equal(romanNumeral({ root: 'D', quality: 'minor', inversion: 1 }, 'C', 'major'), 'ii6');
  assert.equal(romanNumeral({ root: 'B', quality: 'diminished', inversion: 1 }, 'C', 'major'), 'vii°6');
  assert.equal(romanNumeral({ root: 'B', quality: 'half_dim7', inversion: 1 }, 'C', 'major'), 'viiø65');
  assert.equal(romanNumeral({ root: 'F', quality: 'maj7', inversion: 2 }, 'C', 'major'), 'IVmaj43');
  assert.equal(romanNumeral({ root: 'G', quality: 'dom9', inversion: 1 }, 'C', 'major'), null);
});

test('keyName and pcOfName', () => {
  assert.equal(keyName('C', 'major'), 'C major');
  assert.equal(keyName('A', 'natural minor'), 'A minor');
  assert.equal(keyName('D', 'dorian'), 'D dorian');
  assert.equal(keyName('A', 'harmonic minor'), 'A harmonic minor');
  assert.deepEqual(['C', 'C#', 'Db', 'Cb', 'B#', 'F##', 'Bbb'].map(pcOfName), [0, 1, 1, 11, 0, 7, 9]);
  assert.throws(() => pcOfName('H'), /not a note name/);
});

// ---- the gaps the mutation pass found (2026-11-04-1172) ---------------------------------------------------------------------------------------------------------------------------------------
test('the modes with an upper-case II and a diminished fourth: C lydian is I II iii iv° V vi vii = C D Em F#° G Am Bm', () => {
  assert.deepEqual(row('C', 'lydian', false, 'numeral'), ['I', 'II', 'iii', 'iv°', 'V', 'vi', 'vii']);
  assert.deepEqual(row('C', 'lydian', false, 'label'), ['C', 'D', 'Em', 'F#°', 'G', 'Am', 'Bm']);
  assert.deepEqual(row('E', 'phrygian', false, 'numeral'), ['i', 'II', 'III', 'iv', 'v°', 'VI', 'vii']);
});

test('each chord carries its table name, root and quality: Cdim for B° is "Bdim", the extra sevenths are named by their symbol, an augmented triad is "Caug"', () => {
  const c = diatonicChords('C', 'major');
  assert.deepEqual([c[6].name, c[6].quality, c[6].root], ['Bdim', 'diminished', 'B']);
  assert.deepEqual([c[1].name, c[1].quality], ['Dm', 'minor']);
  const h = diatonicChords('A', 'harmonic minor');
  assert.deepEqual([h[2].name, h[2].quality], ['Caug', 'augmented']);
  const h7 = diatonicChords('A', 'harmonic minor', true);
  assert.deepEqual([h7[0].name, h7[0].quality, h7[0].root, h7[2].name], ['Am(maj7)', null, 'A', 'C+maj7']);
});

test('romanNumeral: the ninth, eleventh and thirteenth are upper case with their number; the augmented and diminished-seventh inversions keep their sign; a dim7 in inversion is vii°65', () => {
  assert.equal(romanNumeral({ root: 'G', quality: 'dom11' }, 'C', 'major'), 'V11');
  assert.equal(romanNumeral({ root: 'G', quality: 'dom13' }, 'C', 'major'), 'V13');
  assert.equal(romanNumeral({ root: 'G', quality: 'dom9' }, 'C', 'major'), 'V9');
  assert.equal(romanNumeral({ root: 'C', quality: 'augmented', inversion: 1 }, 'A', 'harmonic minor'), 'III+6');
  assert.equal(romanNumeral({ root: 'G#', quality: 'dim7', inversion: 1 }, 'A', 'harmonic minor'), 'vii°65');
  assert.equal(romanNumeral({ root: 'G#', quality: 'dim7', inversion: 3 }, 'A', 'harmonic minor'), 'vii°42');
  assert.equal(romanNumeral({ root: 'D', quality: 'min7', inversion: 2 }, 'C', 'major'), 'ii43');
  assert.equal(romanNumeral({ root: 'B', quality: 'diminished', inversion: 2 }, 'C', 'major'), 'vii°64');
  assert.equal(romanNumeral({ root: 'G', quality: 'major', inversion: 3 }, 'C', 'major'), 'V', 'a triad has no third inversion: no figure');
});

test('pcOfName: double flats and sharps wrap round the octave', () => {
  assert.equal(pcOfName('Cbb'), 10);
  assert.equal(pcOfName('B##'), 1);
  assert.equal(pcOfName('Fb'), 4);
});
