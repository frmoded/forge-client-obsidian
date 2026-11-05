// 2026-11-04-1172 (Scale Explorer 3 of 4): the pure half of free mode: the toggle, the readout for stated sets of notes (30 of them: triads in every inversion, sevenths, two notes, one note, a cluster that gives no name), the Roman numeral
// "in" the chosen scale, the outside-notes sentence, and the spelling by the key. Expected values are stated from music theory, not copied from output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FREE_HINT, clefFor, freeReadout, inKey, intervalLongName, outsideSentence, pickedNotes, spellInKey, toggleKey, type FreeKey } from './free-mode-core.ts';
import { SCALE_TYPES, scaleNotes, tonicNamesFor } from './scale-explorer-core.ts';

const C: FreeKey = { tonic: 'C', scale: 'major' };

test('toggleKey adds a key, removes it on the second click, and keeps the picked notes ascending without duplicates, across octaves', () => {
  let p: number[] = [];
  p = toggleKey(p, 67); p = toggleKey(p, 60); p = toggleKey(p, 64); p = toggleKey(p, 72);
  assert.deepEqual(p, [60, 64, 67, 72]);
  p = toggleKey(p, 64);
  assert.deepEqual(p, [60, 67, 72]);
  p = toggleKey(p, 64); p = toggleKey(p, 64); p = toggleKey(p, 64);
  assert.deepEqual(p, [60, 64, 67, 72]);
  assert.deepEqual(toggleKey([], 48), [48]);
  assert.deepEqual(toggleKey([48], 48), []);
});

test('toggleKey does not mutate its input', () => {
  const a = [60, 64];
  const b = toggleKey(a, 67);
  assert.deepEqual(a, [60, 64]);
  assert.notEqual(a, b);
});

// [picked midi numbers, key, headline, roman, outside, also]
type Row = [string, number[], FreeKey, string, string | null, string | null, string[]?];
const ROWS: Row[] = [
  ['nothing: the hint', [], C, FREE_HINT, null, null],
  ['one note', [60], C, 'C4', null, null],
  ['one note outside the key', [61], C, 'C#4', null, 'C# is not in C major'],
  ['two notes: major third', [60, 64], C, 'major third', null, null],
  ['two notes: perfect fifth', [60, 67], C, 'perfect fifth', null, null],
  ['two notes: octave', [60, 72], C, 'octave', null, null],
  ['two notes: a tenth is a major third plus an octave', [60, 76], C, 'major third plus an octave', null, null],
  ['two notes: tritone, one outside', [60, 66], C, 'tritone', null, 'F# is not in C major'],
  ['C major, root position', [60, 64, 67], C, 'C major', 'I in C major', null],
  ['D minor', [62, 65, 69], C, 'D minor', 'ii in C major', null],
  ['E minor', [64, 67, 71], C, 'E minor', 'iii in C major', null],
  ['F major', [65, 69, 72], C, 'F major', 'IV in C major', null],
  ['G major', [67, 71, 74], C, 'G major', 'V in C major', null],
  ['A minor', [69, 72, 76], C, 'A minor', 'vi in C major', null],
  ['B diminished', [71, 74, 77], C, 'B diminished', 'vii° in C major', null],
  ['C major, first inversion (C/E)', [64, 67, 72], C, 'C major/E', 'I6 in C major', null],
  ['C major, second inversion (C/G)', [67, 72, 76], C, 'C major/G', 'I64 in C major', null],
  ['G7', [67, 71, 74, 77], C, 'G7', 'V7 in C major', null],
  ['G7/B (first inversion)', [59, 62, 65, 67], C, 'G7/B', 'V65 in C major', null],
  ['G7/D (second inversion)', [62, 65, 67, 71], C, 'G7/D', 'V43 in C major', null],
  ['G7/F (third inversion)', [53, 55, 59, 62], C, 'G7/F', 'V42 in C major', null],
  ['Cmaj7', [60, 64, 67, 71], C, 'Cmaj7', 'Imaj7 in C major', null],
  ['Bm7b5', [59, 62, 65, 69], C, 'Bm7b5', 'viiø7 in C major', null],
  ['C and A: C E G A reads Am7 over its third (C6 is not in the table)', [60, 64, 67, 69], C, 'Am7/C', 'vi65 in C major', null],
  ['a set with no name: sus2', [60, 62, 67], C, 'No chord name: P1 M2 P5 above C', null, null],
  ['a cluster: no name, two notes outside', [60, 61, 62, 63], C, 'No chord name: P1 m2 M2 m3 above C', null, 'C# and D# are not in C major'],
  ['C major with a wrong note added: no name (never a wrong one), F# outside', [60, 64, 66, 67], C, 'No chord name: P1 M3 d5 P5 above C', null, 'F# is not in C major'],
  ['C major in the key of C with a note an octave up (doubled): still C major', [60, 64, 67, 72], C, 'C major', 'I in C major', null],
  ['augmented: outside the key, so no numeral', [60, 64, 68], C, 'C augmented', null, 'G# is not in C major', ['G#aug/C', 'Eaug/C']],
  ['dim7 (B D F G#), outside the key', [59, 62, 65, 68], C, 'Bdim7', null, 'G# is not in C major'],
];

for (const [name, picked, key, headline, roman, outside, also] of ROWS) {
  test(`readout: ${name}`, () => {
    const r = freeReadout(picked, key);
    assert.equal(r.headline, headline, name);
    assert.equal(r.roman, roman, `${name}: numeral`);
    assert.equal(r.outside, outside, `${name}: outside`);
    if (also) assert.deepEqual(r.also, also, `${name}: also`);
  });
}

test('the dim7 set lists its three other readings as "also:", best first (inversion 1, 2, 3)', () => {
  const r = freeReadout([59, 62, 65, 68], C);
  assert.equal(r.also.length, 3);
  assert.ok(r.also.every((n) => /dim7\/B$/.test(n)), r.also.join(' '));
});

test('the readout kinds: none, note, interval, chord, unnamed', () => {
  assert.deepEqual([[], [60], [60, 64], [60, 64, 67], [60, 62, 67]].map((p) => freeReadout(p, C).kind), ['none', 'note', 'interval', 'chord', 'unnamed']);
});

test('a note and an interval with notes outside the key say so; a set with a name AND outside notes gets the sentence INSTEAD of a numeral; all in the key with a name gets the numeral and no sentence', () => {
  const a = freeReadout([60, 64, 67, 70], C);                                  // C7: Bb is not in C major
  assert.equal(a.headline, 'C7'); assert.equal(a.roman, null); assert.equal(a.outside, 'A# is not in C major', 'a note outside the key is named with a sharp (the piano\'s own name for the key)');
  const b = freeReadout([60, 64, 67], C);
  assert.equal(b.outside, null); assert.equal(b.roman, 'I in C major');
});

test('the outside notes are named once each, in pitch order, in a sentence: one, two, three', () => {
  assert.equal(outsideSentence(['F#'], C), 'F# is not in C major');
  assert.equal(outsideSentence(['F#', 'A#'], C), 'F# and A# are not in C major');
  assert.equal(outsideSentence(['C#', 'F#', 'A#'], C), 'C#, F# and A# are not in C major');
  assert.equal(freeReadout([61, 73, 66], C).outside, 'C# and F# are not in C major', 'C#4 and C#5 are one pitch class');
});

test('the key is the scale the dropdowns set: the same notes are I in C, V in F, IV in G; and a minor key changes the numeral case', () => {
  assert.equal(freeReadout([60, 64, 67], { tonic: 'C', scale: 'major' }).roman, 'I in C major');
  assert.equal(freeReadout([60, 64, 67], { tonic: 'F', scale: 'major' }).roman, 'V in F major');
  assert.equal(freeReadout([60, 64, 67], { tonic: 'G', scale: 'major' }).roman, 'IV in G major');
  assert.equal(freeReadout([57, 60, 64], { tonic: 'A', scale: 'natural minor' }).roman, 'i in A minor');
  assert.equal(freeReadout([62, 65, 69], { tonic: 'D', scale: 'natural minor' }).roman, 'i in D minor');
  assert.equal(freeReadout([65, 69, 72], { tonic: 'D', scale: 'natural minor' }).roman, 'III in D minor');
  assert.equal(freeReadout([70, 74, 77], { tonic: 'D', scale: 'natural minor' }).roman, 'VI in D minor');
  assert.equal(freeReadout([62, 66, 69], { tonic: 'G', scale: 'major' }).roman, 'V in G major');
  assert.equal(freeReadout([69, 73, 76], { tonic: 'A', scale: 'harmonic minor' }).outside, 'C# is not in A harmonic minor');
});

test('the scale spells the notes: Eb minor has Cb (the key\'s own name for midi 71) and its i and VI chords are named from that', () => {
  const eb: FreeKey = { tonic: 'Eb', scale: 'natural minor' };
  assert.equal(spellInKey(71, eb), 'Cb5');
  assert.equal(spellInKey(63, eb), 'Eb4');
  assert.equal(spellInKey(61, C), 'C#4', 'out of the key: sharps');
  assert.equal(freeReadout([63, 66, 70], eb).headline, 'Eb minor');
  assert.equal(freeReadout([63, 66, 70], eb).roman, 'i in Eb minor');
  assert.equal(freeReadout([71, 75, 78], eb).headline, 'Cb major');
  assert.equal(freeReadout([71, 75, 78], eb).roman, 'VI in Eb minor');
});

test('intervalLongName: 0 to 12 by name, wider ones with "plus an octave"', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(intervalLongName), ['unison', 'minor second', 'major second', 'minor third', 'major third', 'perfect fourth', 'tritone', 'perfect fifth', 'minor sixth', 'major sixth', 'minor seventh', 'major seventh', 'octave']);
  assert.equal(intervalLongName(14), 'major second plus an octave');
  assert.equal(intervalLongName(24), 'two octaves');
  assert.equal(intervalLongName(-7), 'perfect fifth');
});

test('inKey', () => {
  assert.equal(inKey('F#', C), false); assert.equal(inKey('F', C), true); assert.equal(inKey('Cb', { tonic: 'Eb', scale: 'natural minor' }), true);
});

// ---- the gaps the mutation pass found (2026-11-04-1172, 370 mutants: 62 survived at first) ---------------------------------------------------------------------------------------------------

test('the hint is the words the prompt gives', () => {
  assert.equal(FREE_HINT, 'Click keys to build a chord');
});

test('PROPERTY: spellInKey gives every note of every scale (every type, every dropdown tonic, three octaves) the scale\'s own name and octave', () => {
  for (const type of SCALE_TYPES) for (const tonic of tonicNamesFor(type)) for (const octave of [2, 4, 6]) {
    for (const n of scaleNotes(tonic, type, octave)) assert.equal(spellInKey(n.midi, { tonic, scale: type }), n.name, `${tonic} ${type}: midi ${n.midi}`);
  }
});

test('out of the key every pitch class is named with a sharp: each of the seven natural letters is reached (C D E F G A B) by a key that lacks it', () => {
  assert.equal(freeReadout([60, 62, 64, 67, 69], { tonic: 'F#', scale: 'major' }).outside, 'C, D, E, G and A are not in F# major');
  assert.equal(freeReadout([71], { tonic: 'Db', scale: 'major' }).outside, 'B is not in Db major');
  assert.equal(freeReadout([65], { tonic: 'E', scale: 'major' }).outside, 'F is not in E major');
  assert.equal(freeReadout([61, 63, 66, 68, 70], C).outside, 'C#, D#, F#, G# and A# are not in C major');
  assert.equal(spellInKey(61, C), 'C#4'); assert.equal(spellInKey(70, C), 'A#4'); assert.equal(spellInKey(59 + 12, { tonic: 'Db', scale: 'major' }), 'B4');
});

test('wide intervals: 26 semitones is a major second plus 2 octaves, 36 is 3 octaves, 19 a perfect fifth plus an octave', () => {
  assert.equal(intervalLongName(13), 'minor second plus an octave');
  assert.equal(intervalLongName(26), 'major second plus 2 octaves');
  assert.equal(intervalLongName(36), '3 octaves');
  assert.equal(intervalLongName(19), 'perfect fifth plus an octave');
  assert.equal(freeReadout([48, 74], C).headline, 'major second plus 2 octaves');
});

test('pickedNotes: the picked keys as spelled notes for the staff, ascending (step, alter, octave, midi, name), spelled by the key', () => {
  const n = pickedNotes([67, 60, 66], C);
  assert.deepEqual(n.map((x) => [x.step, x.alter, x.octave, x.midi, x.name]), [['C', 0, 4, 60, 'C4'], ['F', 1, 4, 66, 'F#4'], ['G', 0, 4, 67, 'G4']]);
  const eb = pickedNotes([63, 71, 75], { tonic: 'Eb', scale: 'natural minor' });
  assert.deepEqual(eb.map((x) => [x.step, x.alter, x.octave, x.name]), [['E', -1, 4, 'Eb4'], ['C', -1, 5, 'Cb5'], ['E', -1, 5, 'Eb5']]);
  assert.deepEqual(pickedNotes([], C), []);
  assert.deepEqual(pickedNotes([46], C).map((x) => [x.step, x.alter, x.octave, x.name]), [['A', 1, 2, 'A#2']]);
});

test('clefFor: treble from G3 (55) up, bass below; no notes: treble', () => {
  assert.equal(clefFor([]), 'G');
  assert.equal(clefFor([55]), 'G');
  assert.equal(clefFor([54]), 'F');
  assert.equal(clefFor([48, 52, 55]), 'F');
  assert.equal(clefFor([60, 64]), 'G');
  assert.equal(clefFor([40, 76]), 'F', 'the lowest note decides');
});
