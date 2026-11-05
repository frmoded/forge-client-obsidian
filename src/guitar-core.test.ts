// 2026-11-04-1173 (Scale Explorer 4 of 4): the pure guitar core: every position of a set of pitch classes in standard tuning (open string + 15 frets), roots marked exactly on the root pitch class, the property that every position sounds
// the open string + the fret, and the one-line tab of a run (the lowest fret). Expected values are stated from the fretboard (counted by hand for the C major scale), not copied from output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOUBLE_INLAY_FRET, GUITAR_FRETS, INLAY_FRETS, STANDARD_TUNING, midiOfName, pitchClassOf, positionsOf, positionsOfMidi, stringIndex, stringNumber, tabForRun, tabText } from './guitar-core.ts';
import { fretMidi, tuningById } from './input-widget-guitar-fretboard.ts';

const C_MAJOR = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'];
const byString = (ps: { string: number }[]) => { const out: Record<number, number> = {}; for (const p of ps) out[p.string] = (out[p.string] ?? 0) + 1; return out; };

test('standard tuning is the widget\'s own: E2 A2 D3 G3 B3 E4 = MIDI 40 45 50 55 59 64, 15 frets; strings are numbered 6 (low E) to 1 (high E)', () => {
  assert.deepEqual([...STANDARD_TUNING], [40, 45, 50, 55, 59, 64]);
  assert.equal(GUITAR_FRETS, 15);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(stringNumber), [6, 5, 4, 3, 2, 1]);
  assert.deepEqual([6, 5, 4, 3, 2, 1].map(stringIndex), [0, 1, 2, 3, 4, 5]);
});

test('C major: EVERY position of its seven notes on the neck: 10 on strings 6, 5, 4, 2, 1 and 9 on string 3 (59 in all), strings 6 to 1, frets ascending', () => {
  const ps = positionsOf(C_MAJOR);
  assert.deepEqual(byString(ps), { 6: 10, 5: 10, 4: 10, 3: 9, 2: 10, 1: 10 });
  assert.equal(ps.length, 59);
  assert.deepEqual(ps.filter((p) => p.string === 6).map((p) => p.fret), [0, 1, 3, 5, 7, 8, 10, 12, 13, 15], 'the low E string: E F G A B C D E F G');
  assert.deepEqual(ps.filter((p) => p.string === 3).map((p) => p.fret), [0, 2, 4, 5, 7, 9, 10, 12, 14], 'the G string: G A B C D E F G A');
  assert.deepEqual(ps.map((p) => p.string), [...ps.map((p) => p.string)].sort((a, b) => b - a), 'strings 6 to 1');
});

test('the C roots are exactly string 6 fret 8, string 5 frets 3 and 15, string 4 fret 10, string 3 fret 5, string 2 frets 1 and 13, string 1 fret 8; and a D-sharp on string 4 (fret 1) is absent', () => {
  const ps = positionsOf(C_MAJOR);
  assert.deepEqual(ps.filter((p) => p.isRoot).map((p) => `${p.string}:${p.fret}`), ['6:8', '5:3', '5:15', '4:10', '3:5', '2:1', '2:13', '1:8']);
  assert.equal(ps.some((p) => p.string === 4 && p.fret === 1), false, 'D# on the D string');
  assert.ok(ps.some((p) => p.string === 4 && p.fret === 0), 'but the open D is there');
});

test('chord tones on the open E string: E minor (E G B) at frets 0 3 7 12 15, E major (E G# B) at frets 0 4 7 12', () => {
  assert.deepEqual(positionsOf(['E', 'G', 'B']).filter((p) => p.string === 6).map((p) => p.fret), [0, 3, 7, 12, 15]);
  assert.deepEqual(positionsOf(['E', 'G#', 'B']).filter((p) => p.string === 6).map((p) => p.fret), [0, 4, 7, 12]);
  assert.deepEqual(positionsOf(['E', 'G', 'B']).filter((p) => p.string === 6 && p.isRoot).map((p) => p.fret), [0, 12], 'the E roots on the low E string: the open string and fret 12');
});

test('PROPERTY: every position sounds the open string + its fret, for ALL strings and ALL frets (the 12 pitch classes together give the whole neck: 6 x 16)', () => {
  const all = positionsOf([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.equal(all.length, 6 * 16);
  const tuning = tuningById('standard');
  for (const p of all) {
    assert.equal(p.midi, STANDARD_TUNING[stringIndex(p.string)] + p.fret, `string ${p.string} fret ${p.fret}`);
    assert.equal(p.midi, fretMidi(tuning, stringIndex(p.string), p.fret));
    assert.equal(p.pc, p.midi % 12);
    assert.ok(p.fret >= 0 && p.fret <= GUITAR_FRETS);
  }
  assert.deepEqual(new Set(all.map((p) => `${p.string}:${p.fret}`)).size, 96, 'no position twice');
});

test('PROPERTY: the root is marked EXACTLY on the root pitch class, for every root of the major scale; no root when root is null; the default root is the first note', () => {
  for (let root = 0; root < 12; root++) {
    const scale = [0, 2, 4, 5, 7, 9, 11].map((s) => (root + s) % 12);
    const ps = positionsOf(scale, GUITAR_FRETS, { root });
    assert.ok(ps.filter((p) => p.isRoot).length > 0);
    assert.ok(ps.every((p) => p.isRoot === (p.pc === root)), `root ${root}`);
    assert.deepEqual(ps.filter((p) => p.pc === root).map((p) => p.isRoot), ps.filter((p) => p.pc === root).map(() => true));
  }
  assert.ok(positionsOf(C_MAJOR, GUITAR_FRETS, { root: null }).every((p) => !p.isRoot));
  assert.ok(positionsOf(['G', 'B', 'D']).filter((p) => p.isRoot).every((p) => p.pc === 7), 'the first note is the default root');
  assert.ok(positionsOf(['G', 'B', 'D'], GUITAR_FRETS, { root: 11 }).filter((p) => p.isRoot).every((p) => p.pc === 11));
});

test('degrees: the order of appearance by default (the octave C is degree 1 again), or the numbers the caller gives (a chord 1 3 5)', () => {
  const ps = positionsOf(C_MAJOR);
  assert.equal(ps.find((p) => p.pc === 0)!.degree, 1);
  assert.equal(ps.find((p) => p.pc === 11)!.degree, 7);
  assert.deepEqual([...new Set(ps.map((p) => p.degree))].sort(), [1, 2, 3, 4, 5, 6, 7]);
  const chord = positionsOf(['C', 'E', 'G'], GUITAR_FRETS, { degrees: new Map([[0, 1], [4, 3], [7, 5]]) });
  assert.deepEqual([...new Set(chord.map((p) => `${p.pc}:${p.degree}`))].sort(), ['0:1', '4:3', '7:5']);
});

test('input: names (octave and spelling-by-letter ignored) and pitch classes give the same positions; flats, sharps and the C-flat edge; a bad name is refused', () => {
  const a = positionsOf(['C4', 'E4', 'G4']);
  const b = positionsOf([0, 4, 7]);
  assert.deepEqual(a, b);
  assert.deepEqual(positionsOf(['Bb']).map((p) => p.midi % 12), positionsOf(['A#']).map((p) => p.midi % 12));
  assert.equal(pitchClassOf('Cb'), 11); assert.equal(pitchClassOf('B#'), 0); assert.equal(pitchClassOf(14), 2); assert.equal(pitchClassOf(-1), 11);
  assert.throws(() => positionsOf(['H']), /not a note name/);
  assert.deepEqual(positionsOf([]), []);
});

test('fewer frets: 12 frets leave out frets 13 to 15', () => {
  assert.ok(positionsOf(C_MAJOR, 12).every((p) => p.fret <= 12));
  assert.equal(positionsOf(C_MAJOR, 12).length, 59 - positionsOf(C_MAJOR).filter((p) => p.fret > 12).length);
});

test('positionsOfMidi: every position of ONE pitch: middle C (60) on four strings, E4 (64) on four, a pitch below the low E on none', () => {
  assert.deepEqual(positionsOfMidi(60), [{ string: 5, fret: 15 }, { string: 4, fret: 10 }, { string: 3, fret: 5 }, { string: 2, fret: 1 }]);
  assert.deepEqual(positionsOfMidi(64), [{ string: 4, fret: 14 }, { string: 3, fret: 9 }, { string: 2, fret: 5 }, { string: 1, fret: 0 }]);
  assert.deepEqual(positionsOfMidi(39), []);
  assert.deepEqual(positionsOfMidi(40), [{ string: 6, fret: 0 }]);
  assert.deepEqual(positionsOfMidi(80), [], 'one above fret 15 of the high E');
  assert.deepEqual(positionsOfMidi(79), [{ string: 1, fret: 15 }]);
});

test('tabForRun: C major from C3 is 5:3 4:0 4:2 4:3 3:0 3:2 2:0 2:1 (the lowest fret of each note; an open string wins)', () => {
  const run = tabForRun(['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4']);
  assert.deepEqual(run.map((n) => [n!.string, n!.fret]), [[5, 3], [4, 0], [4, 2], [4, 3], [3, 0], [3, 2], [2, 0], [2, 1]]);
  assert.equal(tabText(run), '5:3 4:0 4:2 4:3 3:0 3:2 2:0 2:1');
  assert.deepEqual(run.map((n) => n!.midi), [48, 50, 52, 53, 55, 57, 59, 60]);
});

test('tabForRun: E natural minor from E2 is 6:0 6:2 6:3 5:0 5:2 5:3 4:0 4:2', () => {
  assert.equal(tabText(tabForRun(['E2', 'F#2', 'G2', 'A2', 'B2', 'C3', 'D3', 'E3'])), '6:0 6:2 6:3 5:0 5:2 5:3 4:0 4:2');
});

test('tabForRun: midi numbers too; the edges: the lowest note, the highest, a note off the neck is x; a run of one note', () => {
  assert.equal(tabText(tabForRun([40, 64, 79])), '6:0 1:0 1:15');
  assert.equal(tabText(tabForRun([38, 40, 80])), 'x 6:0 x', 'D2 is below the low E, G#5 above fret 15');
  assert.deepEqual(tabForRun([]), []);
  assert.equal(tabText(tabForRun(['E4'])), '1:0');
  assert.equal(tabText(tabForRun(['B3'])), '2:0', 'B3: the open B string beats fret 4 of the G string');
  assert.equal(tabText(tabForRun([57])), '3:2', 'A3 (57): G string fret 2 is lower than D string fret 7 and A string fret 12');
});

test('tabForRun: every playable midi gets a position whose fret is the LOWEST there is (property over the whole range), and the note it names is the note asked for', () => {
  for (let midi = 40; midi <= 79; midi++) {
    const t = tabForRun([midi])[0]!;
    assert.equal(STANDARD_TUNING[stringIndex(t.string)] + t.fret, midi);
    for (const o of positionsOfMidi(midi)) assert.ok(t.fret <= o.fret, `${midi}: ${t.string}:${t.fret} vs ${o.string}:${o.fret}`);
  }
});

test('midiOfName and bad input', () => {
  assert.equal(midiOfName('C4'), 60); assert.equal(midiOfName('E2'), 40); assert.equal(midiOfName('Bb3'), 58); assert.equal(midiOfName('F#2'), 42); assert.equal(midiOfName('B-3'), 58);
  assert.throws(() => midiOfName('C'), /octave/);
});

test('the inlays: single dots at frets 3 5 7 9 15 and the double dot at 12', () => {
  assert.deepEqual([...INLAY_FRETS], [3, 5, 7, 9, 15]);
  assert.equal(DOUBLE_INLAY_FRET, 12);
});

test('positionsOf and positionsOfMidi come out in the order a neck is read: string 6 to 1, frets ascending (no sort needed)', () => {
  const ps = positionsOf([0, 4, 7]);
  for (let i = 1; i < ps.length; i++) assert.ok(ps[i - 1].string > ps[i].string || (ps[i - 1].string === ps[i].string && ps[i - 1].fret < ps[i].fret), `${i}`);
  assert.deepEqual(positionsOfMidi(52).map((p) => p.string), [6, 5, 4], 'E3: three strings (fret 12, 7, 2), the low one first');
});
