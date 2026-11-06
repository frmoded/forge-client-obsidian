// 2026-11-05-1188 (Scale Explorer: `mode: triad`) - the pure half: a triad is a SCALE and a NOTE IN IT. The root, the next-but-one note, the next-but-one again, all taken from the scale (degrees d, d+2, d+4, wrapping up an octave
// past the seventh). The three notes, their spelling, the chord's quality and Roman numeral come from `diatonicChords(tonic, type, false)` (diatonic-chords-core.ts: it stacks thirds in the scale's OWN spelling, so nothing is re-derived
// here); this file only picks one of the seven, writes the sentence about it, and says which notes of the eight-note scale staff carry the 1, 3 and 5. NO sevenths anywhere in this mode. No DOM, no engine.

import { nameChord, type ChordQuality } from './chord-names-core.ts';
import { diatonicChords, keyName } from './diatonic-chords-core.ts';
import { type ScaleNote, type ScaleType } from './scale-explorer-core.ts';

/** The legend under the readout, always visible (and the tooltip of the Roman numerals). */
export const TRIAD_LEGEND = 'Roman numeral = the degree of the root. Capital = major triad, small = minor, ° = diminished, + = augmented.';

/** What 1, 3 and 5 are called where they are shown: the notes of a triad. */
export const TRIAD_ROLES = ['root', 'third', 'fifth'] as const;
export type TriadRole = (typeof TRIAD_ROLES)[number];

export interface Triad {
  /** 1..7: the degree of the scale the root is. */
  degree: number;
  /** The three note names without octave, in the scale's spelling: "A", "C", "E". */
  root: string;
  third: string;
  fifth: string;
  /** major, minor, diminished or augmented (a triad of a scale is never anything else). */
  quality: ChordQuality;
  /** I ii iii IV V vi vii° (and III+ in a harmonic minor): the root's degree in capital for a major triad, small for a minor or diminished one. */
  numeral: string;
  /** The chord's symbol: "C", "Dm", "B°", "C+". */
  label: string;
  /** The chord's name in words, from the existing chord naming: "D minor", "B diminished", "C augmented". */
  title: string;
  /** The scale degrees of the three notes, wrapped to 1..7: root 6 of C major gives 6, 1 and 3. */
  degrees: [number, number, number];
  /** The three notes with their spelling, from `octave` upward (a note past the octave is the next octave's). */
  notes: ScaleNote[];
  midis: number[];
}

const wrap7 = (n: number): number => ((n - 1) % 7) + 1;

/** The triad whose root is degree `degree` (1..7) of the scale, from `octave`. Throws a RangeError for any other degree. */
export function triadOfDegree(tonic: string, type: ScaleType, degree: number, octave = 4): Triad {
  if (!Number.isInteger(degree) || degree < 1 || degree > 7) throw new RangeError(`triadOfDegree: the degree must be a whole number from 1 to 7 (got ${degree})`);
  const c = diatonicChords(tonic, type, false, octave)[degree - 1];
  const quality = c.quality as ChordQuality;                      // a triad stacked on a scale is major, minor, diminished or augmented: never the table-less extras (those are sevenths)
  const names = c.notes.map((n) => n.name.replace(/\d+$/, ''));
  return {
    degree, root: names[0], third: names[1], fifth: names[2], quality, numeral: c.numeral, label: c.label, title: nameChord(c.notes.map((n) => n.name)).title ?? `${c.root} ${quality}`,
    degrees: [wrap7(degree), wrap7(degree + 2), wrap7(degree + 4)], notes: c.notes, midis: c.midis,
  };
}

/** "D minor: degrees 2, 4 and 6 of C major, the ii chord". */
export function triadReadout(t: Triad, tonic: string, type: ScaleType): string {
  const [a, b, c] = t.degrees;
  return `${t.title}: degrees ${a}, ${b} and ${c} of ${keyName(tonic, type)}, the ${t.numeral} chord`;
}

/**
 * Which notehead of the scale staff (the scale's 8 notes, index 0..7, index 7 the octave) carries the 1, 3 and 5 of the triad with root `degree`: the root's own, then every other note UP the staff; what runs past the top wraps down
 * to the same note's first occurrence (the root 6 of C major: A at 5, C at 7, and the E that is past the top at 2).
 */
export function scaleStaffIndexes(degree: number): [number, number, number] {
  if (!Number.isInteger(degree) || degree < 1 || degree > 7) throw new RangeError(`scaleStaffIndexes: the degree must be a whole number from 1 to 7 (got ${degree})`);
  const at = (i: number): number => (i > 7 ? i - 7 : i);
  return [degree - 1, at(degree - 1 + 2), at(degree - 1 + 4)];
}

/** The degree a clicked notehead of the scale staff picks: its index 0..7 (the octave note, index 7, is degree 1 again). */
export const degreeOfStaffIndex = (index: number): number => wrap7(index + 1);
