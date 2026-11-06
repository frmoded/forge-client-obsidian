// 2026-11-05-1188 (Scale Explorer: `mode: triad`) - the pure half. `triadOfDegree(tonic, type, degree)` is one of the seven triads `diatonicChords(..., sevenths=false)` stacks on the scale (never re-derived): checked for all 7 degrees of
// major, natural minor, harmonic minor (the one with an augmented triad on III) and dorian in 3 tonics against it; the 12 tonics x major/minor against music21 are in triad-mode-engine.test.ts. The wrap past the octave, the readout
// sentence, the legend wording, no seventh anywhere, which noteheads of the 8-note scale staff carry 1, 3, 5.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { diatonicChords } from './diatonic-chords-core.ts';
import { SCALE_TYPES, scaleNotes, type ScaleType } from './scale-explorer-core.ts';
import { TRIAD_LEGEND, degreeOfStaffIndex, scaleStaffIndexes, triadOfDegree, triadReadout } from './triad-mode-core.ts';

const TONICS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const names = (t: { root: string; third: string; fifth: string }): string => [t.root, t.third, t.fifth].join(' ');

test('all 7 degrees of major, natural minor, harmonic minor and dorian in 3 tonics are the triads diatonicChords stacks: notes, spelling, quality, numeral, symbol', () => {
  let compared = 0;
  for (const type of ['major', 'natural minor', 'harmonic minor', 'dorian'] as ScaleType[]) {
    for (const tonic of ['C', 'Eb', 'F#']) {
      const chords = diatonicChords(tonic, type, false, 4);
      for (let degree = 1; degree <= 7; degree++) {
        const t = triadOfDegree(tonic, type, degree);
        const c = chords[degree - 1];
        const where = `${tonic} ${type} degree ${degree}`;
        assert.deepEqual(t.midis, c.midis, where);
        assert.equal(names(t), c.notes.map((n) => n.name.replace(/\d+$/, '')).join(' '), `${where}: the spelling`);
        assert.equal(t.quality, c.quality, where);
        assert.equal(t.numeral, c.numeral, where);
        assert.equal(t.label, c.label, where);
        assert.equal(t.degree, degree);
        compared++;
      }
    }
  }
  assert.equal(compared, 4 * 3 * 7);
});

test('the facts a person checks by hand: C major vi is A minor (A C E), vii° is B diminished (B D F), ii is D minor; A harmonic minor III is C augmented (C E G#); the names are the existing chord naming', () => {
  const vi = triadOfDegree('C', 'major', 6);
  assert.deepEqual([vi.root, vi.third, vi.fifth, vi.quality, vi.numeral, vi.title, vi.label], ['A', 'C', 'E', 'minor', 'vi', 'A minor', 'Am']);
  const vii = triadOfDegree('C', 'major', 7);
  assert.deepEqual([vii.root, vii.third, vii.fifth, vii.quality, vii.numeral, vii.title], ['B', 'D', 'F', 'diminished', 'vii°', 'B diminished']);
  assert.deepEqual([triadOfDegree('C', 'major', 2).title, triadOfDegree('C', 'major', 2).numeral], ['D minor', 'ii']);
  const III = triadOfDegree('A', 'harmonic minor', 3);
  assert.deepEqual([III.root, III.third, III.fifth, III.quality, III.numeral, III.title, III.label], ['C', 'E', 'G#', 'augmented', 'III+', 'C augmented', 'C+']);
  assert.notEqual(triadOfDegree('C', 'major', 6).title, triadOfDegree('C', 'major', 2).title, 'CONTROL: another degree is another triad');
});

test('degrees past the octave wrap: the root 6 of C major gives degrees 6, 1 and 3 (and its notes go up: A4 C5 E5); the 3 notes are ascending', () => {
  const t = triadOfDegree('C', 'major', 6);
  assert.deepEqual(t.degrees, [6, 1, 3]);
  assert.deepEqual(t.midis, [69, 72, 76]);
  assert.deepEqual(triadOfDegree('C', 'major', 7).degrees, [7, 2, 4]);
  assert.deepEqual(triadOfDegree('C', 'major', 2).degrees, [2, 4, 6]);
  assert.deepEqual(triadOfDegree('C', 'major', 1).degrees, [1, 3, 5]);
  for (const type of SCALE_TYPES) for (const tonic of TONICS) for (let d = 1; d <= 7; d++) {
    const m = triadOfDegree(tonic, type, d).midis;
    assert.ok(m[0] < m[1] && m[1] < m[2], `${tonic} ${type} ${d}: ${m.join(' ')}`);
  }
});

test('the triad follows the scale\'s own notes: its three notes are the scale\'s degrees d, d+2, d+4 (by pitch class), for every type and tonic', () => {
  for (const type of SCALE_TYPES) for (const tonic of TONICS) {
    const pcs = scaleNotes(tonic, type, 4).slice(0, 7).map((n) => ((n.midi % 12) + 12) % 12);
    for (let d = 1; d <= 7; d++) {
      const t = triadOfDegree(tonic, type, d);
      assert.deepEqual(t.midis.map((m) => m % 12), t.degrees.map((x) => pcs[x - 1]), `${tonic} ${type} ${d}`);
    }
  }
});

test('NO sevenths: every triad of every type and tonic has three notes, one of four triad qualities, and no digit 7 or the word seventh in its numeral, symbol or name (the readout says "degree 7" only as a degree)', () => {
  for (const type of SCALE_TYPES) for (const tonic of TONICS) for (let d = 1; d <= 7; d++) {
    const t = triadOfDegree(tonic, type, d);
    assert.equal(t.notes.length, 3);
    assert.ok(['major', 'minor', 'diminished', 'augmented'].includes(t.quality), `${tonic} ${type} ${d}: ${t.quality}`);
    for (const text of [t.numeral, t.label, t.title]) assert.ok(!/7|seventh/i.test(text), `${tonic} ${type} ${d}: "${text}"`);
    assert.ok(!/seventh/i.test(triadReadout(t, tonic, type)));
  }
  assert.ok(!/seventh|7/i.test(TRIAD_LEGEND), 'the legend says nothing of sevenths');
});

test('the readout sentence: "D minor: degrees 2, 4 and 6 of C major, the ii chord"; the key is named the way keyName names it (natural minor is "minor")', () => {
  assert.equal(triadReadout(triadOfDegree('C', 'major', 2), 'C', 'major'), 'D minor: degrees 2, 4 and 6 of C major, the ii chord');
  assert.equal(triadReadout(triadOfDegree('C', 'major', 6), 'C', 'major'), 'A minor: degrees 6, 1 and 3 of C major, the vi chord');
  assert.equal(triadReadout(triadOfDegree('C', 'major', 7), 'C', 'major'), 'B diminished: degrees 7, 2 and 4 of C major, the vii° chord');
  assert.equal(triadReadout(triadOfDegree('A', 'harmonic minor', 3), 'A', 'harmonic minor'), 'C augmented: degrees 3, 5 and 7 of A harmonic minor, the III+ chord');
  assert.equal(triadReadout(triadOfDegree('A', 'natural minor', 1), 'A', 'natural minor'), 'A minor: degrees 1, 3 and 5 of A minor, the i chord');
});

test('the legend wording is the driver\'s, verbatim', () => {
  assert.equal(TRIAD_LEGEND, 'Roman numeral = the degree of the root. Capital = major triad, small = minor, ° = diminished, + = augmented.');
});

test('which noteheads of the 8-note scale staff carry 1, 3, 5: the root\'s, then every other note up; what runs past the top wraps to the same note\'s first place; a click on the octave note picks degree 1', () => {
  assert.deepEqual(scaleStaffIndexes(1), [0, 2, 4]);
  assert.deepEqual(scaleStaffIndexes(2), [1, 3, 5]);
  assert.deepEqual(scaleStaffIndexes(5), [4, 6, 1], 'G B and the D that is past the top: its first place, index 1');
  assert.deepEqual(scaleStaffIndexes(6), [5, 7, 2], 'A, the octave C (index 7), and E at 2');
  assert.deepEqual(scaleStaffIndexes(7), [6, 1, 3]);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(degreeOfStaffIndex), [1, 2, 3, 4, 5, 6, 7, 1]);
  // the marked notes are the triad's notes by pitch class, for every degree
  const scale = scaleNotes('C', 'major', 4);
  for (let d = 1; d <= 7; d++) {
    const t = triadOfDegree('C', 'major', d);
    assert.deepEqual(scaleStaffIndexes(d).map((i) => scale[i].midi % 12), t.midis.map((m) => m % 12), `degree ${d}`);
  }
});

test('a degree that is not 1..7 is refused with a RangeError (never a silent wrong triad)', () => {
  for (const bad of [0, 8, -1, 1.5, Number.NaN]) {
    assert.throws(() => triadOfDegree('C', 'major', bad), RangeError, String(bad));
    assert.throws(() => scaleStaffIndexes(bad), RangeError, String(bad));
  }
});
