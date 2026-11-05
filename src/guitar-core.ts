// 2026-11-04-1173 (Scale Explorer 4 of 4) — the pure half of the guitar view: where a set of pitch classes lies on the neck (`positionsOf`: EVERY position of every pitch class, in standard tuning, open string and 15 frets) and the one-line tab of a played run
// (`tabForRun`). No DOM, no engine. The tuning and the fret arithmetic are input-widget-guitar-fretboard.ts's own (TUNINGS, fretMidi): standard E2 A2 D3 G3 B3 E4 = MIDI 40 45 50 55 59 64, an integer addition per fret.
//
// STRINGS ARE NUMBERED THE WAY GUITARISTS SAY THEM: string 1 is the thinnest (E4), string 6 the lowest (E2). (The widget indexes its tuning low to high, 0 = the low E; `stringNumber` converts.) chordShape is NOT here (not part of 1173).

import { fretMidi, tuningById } from './input-widget-guitar-fretboard.ts';

export const GUITAR_FRETS = 15;
export const STANDARD_TUNING = tuningById('standard').strings;

/** The widget's index (0 = the low E) -> the string number guitarists say (6 = the low E, 1 = the high E). */
export function stringNumber(index: number): number { return STANDARD_TUNING.length - index; }
/** and back. */
export function stringIndex(stringNo: number): number { return STANDARD_TUNING.length - stringNo; }

export interface GuitarPosition {
  /** 1..6, 1 = the thinnest string. */
  string: number;
  /** 0 = open .. GUITAR_FRETS. */
  fret: number;
  midi: number;
  /** The pitch class 0..11. */
  pc: number;
  isRoot: boolean;
  /** The pitch class's degree in the input (1-based, in the order the distinct pitch classes first appear), or the number the caller gave it. */
  degree: number;
}

const STEP_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** A pitch class from a note name ("C", "F#", "Bb3": the octave is ignored) or a number (already a pitch class, 0..11). */
export function pitchClassOf(x: string | number): number {
  if (typeof x === 'number') return ((x % 12) + 12) % 12;
  const m = /^([A-Ga-g])([#b-]*)/.exec(x.trim());
  if (!m) throw new Error(`pitchClassOf: not a note name: "${x}"`);
  const alter = [...m[2]].reduce((a, c) => a + (c === '#' ? 1 : -1), 0);
  return (((STEP_PC[m[1].toUpperCase()] + alter) % 12) + 12) % 12;
}

export interface PositionsOptions {
  /** The root's pitch class; default: the first input's. */
  root?: number | null;
  /** The degree to report for a pitch class (the scale's degree, the chord tone's number); default: its order of appearance, 1-based. */
  degrees?: ReadonlyMap<number, number>;
}

/**
 * EVERY position (string, fret) of every pitch class in the input, strings 6 to 1 and frets 0 to `frets`. Input: note names (octaves ignored) or pitch classes (numbers 0..11). A scale shows all its notes everywhere on the neck.
 * Each position: its string number (1 = thinnest), fret, midi (= the open string + the fret), pitch class, `isRoot` (exactly the root's pitch class) and `degree`.
 */
export function positionsOf(input: readonly (string | number)[], frets = GUITAR_FRETS, opts: PositionsOptions = {}): GuitarPosition[] {
  const order: number[] = [];
  for (const x of input) { const pc = pitchClassOf(x); if (!order.includes(pc)) order.push(pc); }
  const root = opts.root === undefined ? (order.length > 0 ? order[0] : null) : opts.root;
  const out: GuitarPosition[] = [];
  STANDARD_TUNING.forEach((_open, idx) => {
    for (let fret = 0; fret <= frets; fret++) {
      const midi = fretMidi(tuningById('standard'), idx, fret);
      const pc = midi % 12;
      const i = order.indexOf(pc);
      if (i < 0) continue;
      out.push({ string: stringNumber(idx), fret, midi, pc, isRoot: root !== null && pc === root, degree: opts.degrees?.get(pc) ?? i + 1 });
    }
  });
  return out;                                              // built string 6 to 1, frets ascending: already in order
}

/** Every position that sounds exactly `midi` (one pitch has several: E3 lies on three strings, middle C on four). */
export function positionsOfMidi(midi: number, frets = GUITAR_FRETS): { string: number; fret: number }[] {
  const out: { string: number; fret: number }[] = [];
  STANDARD_TUNING.forEach((open, idx) => { const fret = midi - open; if (fret >= 0 && fret <= frets) out.push({ string: stringNumber(idx), fret }); });
  return out;                                              // string 6 to 1
}

export interface TabNote { string: number; fret: number; midi: number }

/**
 * The tab of a run: for each note the LOWEST FRET that plays it on the neck (an open string beats any fretted one), and where two strings give the same lowest fret the lower string (there is none in standard tuning, the rule is stated
 * for other tunings). A note below the low E or above fret 15 of the high E has no position: it is `null` (the tab writes "x").
 * Input: midi numbers or note names WITH an octave ("C3", "F#2", "Bb3").
 */
export function tabForRun(run: readonly (string | number)[], frets = GUITAR_FRETS): (TabNote | null)[] {
  return run.map((x) => {
    const midi = typeof x === 'number' ? x : midiOfName(x);
    const options = positionsOfMidi(midi, frets);
    if (options.length === 0) return null;
    const best = options.reduce((b, o) => (o.fret < b.fret ? o : b));   // options run from the lowest string up, so a tie in the fret (there is none in standard tuning) goes to the lower string
    return { string: best.string, fret: best.fret, midi };
  });
}

/** The one-line tab: "5:3 4:0 4:2 ..." (string:fret, the string number guitarists say), "x" for a note off the neck. */
export function tabText(run: readonly (TabNote | null)[]): string {
  return run.map((n) => (n === null ? 'x' : `${n.string}:${n.fret}`)).join(' ');
}

export function midiOfName(name: string): number {
  const m = /^([A-Ga-g])([#b-]*)(-?\d+)$/.exec(name.trim());
  if (!m) throw new Error(`midiOfName: need a note name with an octave: "${name}"`);
  const alter = [...m[2]].reduce((a, c) => a + (c === '#' ? 1 : -1), 0);
  return 12 * (Number(m[3]) + 1) + STEP_PC[m[1].toUpperCase()] + alter;
}

/** Where the inlays are (the double dot at 12). */
export const INLAY_FRETS = [3, 5, 7, 9, 15] as const;
export const DOUBLE_INLAY_FRET = 12;
