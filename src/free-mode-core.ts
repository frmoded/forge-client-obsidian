// 2026-11-04-1172 (Scale Explorer 3 of 4) — the pure half of FREE MODE: the student toggles piano keys and a readout names what sounds. `toggleKey` keeps the picked notes in order; `freeReadout` turns the picked midi numbers and the key (a tonic and
// a scale type) into the sentence under the piano: nothing picked -> a hint; one note -> its name; two -> the interval ("major third"); three or more -> the chord name (nameChord: inversion, slash bass, the other readings as "also:"), or, when
// the table has no name for them, the interval list and NEVER a wrong name. With a key: the Roman numeral when every picked note is in the scale and the readout has a name ("I in C major"), else which notes are outside ("F# is not in C major").
// No DOM, no engine. Borrowed-chord numerals are not invented here: a chord with notes outside the scale gets the outside-notes sentence, not a numeral.

import { nameChord, type ChordName, type NoChord } from './chord-names-core.ts';
import { keyName, pcOfName, romanNumeral } from './diatonic-chords-core.ts';
import { scaleNotes, type ScaleNote, type ScaleType, type Step } from './scale-explorer-core.ts';

export interface FreeKey { tonic: string; scale: ScaleType }

export const FREE_HINT = 'Click keys to build a chord';

/** The picked midi numbers after a click on `midi`: added if absent, removed if present; always ascending, no duplicates. */
export function toggleKey(picked: readonly number[], midi: number): number[] {
  return picked.includes(midi) ? picked.filter((m) => m !== midi) : [...picked, midi].sort((a, b) => a - b);
}

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const STEP_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** A key's name for a midi number: spelled by the scale when its pitch class is in the scale (Cb in Eb minor), else with sharps. `octave` is the scientific one (middle C = C4). */
export function spellInKey(midi: number, key: FreeKey): string {
  const pc = ((midi % 12) + 12) % 12;
  const hit = scaleNotes(key.tonic, key.scale, 4).slice(0, 7).find((n) => (((n.midi % 12) + 12) % 12) === pc);
  if (!hit) return `${SHARP_NAMES[pc]}${Math.floor(midi / 12) - 1}`;
  const letterAlter = hit.name.replace(/\d+$/, '');
  const alter = [...letterAlter.slice(1)].reduce((a, c) => a + (c === '#' ? 1 : -1), 0);
  return `${letterAlter}${(midi - STEP_PC[hit.step] - alter) / 12 - 1}`;
}

const SIMPLE_INTERVALS = ['unison', 'minor second', 'major second', 'minor third', 'major third', 'perfect fourth', 'tritone', 'perfect fifth', 'minor sixth', 'major sixth', 'minor seventh', 'major seventh', 'octave'];
/** "major third": the interval from the lowest to the highest of two notes, in semitones (0 to 12 by name; wider: "major third plus an octave"). */
export function intervalLongName(semitones: number): string {
  const d = Math.abs(Math.round(semitones));
  if (d <= 12) return SIMPLE_INTERVALS[d];
  const rest = d % 12;
  const octaves = Math.floor(d / 12);
  const plus = octaves === 1 ? 'an octave' : `${octaves} octaves`;
  return rest === 0 ? (octaves === 2 ? 'two octaves' : `${octaves} octaves`) : `${SIMPLE_INTERVALS[rest]} plus ${plus}`;
}

const distinct = (xs: string[]): string[] => [...new Set(xs)];
/** "F# is not in C major" / "F# and A# are not in C major" / "F#, A# and C# are not in C major". */
export function outsideSentence(names: readonly string[], key: FreeKey): string {
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${list} ${names.length === 1 ? 'is' : 'are'} not in ${keyName(key.tonic, key.scale)}`;
}

export interface FreeReadout {
  kind: 'none' | 'note' | 'interval' | 'chord' | 'unnamed';
  /** The big line: the hint, the note, the interval, the chord's title ("C major", "C major/E") or "No chord name: ...". */
  headline: string;
  /** The other readings of the same notes (the chord's `alternatives`' names); [] when there are none. */
  also: string[];
  /** "I in C major": only when every picked note is in the scale and the chord has a name (and a numeral). */
  roman: string | null;
  /** "F# is not in C major": the picked notes that are not in the scale; null when all are in it. */
  outside: string | null;
}

export function freeReadout(picked: readonly number[], key: FreeKey): FreeReadout {
  const base = { also: [] as string[], roman: null as string | null, outside: null as string | null };
  if (picked.length === 0) return { kind: 'none', headline: FREE_HINT, ...base };
  const midis = [...picked].sort((a, b) => a - b);
  const scalePcs = new Set(scaleNotes(key.tonic, key.scale, 4).slice(0, 7).map((n) => ((n.midi % 12) + 12) % 12));
  const outsideNames = distinct(midis.filter((m) => !scalePcs.has(((m % 12) + 12) % 12)).map((m) => SHARP_NAMES[((m % 12) + 12) % 12]));
  const outside = outsideNames.length > 0 ? outsideSentence(outsideNames, key) : null;
  const names = midis.map((m) => spellInKey(m, key));
  if (midis.length === 1) return { kind: 'note', headline: names[0], ...base, outside };
  if (midis.length === 2) return { kind: 'interval', headline: intervalLongName(midis[1] - midis[0]), ...base, outside };
  const named = nameChord(names);
  if (named.name === null) {
    const none = named as NoChord;
    return { kind: 'unnamed', headline: `No chord name: ${none.intervalNames.join(' ')} above ${none.bass}`, ...base, outside };
  }
  const chord = named as ChordName;
  const numeral = outside === null ? romanNumeral(chord, key.tonic, key.scale) : null;
  return {
    kind: 'chord', headline: chord.title, also: chord.alternatives.map((a) => a.name),
    roman: numeral === null ? null : `${numeral} in ${keyName(key.tonic, key.scale)}`, outside,
  };
}

/** Is the pitch class of this spelled note name a note of the key's scale? */
export function inKey(name: string, key: FreeKey): boolean {
  const pc = pcOfName(name);
  return scaleNotes(key.tonic, key.scale, 4).slice(0, 7).some((n) => ((n.midi % 12) + 12) % 12 === pc);
}

/** The picked keys as notes for the staff: spelled by the key (see spellInKey), ascending. */
export function pickedNotes(picked: readonly number[], key: FreeKey): ScaleNote[] {
  return [...picked].sort((a, b) => a - b).map((midi) => {
    const name = spellInKey(midi, key);
    const m = /^([A-G])([#b]*)(-?\d+)$/.exec(name)!;
    const alter = [...m[2]].reduce((a, c) => a + (c === '#' ? 1 : -1), 0);
    return { step: m[1] as Step, alter, octave: Number(m[3]), degree: 0, name, midi };
  });
}

/** The clef a set of picked notes is written in: treble from G3 up, bass below. */
export function clefFor(picked: readonly number[]): 'G' | 'F' {
  return picked.length > 0 && Math.min(...picked) < 55 ? 'F' : 'G';
}
