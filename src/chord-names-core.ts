// 2026-11-04-1171 (Scale Explorer 2 of 4) — the pure chord-name table: name a set of notes (root, quality, inversion, bass, the other readings of the same notes) and build a chord from a root and a quality. No DOM, no engine, no Obsidian.
// The qualities are the vault's own, in its own wording: build_triad_chord's four (major, minor, diminished, augmented) and build_chord's eight (maj7, dom7, min7, half_dim7, dim7, dom9, dom11, dom13; the Description of build_seventh_chord lists exactly these).
// The table is ONE data array (CHORD_TABLE): a quality the vault adds later (sus2, add9, 6) is one more row, and nameChord takes the table as a parameter so a test can prove that. A set of notes that matches no row gets `name: null` and its
// interval list — never a wrong name. The table is checked against music21 in chord-names-engine.test.ts (build_chord, Chord.root(), .inversion(), the seventh-chord common names) for all 12 roots x every quality x every inversion.

import { STEPS, STEP_PC, normalizeTonic, tonicNamesFor, type ScaleNote, type Step } from './scale-explorer-core.ts';

export type ChordQuality = 'major' | 'minor' | 'diminished' | 'augmented' | 'maj7' | 'dom7' | 'min7' | 'half_dim7' | 'dim7' | 'dom9' | 'dom11' | 'dom13';

export interface ChordSpec {
  quality: ChordQuality;
  /** The suffix of the chord symbol: '' for major, 'm', 'dim', 'aug', 'maj7', '7', 'm7', 'm7b5', 'dim7', '9', '11', '13'. */
  symbol: string;
  /** The word the title uses for the triads ("C major"); the sevenths and extended chords are titled by their symbol ("G7"). */
  word: string | null;
  /** The chord's own degrees: 1 3 5 (7 9 11 13). Degree d is the letter d - 1 steps above the root's. */
  degrees: readonly number[];
  /** Semitones above the root, in the stacking order (a ninth is 14). */
  semitones: readonly number[];
}

export const CHORD_TABLE: readonly ChordSpec[] = [
  { quality: 'major', symbol: '', word: 'major', degrees: [1, 3, 5], semitones: [0, 4, 7] },
  { quality: 'minor', symbol: 'm', word: 'minor', degrees: [1, 3, 5], semitones: [0, 3, 7] },
  { quality: 'diminished', symbol: 'dim', word: 'diminished', degrees: [1, 3, 5], semitones: [0, 3, 6] },
  { quality: 'augmented', symbol: 'aug', word: 'augmented', degrees: [1, 3, 5], semitones: [0, 4, 8] },
  { quality: 'maj7', symbol: 'maj7', word: null, degrees: [1, 3, 5, 7], semitones: [0, 4, 7, 11] },
  { quality: 'dom7', symbol: '7', word: null, degrees: [1, 3, 5, 7], semitones: [0, 4, 7, 10] },
  { quality: 'min7', symbol: 'm7', word: null, degrees: [1, 3, 5, 7], semitones: [0, 3, 7, 10] },
  { quality: 'half_dim7', symbol: 'm7b5', word: null, degrees: [1, 3, 5, 7], semitones: [0, 3, 6, 10] },
  { quality: 'dim7', symbol: 'dim7', word: null, degrees: [1, 3, 5, 7], semitones: [0, 3, 6, 9] },
  { quality: 'dom9', symbol: '9', word: null, degrees: [1, 3, 5, 7, 9], semitones: [0, 4, 7, 10, 14] },
  { quality: 'dom11', symbol: '11', word: null, degrees: [1, 3, 5, 7, 9, 11], semitones: [0, 4, 7, 10, 14, 17] },
  { quality: 'dom13', symbol: '13', word: null, degrees: [1, 3, 5, 7, 9, 11, 13], semitones: [0, 4, 7, 10, 14, 17, 21] },
];

export const CHORD_QUALITIES: readonly ChordQuality[] = CHORD_TABLE.map((c) => c.quality);

export const CHORD_QUALITY_LABELS: Record<ChordQuality, string> = {
  major: 'Major', minor: 'Minor', diminished: 'Diminished', augmented: 'Augmented', maj7: 'Major 7th (maj7)', dom7: 'Dominant 7th (7)', min7: 'Minor 7th (m7)',
  half_dim7: 'Half-diminished (m7b5)', dim7: 'Diminished 7th (dim7)', dom9: 'Dominant 9th (9)', dom11: 'Dominant 11th (11)', dom13: 'Dominant 13th (13)',
};

export function normalizeChordQuality(raw: string): ChordQuality | null {
  const v = raw.trim().toLowerCase();
  if ((CHORD_QUALITIES as readonly string[]).includes(v)) return v as ChordQuality;
  return v === 'm7b5' ? 'half_dim7' : null;
}

const specOf = (quality: ChordQuality, table: readonly ChordSpec[] = CHORD_TABLE): ChordSpec => {
  const s = table.find((c) => c.quality === quality);
  if (!s) throw new Error(`chord quality not in the table: "${quality}"`);
  return s;
};

const alterOf = (n: number): number => { let a = ((n % 12) + 12) % 12; if (a > 6) a -= 12; return a; };
const alterText = (alter: number): string => (alter > 0 ? '#'.repeat(alter) : 'b'.repeat(-alter));

/** The chord's notes stacked from `root` (as spelled) in `octave`: one letter per degree, so the spelling is the engine's (build_chord / build_triad_chord stack named intervals from the root). */
export function chordNotes(root: string, quality: ChordQuality, octave = 4, table: readonly ChordSpec[] = CHORD_TABLE): ScaleNote[] {
  const t = normalizeTonic(root);
  if (!t) throw new Error(`chordNotes: not a note name: "${root}"`);
  const rootStep = t[0] as Step;
  const rootAlter = t.length === 1 ? 0 : t[1] === '#' ? 1 : -1;
  const rootAbs = STEP_PC[rootStep] + rootAlter;
  const rootIndex = STEPS.indexOf(rootStep);
  const spec = specOf(quality, table);
  return spec.degrees.map((degree, i) => {
    const index = rootIndex + degree - 1;
    const step = STEPS[index % 7];
    const oct = octave + Math.floor(index / 7);
    const alter = alterOf(rootAbs + spec.semitones[i] - STEP_PC[step]);
    return { step, alter, octave: oct, degree, name: `${step}${alterText(alter)}${oct}`, midi: 12 * (oct + 1) + STEP_PC[step] + alter };
  });
}

/** `["C4","E4","G4","Bb4"]` — the pitch list, as build_chord returns it (flats written `b` here, `-` there). */
export function buildChord(root: string, quality: ChordQuality, octave = 4, table: readonly ChordSpec[] = CHORD_TABLE): string[] {
  return chordNotes(root, quality, octave, table).map((n) => n.name);
}

const hasThirdMinor = (spec: ChordSpec): boolean => spec.semitones.includes(3);

/** The 12 root names the dropdown offers for a quality: 1170's lists (a major-third chord: C Db D Eb E F F# G Ab A Bb B; a minor-third chord: C C# D D# E F F# G G# A Bb B), one per pitch class. */
export function chordRootNamesFor(quality: ChordQuality, table: readonly ChordSpec[] = CHORD_TABLE): string[] {
  return tonicNamesFor(hasThirdMinor(specOf(quality, table)) ? 'natural minor' : 'major');
}

/** NOTE FOR THE DIATONIC ROW (1172, not started): name each degree's chord from the SCALE's own spelling (Eb natural minor has Cb and Db: Ebm, Fdim, Cb, Dbm...), NOT from this function, which names a pitch class by the chord family's list (pc 11 is "B", never "Cb").
 * The root's name for a pitch class: the family list's (see chordRootNamesFor), always. A quality that forces a double accidental keeps it (C dim7 is C Eb Gb Bbb, F# augmented F# A# C##): respelling the ROOT to dodge one gives names nobody writes (B#dim7). */
export function chordRootName(pc: number, quality: ChordQuality, table: readonly ChordSpec[] = CHORD_TABLE): string {
  return chordRootNamesFor(quality, table)[((pc % 12) + 12) % 12];
}

// ---- naming a set of notes -----------------------------------------------------------------------------------------------------------------------------------------------

export interface ChordReading { name: string; title: string; root: string; quality: ChordQuality; inversion: number; bass: string }
export interface ChordName extends ChordReading { alternatives: ChordReading[] }
export interface NoChord { name: null; title: null; root: null; quality: null; inversion: null; bass: string | null; intervals: number[]; intervalNames: string[]; alternatives: [] }

const INTERVAL_NAMES = ['P1', 'm2', 'M2', 'm3', 'M3', 'P4', 'd5', 'P5', 'm6', 'M6', 'm7', 'M7'];
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_RE = /^([A-Ga-g])([#b-]{0,2})(\d+)?$/;

interface Entry { pc: number; midi: number | null; spelled: string | null }

function parseEntry(raw: string | number): Entry {
  if (typeof raw === 'number') return { pc: ((raw % 12) + 12) % 12, midi: raw, spelled: null };
  const m = NOTE_RE.exec(raw.trim());
  if (!m) throw new Error(`nameChord: not a pitch name: "${raw}"`);
  const step = m[1].toUpperCase() as Step;
  const alter = m[2].split('').reduce((a, c) => a + (c === '#' ? 1 : -1), 0);
  const pc = (((STEP_PC[step] + alter) % 12) + 12) % 12;
  return { pc, midi: m[3] === undefined ? null : 12 * (Number(m[3]) + 1) + STEP_PC[step] + alter, spelled: `${step}${alterText(alter)}` };
}

const distinctSorted = (xs: number[]): number[] => [...new Set(xs)].sort((a, b) => a - b);
const sameSet = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Name the chord a set of notes makes. Input: pitch names (`'E3'`, `'B-4'`, `'Bb'`: an octave is optional) and/or midi numbers. The bass is the LOWEST note when every note has an octave (or is a midi number), else the FIRST listed.
 * The reading whose bass is nearest the root comes first (root position, then first inversion, ...); the other readings of the same notes are `alternatives`. Names use a slash for an inversion: `C/E`, `G7/B`.
 * Nothing in the table matches -> `{ name: null, intervals, intervalNames }` (semitones above the bass), never a guess.
 */
export function nameChord(input: readonly (string | number)[], table: readonly ChordSpec[] = CHORD_TABLE): ChordName | NoChord {
  const entries = input.map(parseEntry);
  if (entries.length === 0) return { name: null, title: null, root: null, quality: null, inversion: null, bass: null, intervals: [], intervalNames: [], alternatives: [] };
  const allPitched = entries.every((e) => e.midi !== null);
  const bassEntry = allPitched ? entries.reduce((lo, e) => (e.midi! < lo.midi! ? e : lo)) : entries[0];
  const pcs = distinctSorted(entries.map((e) => e.pc));
  const relFrom = (r: number): number[] => distinctSorted(pcs.map((p) => (((p - r) % 12) + 12) % 12));
  const bassName = bassEntry.spelled ?? SHARP_NAMES[bassEntry.pc];
  const matches: { root: number; spec: ChordSpec; inversion: number; order: number }[] = [];
  for (const root of pcs) {
    const rel = relFrom(root);
    table.forEach((spec, order) => {
      if (!sameSet(rel, distinctSorted(spec.semitones.map((s) => s % 12)))) return;
      const bassRel = (((bassEntry.pc - root) % 12) + 12) % 12;
      matches.push({ root, spec, inversion: spec.semitones.findIndex((s) => s % 12 === bassRel), order });
    });
  }
  if (matches.length === 0) {
    const intervals = relFrom(bassEntry.pc);
    return { name: null, title: null, root: null, quality: null, inversion: null, bass: bassName, intervals, intervalNames: intervals.map((i) => INTERVAL_NAMES[i]), alternatives: [] };
  }
  matches.sort((a, b) => a.inversion - b.inversion || a.order - b.order);
  const reading = (m: { root: number; spec: ChordSpec; inversion: number }): ChordReading => {
    const spelledRoot = entries.find((e) => e.pc === m.root && e.spelled !== null)?.spelled ?? null;
    const root = spelledRoot ?? chordRootName(m.root, m.spec.quality, table);
    // The bass is spelled as the person wrote it; given midi numbers, as the chord's own tone (E augmented over C is E aug/B#: the fifth of E augmented is B#).
    const bass = m.inversion === 0 ? root : bassEntry.spelled ?? chordNotes(root, m.spec.quality, 4, table)[m.inversion].name.replace(/\d+$/, '');
    const slash = m.inversion > 0 ? `/${bass}` : '';
    return { name: `${root}${m.spec.symbol}${slash}`, title: `${m.spec.word ? `${root} ${m.spec.word}` : `${root}${m.spec.symbol}`}${slash}`, root, quality: m.spec.quality, inversion: m.inversion, bass };
  };
  const [first, ...rest] = matches.map(reading);
  return { ...first, alternatives: rest };
}

// ---- the staff -----------------------------------------------------------------------------------------------------------------------------------------------------------

const ACCIDENTAL_NAME: Record<number, string> = { '-2': 'flat-flat', '-1': 'flat', '1': 'sharp', '2': 'double-sharp' };

/** One bar with the chord as ONE whole-note chord (stacked notes), a treble clef from octave 4 (bass below), no key signature - a chord has none - so every altered note carries its own accidental sign. */
export function chordMusicXML(root: string, quality: ChordQuality, octave = 4, table: readonly ChordSpec[] = CHORD_TABLE): string {
  const notes = chordNotes(root, quality, octave, table);
  const [clefSign, clefLine] = octave >= 4 ? ['G', 2] : ['F', 4];
  const body = notes.map((n, i) => [
    '      <note>',
    i > 0 ? '        <chord/>' : '',
    `        <pitch><step>${n.step}</step>${n.alter !== 0 ? `<alter>${n.alter}</alter>` : ''}<octave>${n.octave}</octave></pitch>`,
    '        <duration>4</duration>',
    '        <type>whole</type>',
    n.alter !== 0 ? `        <accidental>${ACCIDENTAL_NAME[n.alter]}</accidental>` : '',
    '      </note>',
  ].filter((l) => l !== '').join('\n')).join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<score-partwise version="3.1">',
    '  <part-list><score-part id="P1"><part-name></part-name></score-part></part-list>',
    '  <part id="P1">',
    '    <measure number="1">',
    '      <attributes>',
    '        <divisions>1</divisions>',
    '        <key><fifths>0</fifths></key>',
    '        <time print-object="no"><beats>4</beats><beat-type>4</beat-type></time>',
    `        <clef><sign>${clefSign}</sign><line>${clefLine}</line></clef>`,
    '      </attributes>',
    body,
    '    </measure>',
    '  </part>',
    '</score-partwise>',
    '',
  ].join('\n');
}
