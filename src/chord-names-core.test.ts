// 2026-11-04-1171 (Scale Explorer 2 of 4): the pure chord-name table — name a set of notes (root, quality, inversion, bass, the other readings) and build a chord from a root and a quality. The table is checked against music21 in chord-names-engine.test.ts.
// Pins the PROPERTY (the vault's twelve qualities, slash names for inversions, a set that matches nothing is NOT given a wrong name), not the table's shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHORD_QUALITIES,
  CHORD_QUALITY_LABELS,
  CHORD_TABLE,
  buildChord,
  chordMusicXML,
  chordNotes,
  chordRootName,
  chordRootNamesFor,
  nameChord,
  normalizeChordQuality,
  type ChordSpec,
} from './chord-names-core.ts';
import { tonicNamesFor } from './scale-explorer-core.ts';

const named = (r: ReturnType<typeof nameChord>) => { assert.ok(r.name !== null, 'a name was expected'); return r as Exclude<ReturnType<typeof nameChord>, { name: null }>; };

test('the vault\'s twelve qualities, in the vault\'s own wording: build_triad_chord\'s four, then build_chord\'s eight', () => {
  assert.deepEqual([...CHORD_QUALITIES], ['major', 'minor', 'diminished', 'augmented', 'maj7', 'dom7', 'min7', 'half_dim7', 'dim7', 'dom9', 'dom11', 'dom13']);
  assert.deepEqual(CHORD_TABLE.map((c) => c.quality), [...CHORD_QUALITIES]);
});

test('no sus, add9 or 6 chords in the table (the open question to the driver: default no)', () => {
  assert.ok(CHORD_TABLE.every((c) => !/sus|add|6/.test(c.symbol)));
});

test('buildChord stacks thirds from the root with one letter per degree, in octave 4 by default (the engine\'s own shapes)', () => {
  assert.deepEqual(buildChord('C', 'major'), ['C4', 'E4', 'G4']);
  assert.deepEqual(buildChord('C', 'dom7'), ['C4', 'E4', 'G4', 'Bb4']);
  assert.deepEqual(buildChord('Bb', 'dom7'), ['Bb4', 'D5', 'F5', 'Ab5']);
  assert.deepEqual(buildChord('F#', 'half_dim7'), ['F#4', 'A4', 'C5', 'E5']);
  assert.deepEqual(buildChord('C', 'dom13'), ['C4', 'E4', 'G4', 'Bb4', 'D5', 'F5', 'A5']);
  assert.deepEqual(buildChord('A', 'minor', 3), ['A3', 'C4', 'E4']);
  assert.deepEqual(buildChord('B', 'dim7'), ['B4', 'D5', 'F5', 'Ab5']);
});

test('chordNotes carries the degree of each tone (1 3 5 7 9 11 13) and the midi number', () => {
  const n = chordNotes('C', 'dom9', 4);
  assert.deepEqual(n.map((x) => x.degree), [1, 3, 5, 7, 9]);
  assert.deepEqual(n.map((x) => x.midi), [60, 64, 67, 70, 74]);
  assert.deepEqual(n.map((x) => x.name), ['C4', 'E4', 'G4', 'Bb4', 'D5']);
});

test('the root name: major-third chords use 1170\'s major list (Db, F#, Bb), minor-third chords its natural-minor list (C#, Eb, G#)', () => {
  assert.deepEqual(chordRootNamesFor('major'), tonicNamesFor('major'));
  assert.deepEqual(chordRootNamesFor('dom7'), tonicNamesFor('major'));
  assert.deepEqual(chordRootNamesFor('minor'), tonicNamesFor('natural minor'));
  assert.deepEqual(chordRootNamesFor('half_dim7'), tonicNamesFor('natural minor'));
  assert.equal(chordRootName(1, 'major'), 'Db');
  assert.equal(chordRootName(1, 'minor'), 'C#');
  assert.equal(chordRootName(10, 'dom7'), 'Bb');
});

test('PROPERTY: every root name is the family list\'s, and the chord on it is spelled with one letter per degree; a double accidental appears ONLY where the quality forces it (exactly eight of the 144 root x quality pairs: the 1171-2 change to Eb minor adds Eb diminished, Eb m7b5 and Eb dim7)', () => {
  const doubles: string[] = [];
  for (const q of CHORD_QUALITIES) {
    const family = chordRootNamesFor(q);
    for (let pc = 0; pc < 12; pc++) {
      const root = chordRootName(pc, q);
      assert.equal(root, family[pc]);
      const notes = chordNotes(root, q, 4);
      assert.equal(notes[0].midi % 12, pc, `${root} is pitch class ${pc}`);
      assert.equal(new Set(notes.map((n) => n.step)).size, notes.length, `${root} ${q}: a different letter for each degree`);
      for (const n of notes) if (Math.abs(n.alter) > 1) doubles.push(`${root} ${q}: ${n.name}`);
    }
  }
  assert.deepEqual(doubles, ['Eb diminished: Bbb4', 'F# augmented: C##5', 'B augmented: F##5', 'Eb half_dim7: Bbb4', 'C dim7: Bbb4', 'Eb dim7: Bbb4', 'Eb dim7: Dbb5', 'F dim7: Ebb5', 'Bb dim7: Abb5']);
});

test('naming: root position, with the symbol, the title and the quality', () => {
  const c = named(nameChord(['C4', 'E4', 'G4']));
  assert.deepEqual([c.name, c.title, c.root, c.quality, c.inversion, c.bass], ['C', 'C major', 'C', 'major', 0, 'C']);
  const g7 = named(nameChord(['G3', 'B3', 'D4', 'F4']));
  assert.deepEqual([g7.name, g7.title, g7.root, g7.quality, g7.inversion, g7.bass], ['G7', 'G7', 'G', 'dom7', 0, 'G']);
  const names = (t: string[]) => named(nameChord(t)).name;
  assert.equal(names(['A3', 'C4', 'E4']), 'Am');
  assert.equal(names(['B3', 'D4', 'F4']), 'Bdim');
  assert.equal(names(['C4', 'E4', 'G#4']), 'Caug');
  assert.equal(names(['C4', 'E4', 'G4', 'B4']), 'Cmaj7');
  assert.equal(names(['D4', 'F4', 'A4', 'C5']), 'Dm7');
  assert.equal(names(['B3', 'D4', 'F4', 'A4']), 'Bm7b5');
  assert.equal(names(['B3', 'D4', 'F4', 'Ab4']), 'Bdim7');
  assert.equal(names(['C4', 'E4', 'G4', 'Bb4', 'D5']), 'C9');
  assert.equal(names(['C4', 'E4', 'G4', 'Bb4', 'D5', 'F5']), 'C11');
  assert.equal(names(['C4', 'E4', 'G4', 'Bb4', 'D5', 'F5', 'A5']), 'C13');
  assert.equal(names(['Bb3', 'D4', 'F4', 'Ab4']), 'Bb7');
});

test('inversions are named with a slash and a number: C/E (1), C/G (2), G7/B (1), G7/D (2), G7/F (3)', () => {
  const inv = (t: string[]) => { const r = named(nameChord(t)); return [r.name, r.inversion, r.bass]; };
  assert.deepEqual(inv(['E3', 'G3', 'C4']), ['C/E', 1, 'E']);
  assert.deepEqual(inv(['G3', 'C4', 'E4']), ['C/G', 2, 'G']);
  assert.deepEqual(inv(['B2', 'D3', 'F3', 'G3']), ['G7/B', 1, 'B']);
  assert.deepEqual(inv(['D3', 'F3', 'G3', 'B3']), ['G7/D', 2, 'D']);
  assert.deepEqual(inv(['F3', 'G3', 'B3', 'D4']), ['G7/F', 3, 'F']);
  assert.equal(named(nameChord(['E3', 'G3', 'C4'])).title, 'C major/E');
});

test('input forms: midi numbers, pitch names without an octave (the first is the bass), music21\'s "B-4" flat, doubled notes, any order of the upper notes', () => {
  assert.equal(named(nameChord([60, 64, 67])).name, 'C');
  assert.equal(named(nameChord([70, 74, 77, 80])).name, 'Bb7', 'midi 70 is spelled by the root rule');
  assert.equal(named(nameChord(['G', 'B', 'D', 'F'])).name, 'G7');
  assert.equal(named(nameChord(['E', 'G', 'C'])).name, 'C/E', 'no octaves: the first listed is the bass');
  assert.equal(named(nameChord(['B-4', 'D5', 'F5'])).name, 'Bb');
  assert.equal(named(nameChord(['C3', 'C4', 'E4', 'G4', 'E5'])).name, 'C');
  assert.equal(named(nameChord(['G4', 'C3', 'E4'])).name, 'C', 'the lowest note by octave is the bass: C3, so root position');
  assert.throws(() => nameChord(['H4']), /not a pitch name/);
});

test('the same notes read as another chord are listed as alternatives, best first (fewest inversion)', () => {
  const dim7 = named(nameChord([60, 63, 66, 69]));
  assert.deepEqual([dim7.name, dim7.inversion], ['Cdim7', 0]);
  assert.deepEqual(dim7.alternatives.map((a) => a.inversion), [1, 2, 3]);
  assert.ok(dim7.alternatives.every((a) => a.quality === 'dim7'));
  const aug = named(nameChord([60, 64, 68]));
  assert.equal(aug.name, 'Caug');
  assert.deepEqual(aug.alternatives.map((a) => a.name), ['Abaug/C', 'Eaug/B#'], 'given midi numbers the bass is spelled as each reading\'s own chord tone');
  assert.deepEqual(named(nameChord(['C4', 'E4', 'G#4'])).alternatives.map((a) => a.name), ['G#aug/C', 'Eaug/C'], 'given names, the roots and the bass as written');
  const plain = named(nameChord(['C4', 'E4', 'G4']));
  assert.deepEqual(plain.alternatives, []);
});

test('a set that matches nothing gets name null and its intervals, never a wrong name', () => {
  const sus2 = nameChord(['C4', 'D4', 'G4']);
  assert.equal(sus2.name, null);
  if (sus2.name === null) { assert.deepEqual(sus2.intervals, [0, 2, 7]); assert.deepEqual(sus2.intervalNames, ['P1', 'M2', 'P5']); assert.equal(sus2.bass, 'C'); assert.deepEqual(sus2.alternatives, []); }
  const sus4 = nameChord(['C4', 'F4', 'G4']);
  assert.equal(sus4.name, null);
  if (sus4.name === null) assert.deepEqual(sus4.intervals, [0, 5, 7]);
  const six = nameChord(['C4', 'E4', 'G4', 'A4']);
  assert.equal(six.name, 'Am7/C', 'C6 is not in the table, so these notes read as the chord that IS: Am7 over its third');
  if (six.name !== null) assert.deepEqual([six.quality, six.inversion], ['min7', 1]);
  const add9 = nameChord(['C4', 'E4', 'G4', 'D5']);
  assert.equal(add9.name, null);
  const one = nameChord(['C4']);
  assert.equal(one.name, null);
  if (one.name === null) assert.deepEqual(one.intervals, [0]);
  const none = nameChord([]);
  assert.equal(none.name, null);
  if (none.name === null) assert.deepEqual(none.intervals, []);
});

test('the intervals are measured up from the lowest note, not from the first listed', () => {
  const r = nameChord(['G4', 'C3', 'D4']);   // C3 is the bass: C, D, G -> 0 2 7
  assert.equal(r.name, null);
  if (r.name === null) { assert.deepEqual(r.intervals, [0, 2, 7]); assert.equal(r.bass, 'C'); }
});

test('the table is one data array: a row added to a copy of it is named, with no other change (sus2 as the example)', () => {
  const sus2: ChordSpec = { quality: 'sus2' as any, symbol: 'sus2', word: null, degrees: [1, 2, 5], semitones: [0, 2, 7] };
  const r = nameChord(['C4', 'D4', 'G4'], [...CHORD_TABLE, sus2]);
  assert.equal(r.name, 'Csus2');
});

test('normalizeChordQuality: the ids, case-insensitive, with m7b5 for half_dim7', () => {
  for (const q of CHORD_QUALITIES) assert.equal(normalizeChordQuality(q), q);
  assert.equal(normalizeChordQuality('MAJOR'), 'major');
  assert.equal(normalizeChordQuality('m7b5'), 'half_dim7');
  assert.equal(normalizeChordQuality('nope'), null);
});

// ---- the staff: one chord of stacked notes -------------------------------------------------------------------------------------------------------------------------------

const tagsOf = (xml: string) => [...xml.matchAll(/<note>([\s\S]*?)<\/note>/g)].map((m) => ({
  step: /<step>(\w)<\/step>/.exec(m[1])![1], alter: Number(/<alter>(-?\d)<\/alter>/.exec(m[1])?.[1] ?? 0), octave: Number(/<octave>(\d)<\/octave>/.exec(m[1])![1]),
  accidental: /<accidental>([\w-]+)<\/accidental>/.exec(m[1])?.[1] ?? null, stacked: m[1].includes('<chord/>'),
}));

test('the staff input is ONE whole-note chord: the notes of chordNotes, the first plain and every other marked <chord/>, one measure, no key signature', () => {
  for (const q of CHORD_QUALITIES) for (const root of chordRootNamesFor(q)) {
    const xml = chordMusicXML(root, q, 4);
    const want = chordNotes(root, q, 4);
    const got = tagsOf(xml);
    assert.deepEqual(got.map((n) => `${n.step}${n.alter}${n.octave}`), want.map((n) => `${n.step}${n.alter}${n.octave}`), `${root} ${q}`);
    assert.deepEqual(got.map((n) => n.stacked), want.map((_, i) => i > 0), `${root} ${q}: only the first note starts the chord`);
    assert.equal((xml.match(/<measure /g) ?? []).length, 1);
    assert.match(xml, /<fifths>0<\/fifths>/);
    assert.equal((xml.match(/<type>whole<\/type>/g) ?? []).length, want.length);
  }
});

test('with no key signature every altered note carries its own sign, and no natural notes carry one', () => {
  const bb7 = tagsOf(chordMusicXML('Bb', 'dom7', 4));
  assert.deepEqual(bb7.map((n) => n.accidental), ['flat', null, null, 'flat']);
  const dim7 = tagsOf(chordMusicXML('C', 'dim7', 4));
  assert.deepEqual(dim7.map((n) => n.accidental), [null, 'flat', 'flat', 'flat-flat']);
  const aug = tagsOf(chordMusicXML('F#', 'augmented', 4));
  assert.deepEqual(aug.map((n) => n.accidental), ['sharp', 'sharp', 'double-sharp']);
});

test('the chord staff is well-formed MusicXML, a treble clef from octave 4 and a bass clef below', () => {
  const xml = chordMusicXML('C', 'major', 4);
  const stack: string[] = [];
  for (const m of xml.replace(/<\?xml[^>]*\?>/, '').matchAll(/<(\/?)([\w-]+)([^>]*?)(\/?)>/g)) {
    if (m[4] === '/') continue;
    if (m[1] === '/') assert.equal(stack.pop(), m[2]); else stack.push(m[2]);
  }
  assert.deepEqual(stack, []);
  assert.match(xml, /<score-partwise version="3\.1">[\s\S]*<time print-object="no"><beats>4<\/beats><beat-type>4<\/beat-type><\/time>[\s\S]*<sign>G<\/sign>\s*<line>2<\/line>/);
  assert.match(chordMusicXML('C', 'major', 3), /<sign>F<\/sign>\s*<line>4<\/line>/);
});

// ---- the gaps the mutation pass found (2026-11-04-1171, 367 mutants: 64 survived at first) -------------------------------------------------------------------------------

test('every quality has its own non-empty dropdown label', () => {
  const labels = CHORD_QUALITIES.map((q) => CHORD_QUALITY_LABELS[q]);
  assert.ok(labels.every((l) => typeof l === 'string' && l.length > 4));
  assert.equal(new Set(labels).size, CHORD_QUALITIES.length);
});

test('the titles: the triads are spelled out, the others by their symbol (C major, C minor, C diminished, C augmented, Cmaj7, C7, Cm7, Cm7b5, Cdim7, C9, C11, C13)', () => {
  const titles = CHORD_QUALITIES.map((q) => named(nameChord(buildChord('C', q))).title);
  assert.deepEqual(titles, ['C major', 'C minor', 'C diminished', 'C augmented', 'Cmaj7', 'C7', 'Cm7', 'Cm7b5', 'Cdim7', 'C9', 'C11', 'C13']);
  assert.deepEqual(CHORD_QUALITIES.map((q) => named(nameChord(buildChord('C', q))).name), ['C', 'Cm', 'Cdim', 'Caug', 'Cmaj7', 'C7', 'Cm7', 'Cm7b5', 'Cdim7', 'C9', 'C11', 'C13']);
});

test('errors: a quality that is not in the table and a root that is not a note name are refused with the value in the message', () => {
  assert.throws(() => buildChord('C', 'sus4' as any), /chord quality not in the table: "sus4"/);
  assert.throws(() => chordNotes('H', 'major'), /chordNotes: not a note name: "H"/);
  assert.throws(() => chordRootNamesFor('nope' as any), /not in the table/);
});

test('the defaults: octave 4 for chordNotes and chordMusicXML; chordRootName wraps any integer to a pitch class', () => {
  assert.deepEqual(chordNotes('C', 'major').map((n) => n.name), ['C4', 'E4', 'G4']);
  assert.match(chordMusicXML('C', 'major'), /<octave>4<\/octave>/);
  assert.equal(chordRootName(13, 'major'), chordRootName(1, 'major'));
  assert.equal(chordRootName(-2, 'major'), chordRootName(10, 'major'));
  assert.equal(chordRootName(0, 'major'), 'C');
});

test('a set that is not a chord: the interval list from the bass in semitones AND in names, and the bass named (sharps for a midi number)', () => {
  const names = ['P1', 'm2', 'M2', 'm3', 'M3', 'P4', 'd5', 'P5', 'm6', 'M6', 'm7', 'M7'];
  for (let i = 1; i < 12; i++) {
    const r = nameChord([60, 60 + i]);
    assert.equal(r.name, null);
    if (r.name === null) { assert.deepEqual(r.intervals, [0, i]); assert.deepEqual(r.intervalNames, ['P1', names[i]]); }
  }
  const bassNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  for (let pc = 0; pc < 12; pc++) { const r = nameChord([48 + pc, 48 + pc + 2]); assert.equal(r.bass, bassNames[pc]); }
});

test('midi numbers of every pitch class and octave name chords by the root rule (60 + 1: Db; 61 + minor third: C#m)', () => {
  assert.equal(named(nameChord([61, 65, 68])).name, 'Db');
  assert.equal(named(nameChord([61, 64, 68])).name, 'C#m');
  assert.equal(named(nameChord([70, 73, 77])).name, 'Bbm');
  assert.equal(named(nameChord([71, 75, 78])).name, 'B');
  assert.equal(named(nameChord([59, 63, 66])).name, 'B');
  assert.equal(named(nameChord([-1, 3, 6])).name, 'B', 'a negative midi number still has its pitch class');
});

test('names as written: a spelled root is kept (Cb, E#, Db for a C# chord), the accidentals count, and the lowest note is found by octave AND accidental', () => {
  assert.equal(named(nameChord(['Cb4', 'Eb4', 'Gb4'])).name, 'Cb');
  assert.equal(named(nameChord(['Db4', 'F4', 'Ab4'])).name, 'Db');
  assert.equal(named(nameChord(['C#4', 'E#4', 'G#4'])).name, 'C#');
  assert.equal(named(nameChord(['B#3', 'D#4', 'F##4'])).name, 'B#m', 'B#3 is the lowest: a B# minor chord in root position, spelled as written');
  assert.equal(named(nameChord(['C4', 'E4', 'G4', 'Bb3'])).name, 'C7/Bb', 'Bb3 is lower than C4: C7 over its seventh');
  assert.equal(named(nameChord(['B3', 'C4', 'E4', 'G4'])).name, 'Cmaj7/B');
});

test('chordMusicXML skeleton: the xml declaration, the part list, divisions 1 and whole notes of 4 divisions', () => {
  const xml = chordMusicXML('C', 'dom7', 4);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<score-partwise version="3\.1">\n/);
  assert.match(xml, /<part-list><score-part id="P1"><part-name><\/part-name><\/score-part><\/part-list>/);
  assert.match(xml, /<divisions>1<\/divisions>/);
  assert.equal((xml.match(/<duration>4<\/duration>/g) ?? []).length, 4);
  assert.match(xml, /<\/measure>\n  <\/part>\n<\/score-partwise>\n$/);
});

// ---- 2026-11-04-1171-2: Eb minor ------------------------------------------------------------------------------------------------------------------------------------------------------------

test('Eb minor chords are named with the flat: Ebm from Eb Gb Bb, Ebm7, Ebdim, Ebm7b5 and by midi numbers (63 66 70); the dropdown list has Eb and no D#', () => {
  assert.equal(named(nameChord(['Eb4', 'Gb4', 'Bb4'])).name, 'Ebm');
  assert.equal(named(nameChord(['Eb4', 'Gb4', 'Bb4'])).title, 'Eb minor');
  assert.equal(named(nameChord(['Eb4', 'Gb4', 'Bb4', 'Db5'])).name, 'Ebm7');
  assert.equal(named(nameChord(['Eb4', 'Gb4', 'Bbb4'])).name, 'Ebdim');
  assert.equal(named(nameChord(['Eb4', 'Gb4', 'Bbb4', 'Db5'])).name, 'Ebm7b5');
  assert.equal(named(nameChord([63, 66, 70])).name, 'Ebm', 'a midi number is named by the list');
  assert.equal(named(nameChord([63, 66, 70, 73])).name, 'Ebm7');
  assert.ok(chordRootNamesFor('minor').includes('Eb') && !chordRootNamesFor('minor').includes('D#'));
  assert.equal(chordRootName(3, 'min7'), 'Eb');
  assert.equal(chordRootName(3, 'major'), 'Eb', 'the major list had Eb already');
  assert.equal(named(nameChord(['D#4', 'F#4', 'A#4'])).name, 'D#m', 'CONTROL: a D# minor chord WRITTEN as D# F# A# keeps its spelling');
});
