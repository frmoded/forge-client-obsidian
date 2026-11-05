// 2026-11-04-1170 (Scale Explorer 1 of 4) — the pure half of the `forge-scale` code block: parse the block, compute one scale (spelled the way its key signature spells it), number its degrees, build the staff's MusicXML and the sound plan.
// No DOM, no engine, no Obsidian: the scale is computed here in TypeScript so the block draws without Pyodide (scale-explorer-engine.test.ts checks this table against music21 for all 12 tonics x every type it knows).
// The DOM half is scale-explorer-dom.ts; the Obsidian half (processor, side view, command) is scale-explorer-view.ts, reached only through the music edition.
//
//     ```forge-scale
//     tonic: D
//     scale: dorian
//     octave: 4
//     show: piano, staff, numbers
//     controls: yes
//     ```
//
// 2026-11-04-1171: `mode: chord` + `chord: dom7` shows one chord instead (chord-names-core.ts: the table, the names, the stacked notes). The two modules import each other (this one for the quality names the parser accepts, that one for the
// spelling primitives); neither uses the other's exports while it is being evaluated, only inside functions, so the cycle is safe.
import { CHORD_QUALITIES, normalizeChordQuality, type ChordQuality } from './chord-names-core.ts';

export const SCALE_EXPLORER_LANGUAGE = 'forge-scale';
export const SCALE_EXPLORER_VIEW_TYPE = 'forge-scale-explorer';
export const SCALE_EXPLORER_COMMAND_ID = 'forge-open-scale-explorer';

export type ScaleType = 'major' | 'dorian' | 'phrygian' | 'lydian' | 'mixolydian' | 'natural minor' | 'locrian' | 'harmonic minor' | 'melodic minor';

/** In the order the dropdown lists them: the seven church modes (major = ionian, natural minor = aeolian) by brightness-ish teaching order, then the two minors that are not modes. */
export const SCALE_TYPES: readonly ScaleType[] = ['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'natural minor', 'locrian', 'harmonic minor', 'melodic minor'];

export const SCALE_TYPE_LABELS: Record<ScaleType, string> = {
  major: 'Major (Ionian)',
  dorian: 'Dorian',
  phrygian: 'Phrygian',
  lydian: 'Lydian',
  mixolydian: 'Mixolydian',
  'natural minor': 'Natural minor (Aeolian)',
  locrian: 'Locrian',
  'harmonic minor': 'Harmonic minor',
  'melodic minor': 'Melodic minor (ascending)',
};

/** Semitones above the tonic, degrees 1..7. */
const PATTERNS: Record<ScaleType, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  'natural minor': [0, 2, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  'harmonic minor': [0, 2, 3, 5, 7, 8, 11],
  'melodic minor': [0, 2, 3, 5, 7, 9, 11],
};

/** Steps along the line of fifths from the scale's tonic to the major key whose signature it wears (a mode wears its parent major's; every minor wears the natural minor's). */
const SIGNATURE_OFFSET: Record<ScaleType, number> = {
  major: 0, dorian: -2, phrygian: -4, lydian: 1, mixolydian: -1, 'natural minor': -3, locrian: -5, 'harmonic minor': -3, 'melodic minor': -3,
};

const ALIASES: Record<string, ScaleType> = { ionian: 'major', aeolian: 'natural minor', minor: 'natural minor' };

export const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
export type Step = (typeof STEPS)[number];
export const STEP_PC: Record<Step, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** Position on the line of fifths (C = 0); a sharp adds 7, a flat takes 7 away. */
const STEP_FIFTHS: Record<Step, number> = { F: -1, C: 0, G: 1, D: 2, A: 3, E: 4, B: 5 };
const SHARP_ORDER: readonly Step[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER: readonly Step[] = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

export interface ScaleShow { piano: boolean; staff: boolean; numbers: boolean }
export type ExplorerMode = 'scale' | 'chord';
export interface ScaleExplorerOptions { tonic: string; scale: ScaleType; octave: number; show: ScaleShow; controls: boolean; mode: ExplorerMode; chord: ChordQuality }

export const DEFAULT_SCALE_OPTIONS: ScaleExplorerOptions = { tonic: 'C', scale: 'major', octave: 4, show: { piano: true, staff: true, numbers: true }, controls: true, mode: 'scale', chord: 'major' };

export const MIN_OCTAVE = 1;
export const MAX_OCTAVE = 6;

export type ScaleExplorerParse = { ok: true; options: ScaleExplorerOptions } | { ok: false; message: string };

const OPTION_RE = /^([A-Za-z_]+)\s*:\s*(.*)$/;
const SUPPORTED_OPTIONS = ['tonic', 'scale', 'mode', 'chord', 'octave', 'show', 'controls'] as const;
const TONIC_RE = /^([A-Ga-g])([#b♯♭]?)$/;

/** A tonic as typed -> the spelling kept (`bb` -> `Bb`, `F♯` -> `F#`), or null. */
export function normalizeTonic(raw: string): string | null {
  const m = TONIC_RE.exec(raw.trim());
  if (!m) return null;
  const acc = m[2] === '♯' ? '#' : m[2] === '♭' ? 'b' : m[2];
  return m[1].toUpperCase() + acc;
}

export function normalizeScaleType(raw: string): ScaleType | null {
  const v = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if ((SCALE_TYPES as readonly string[]).includes(v)) return v as ScaleType;
  return ALIASES[v] ?? null;
}

export function parseScaleExplorerSource(source: string): ScaleExplorerParse {
  const bad = (message: string): ScaleExplorerParse => ({ ok: false, message });
  const lines = source.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
  const out: ScaleExplorerOptions = { ...DEFAULT_SCALE_OPTIONS, show: { ...DEFAULT_SCALE_OPTIONS.show } };
  const seen = new Set<string>();
  for (const line of lines) {
    const m = OPTION_RE.exec(line);
    if (!m) return bad(`Unrecognised line "${line}". Each line is "key: value" — ${SUPPORTED_OPTIONS.join(', ')}.`);
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (!(SUPPORTED_OPTIONS as readonly string[]).includes(key)) return bad(`Unknown option "${m[1]}" (supported: ${SUPPORTED_OPTIONS.join(', ')}).`);
    if (seen.has(key)) return bad(`The option "${key}" is given twice.`);
    seen.add(key);
    if (key === 'tonic') {
      const t = normalizeTonic(value);
      if (!t) return bad(`tonic must be a note name like C, F#, Bb (got "${value}").`);
      out.tonic = t;
    } else if (key === 'scale') {
      const s = normalizeScaleType(value);
      if (!s) return bad(`scale must be one of ${SCALE_TYPES.join(', ')} (also ionian, aeolian, minor) (got "${value}").`);
      out.scale = s;
    } else if (key === 'mode') {
      const v = value.toLowerCase();
      if (v !== 'scale' && v !== 'chord') return bad(`mode must be scale or chord (got "${value}").`);
      out.mode = v;
    } else if (key === 'chord') {
      const c = normalizeChordQuality(value);
      if (!c) return bad(`chord must be one of ${CHORD_QUALITIES.join(', ')} (got "${value}").`);
      out.chord = c;
    } else if (key === 'octave') {
      const n = /^\d+$/.test(value) ? Number(value) : NaN;
      if (!(n >= MIN_OCTAVE && n <= MAX_OCTAVE)) return bad(`octave must be a whole number from ${MIN_OCTAVE} to ${MAX_OCTAVE} (got "${value}").`);
      out.octave = n;
    } else if (key === 'show') {
      const parts = value.split(',').map((p) => p.trim().toLowerCase()).filter((p) => p !== '');
      if (parts.length === 0) return bad(`show must list what to show: piano, staff, numbers (got "${value}").`);
      const show: ScaleShow = { piano: false, staff: false, numbers: false };
      for (const p of parts) {
        if (p !== 'piano' && p !== 'staff' && p !== 'numbers') return bad(`show lists piano, staff and numbers (got "${p}" in "${value}").`);
        show[p] = true;
      }
      if (show.numbers && !show.piano) return bad('show: "numbers" labels the piano keys, so it needs "piano" too.');
      out.show = show;
    } else {
      const v = value.toLowerCase();
      if (v === 'yes' || v === 'true') out.controls = true;
      else if (v === 'no' || v === 'false') out.controls = false;
      else return bad(`controls must be yes or no (got "${value}").`);
    }
  }
  if (seen.has('chord') && out.mode !== 'chord') return bad('"chord" picks the quality of a chord, so the block needs "mode: chord".');
  if (seen.has('scale') && out.mode === 'chord') return bad('"scale" belongs to mode: scale; this block is "mode: chord" (pick the quality with "chord:").');
  return { ok: true, options: out };
}

// ---- the scale -----------------------------------------------------------------------------------------------------------------------------------------------

export interface ScaleNote {
  step: Step;
  /** -2..2: flats negative. A typed exotic tonic (G# major) can need 2; the dropdown's tonics never do. */
  alter: number;
  octave: number;
  /** 1..7, then 8 for the octave. */
  degree: number;
  /** `C#4`, `Bb3`. */
  name: string;
  midi: number;
}

function alterText(alter: number): string {
  return alter > 0 ? '#'.repeat(alter) : 'b'.repeat(-alter);
}

/** The 8 notes of the scale from `tonic` (as spelled) in `octave`: one letter per degree, so the spelling is the key signature's own. */
export function scaleNotes(tonic: string, type: ScaleType, octave: number): ScaleNote[] {
  const t = normalizeTonic(tonic);
  if (!t) throw new Error(`scaleNotes: not a note name: "${tonic}"`);
  const tonicStep = t[0] as Step;
  const tonicAlter = t.length === 1 ? 0 : t[1] === '#' ? 1 : -1;
  const tonicPc = STEP_PC[tonicStep] + tonicAlter;
  const tonicIndex = STEPS.indexOf(tonicStep);
  const pattern = PATTERNS[type];
  const notes: ScaleNote[] = [];
  for (let i = 0; i < 8; i++) {
    const degree = i + 1;
    const index = tonicIndex + i;
    const step = STEPS[index % 7];
    const oct = octave + Math.floor(index / 7);
    const target = tonicPc + (i < 7 ? pattern[i] : 12);
    let alter = (((target - STEP_PC[step]) % 12) + 12) % 12;
    if (alter > 6) alter -= 12;
    notes.push({ step, alter, octave: oct, degree, name: `${step}${alterText(alter)}${oct}`, midi: 12 * (oct + 1) + STEP_PC[step] + alter });
  }
  return notes;
}

/** `["C4","D4",...,"C5"]` — the pitch list the staff and the sound are built from. */
export function scalePitches(tonic: string, type: ScaleType, octave: number): string[] {
  return scaleNotes(tonic, type, octave).map((n) => n.name);
}

export function degreeLabels(notes: readonly ScaleNote[]): string[] {
  return notes.map((n) => String(n.degree));
}

/** A tie in the number of accidentals goes to the sharp (F# major) EXCEPT where the flat is the name people write: the natural minor on pitch class 3 is Eb minor (six flats: Eb F Gb Ab Bb Cb Db), not D# minor (six sharps) - the driver's call, 2026-11-04 (1171-2). ONE table: the chord roots follow it (chord-names-core.ts takes this list for a minor-third chord, so Eb minor is "Ebm"). */
const TIE_GOES_TO_FLAT: Partial<Record<ScaleType, readonly number[]>> = { 'natural minor': [3] };

/** The 12 tonic names the dropdown offers for a scale type, one per pitch class: for each black-key pitch class the sharp or the flat name, whichever spells the scale with fewer accidentals and no double ones (a tie goes to the sharp: F# major; the one exception is TIE_GOES_TO_FLAT: Eb minor). */
export function tonicNamesFor(type: ScaleType): string[] {
  const cost = (tonic: string): number => {
    const notes = scaleNotes(tonic, type, 4).slice(0, 7);
    return notes.reduce((c, n) => c + (Math.abs(n.alter) > 1 ? 10 : n.alter !== 0 ? 1 : 0), 0);
  };
  const names: string[] = [];
  for (let pc = 0; pc < 12; pc++) {
    const natural = STEPS.find((s) => STEP_PC[s] === pc);
    if (natural) { names.push(natural); continue; }
    const sharp = `${STEPS.find((s) => STEP_PC[s] === pc - 1)!}#`;
    const flat = `${STEPS.find((s) => STEP_PC[s] === pc + 1)!}b`;
    const tieToFlat = cost(flat) === cost(sharp) && (TIE_GOES_TO_FLAT[type] ?? []).includes(pc);
    names.push(cost(flat) < cost(sharp) || tieToFlat ? flat : sharp);
  }
  return names;
}

// ---- the staff -----------------------------------------------------------------------------------------------------------------------------------------------

/** How far round the circle of fifths the scale's key signature is: + sharps, - flats. Can pass +-7 for a typed exotic tonic (G# major = 8); scaleMusicXML then writes no signature. */
export function keySignatureFifths(tonic: string, type: ScaleType): number {
  const t = normalizeTonic(tonic);
  if (!t) throw new Error(`keySignatureFifths: not a note name: "${tonic}"`);
  const alter = t.length === 1 ? 0 : t[1] === '#' ? 1 : -1;
  return STEP_FIFTHS[t[0] as Step] + 7 * alter + SIGNATURE_OFFSET[type];
}

/** What the key signature does to each letter. */
function signatureAlters(fifths: number): Record<Step, number> {
  const alters: Record<Step, number> = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
  if (fifths > 0) for (const s of SHARP_ORDER.slice(0, fifths)) alters[s] = 1;
  if (fifths < 0) for (const s of FLAT_ORDER.slice(0, -fifths)) alters[s] = -1;
  return alters;
}

const ACCIDENTAL_NAME: Record<number, string> = { '-2': 'flat-flat', '-1': 'flat', '0': 'natural', '1': 'sharp', '2': 'double-sharp' };

/** One bar of 8 whole notes (8/1, the time signature not printed) with a clef from the octave and the scale's key signature. An accidental sign is written only where the note differs from what the signature (or an earlier sign in the bar) already says. */
export function scaleMusicXML(tonic: string, type: ScaleType, octave: number): string {
  const notes = scaleNotes(tonic, type, octave);
  const wanted = keySignatureFifths(tonic, type);
  const fifths = Math.abs(wanted) > 7 ? 0 : wanted;
  const state = new Map<string, number>();
  const sig = signatureAlters(fifths);
  const [clefSign, clefLine] = octave >= 4 ? ['G', 2] : ['F', 4];
  const body = notes.map((n) => {
    const key = `${n.step}${n.octave}`;
    const current = state.get(key) ?? sig[n.step];
    const sign = current !== n.alter;
    state.set(key, n.alter);
    return [
      '      <note>',
      `        <pitch><step>${n.step}</step>${n.alter !== 0 ? `<alter>${n.alter}</alter>` : ''}<octave>${n.octave}</octave></pitch>`,
      '        <duration>4</duration>',
      '        <type>whole</type>',
      sign ? `        <accidental>${ACCIDENTAL_NAME[n.alter]}</accidental>` : '',
      '      </note>',
    ].filter((l) => l !== '').join('\n');
  }).join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<score-partwise version="3.1">',
    '  <part-list><score-part id="P1"><part-name></part-name></score-part></part-list>',
    '  <part id="P1">',
    '    <measure number="1">',
    '      <attributes>',
    '        <divisions>1</divisions>',
    `        <key><fifths>${fifths}</fifths></key>`,
    '        <time print-object="no"><beats>8</beats><beat-type>1</beat-type></time>',
    `        <clef><sign>${clefSign}</sign><line>${clefLine}</line></clef>`,
    '      </attributes>',
    body,
    '    </measure>',
    '  </part>',
    '</score-partwise>',
    '',
  ].join('\n');
}

// ---- the sound ----------------------------------------------------------------------------------------------------------------------------------------------------

export type PlayMode = 'up' | 'down' | 'together' | 'arpeggio';
export interface PlayEvent { midi: number; startMs: number; durMs: number }

export const NOTE_STEP_MS = 450;
export const NOTE_LENGTH_MS = 420;
export const TOGETHER_LENGTH_MS = 1800;

/** Which note sounds when: up/down/arpeggio one after the other, together all at once. */
export function playEvents(midis: readonly number[], mode: PlayMode): PlayEvent[] {
  if (mode === 'together') return midis.map((midi) => ({ midi, startMs: 0, durMs: TOGETHER_LENGTH_MS }));
  const order = mode === 'down' ? [...midis].reverse() : [...midis];   // 'arpeggio' (chord mode) is the notes one after the other, upward: the same plan as 'up'
  return order.map((midi, i) => ({ midi, startMs: i * NOTE_STEP_MS, durMs: NOTE_LENGTH_MS }));
}

export function playEndMs(events: readonly PlayEvent[]): number {
  return events.reduce((end, e) => Math.max(end, e.startMs + e.durMs), 0);
}
