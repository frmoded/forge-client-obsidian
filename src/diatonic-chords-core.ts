// 2026-11-04-1172 (Scale Explorer 3 of 4) — the pure half of the diatonic row and the Roman numerals: the chords a scale builds by stacking thirds on each of its seven degrees (`diatonicChords`), and the Roman numeral of a named chord in a scale (`romanNumeral`).
// Derived from the scale's OWN spelling (Eb natural minor has Cb and Db: Ebm, Fdim, Cb, Dbm, Bbm, ...), never from chord-names-core's chordRootName (which names a pitch class by the chord family's list). No DOM, no engine.
// Checked against music21 / the engine in diatonic-chords-engine.test.ts (12 tonics x major and natural minor, and the seven major-key triads of chord_progression's `form` in C, G and Bb).

import { scaleNotes, type ScaleNote, type ScaleType } from './scale-explorer-core.ts';
import { CHORD_TABLE, nameChord, type ChordQuality } from './chord-names-core.ts';

const UPPER = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'] as const;
const LOWER = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'] as const;

/** A seventh chord the table does not have but a harmonic or melodic minor builds on its own notes (minor-major seventh on i, augmented major seventh on III): named here, not in the chord table (no sus/add/6 and no new chord types in 1171). */
interface ExtraSeventh { semitones: readonly number[]; symbol: string; suffix: string; lower: boolean }
const EXTRA_SEVENTHS: readonly ExtraSeventh[] = [
  { semitones: [0, 3, 7, 11], symbol: 'm(maj7)', suffix: 'maj7', lower: true },
  { semitones: [0, 4, 8, 11], symbol: '+maj7', suffix: '+maj7', lower: false },
];

export interface DiatonicChord {
  /** 1..7 */
  degree: number;
  /** I ii iii IV V vi vii° (triads), Imaj7 ii7 iii7 IVmaj7 V7 vi7 viiø7 (sevenths). */
  numeral: string;
  /** The chord's name in the key, spelled by the scale: C, Dm, Em, F, G, Am, B° (triads); Cmaj7, Dm7, ..., Bø7 (sevenths). */
  label: string;
  /** The table's own symbol ("Bdim", "Bm7b5"), or the extra seventh's. */
  name: string;
  root: string;
  /** null for the two extra sevenths the table does not have. */
  quality: ChordQuality | null;
  notes: ScaleNote[];
  midis: number[];
}

/** Numeral suffix, the row label's symbol, and whether the numeral is lower case, for a quality. */
const NUMERAL: Record<ChordQuality, { suffix: string; label: string; lower: boolean; inverted: string }> = {
  major: { suffix: '', label: '', lower: false, inverted: '' },
  minor: { suffix: '', label: 'm', lower: true, inverted: '' },
  diminished: { suffix: '°', label: '°', lower: true, inverted: '°' },
  augmented: { suffix: '+', label: '+', lower: false, inverted: '+' },
  maj7: { suffix: 'maj7', label: 'maj7', lower: false, inverted: 'maj' },
  dom7: { suffix: '7', label: '7', lower: false, inverted: '' },
  min7: { suffix: '7', label: 'm7', lower: true, inverted: '' },
  half_dim7: { suffix: 'ø7', label: 'ø7', lower: true, inverted: 'ø' },
  dim7: { suffix: '°7', label: '°7', lower: true, inverted: '°' },
  dom9: { suffix: '9', label: '9', lower: false, inverted: '' },
  dom11: { suffix: '11', label: '11', lower: false, inverted: '' },
  dom13: { suffix: '13', label: '13', lower: false, inverted: '' },
};

/** The figures of an inverted triad (6, 64) and an inverted seventh chord (65, 43, 42). */
const TRIAD_FIGURES = ['', '6', '64'] as const;
const SEVENTH_FIGURES = ['', '65', '43', '42'] as const;

/** Scale notes beyond the octave: degree index 0..13 (two octaves), each with its spelling and midi number. */
function twoOctaves(tonic: string, type: ScaleType, octave: number): ScaleNote[] {
  const a = scaleNotes(tonic, type, octave).slice(0, 7);
  const b = scaleNotes(tonic, type, octave + 1).slice(0, 7);
  return [...a, ...b];
}

const pcOf = (n: { midi: number }): number => ((n.midi % 12) + 12) % 12;

/** The seven chords the scale builds by stacking thirds (degrees d, d+2, d+4 and, with `sevenths`, d+6), in the key's own spelling, from `octave`. */
export function diatonicChords(tonic: string, type: ScaleType, sevenths = false, octave = 4): DiatonicChord[] {
  const all = twoOctaves(tonic, type, octave);
  const out: DiatonicChord[] = [];
  for (let i = 0; i < 7; i++) {
    const notes = [0, 2, 4, ...(sevenths ? [6] : [])].map((k) => all[i + k]);
    const rel = notes.map((n) => n.midi - notes[0].midi);
    const named = nameChord(notes.map((n) => n.name));
    const extra = EXTRA_SEVENTHS.find((e) => e.semitones.length === rel.length && e.semitones.every((s, j) => s === rel[j]));
    const root = notes[0].name.replace(/\d+$/, '');
    if (named.name !== null) {
      const q = named.quality;
      const n = NUMERAL[q];
      const numeral = `${(n.lower ? LOWER : UPPER)[i]}${n.suffix}`;
      out.push({ degree: i + 1, numeral, label: `${root}${n.label}`, name: named.name, root, quality: q, notes, midis: notes.map((x) => x.midi) });
    } else if (extra) {
      out.push({ degree: i + 1, numeral: `${(extra.lower ? LOWER : UPPER)[i]}${extra.suffix}`, label: `${root}${extra.symbol}`, name: `${root}${extra.symbol}`, root, quality: null, notes, midis: notes.map((x) => x.midi) });
    } else {
      throw new Error(`diatonicChords: ${root} on degree ${i + 1} of ${tonic} ${type} is a chord this table does not name (intervals ${rel.join(' ')})`);
    }
  }
  return out;
}

export interface NamedChordLike { root: string; quality: ChordQuality; inversion?: number }

/**
 * The Roman numeral of a named chord in a scale, or null when the chord's root is not a note of the scale. Upper case for a major third, lower case for a minor third; ° diminished, + augmented, 7 / maj7 / ø7 / °7 for the sevenths;
 * inversion figures for the triads (6, 64) and the seventh chords (65, 43, 42); a ninth, eleventh or thirteenth chord in inversion has none (null: the slash name stays).
 */
export function romanNumeral(chord: NamedChordLike, tonic: string, type: ScaleType): string | null {
  const scale = scaleNotes(tonic, type, 4).slice(0, 7);
  const rootPc = pcOfName(chord.root);
  const degree = scale.findIndex((n) => pcOf(n) === rootPc);
  if (degree < 0) return null;
  const spec = NUMERAL[chord.quality];
  if (!spec) return null;
  const letters = spec.lower ? LOWER : UPPER;
  const inv = chord.inversion ?? 0;
  if (inv === 0) return `${letters[degree]}${spec.suffix}`;
  const size = CHORD_TABLE.find((c) => c.quality === chord.quality)!.degrees.length;
  if (size === 3) return `${letters[degree]}${spec.inverted}${TRIAD_FIGURES[inv] ?? ''}`;
  if (size === 4) return `${letters[degree]}${spec.inverted}${SEVENTH_FIGURES[inv] ?? ''}`;
  return null;
}

const STEP_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** Pitch class of a spelled note name without octave ("Cb", "F#", "Bbb"). */
export function pcOfName(name: string): number {
  const m = /^([A-G])([#b]*)/.exec(name);
  if (!m) throw new Error(`pcOfName: not a note name: "${name}"`);
  return (((STEP_PC[m[1]] + [...m[2]].reduce((a, c) => a + (c === '#' ? 1 : -1), 0)) % 12) + 12) % 12;
}

/** The key's name for a sentence: "C major", "A minor" (natural), "D dorian", "A harmonic minor". */
export function keyName(tonic: string, type: ScaleType): string {
  return `${tonic} ${type === 'natural minor' ? 'minor' : type}`;
}
