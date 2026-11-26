// 2026-11-23-1030 (pitch in bars, Stage 1a: a MELODY BAR) - the DATA of a melody bar, pure (no `obsidian`, no DOM, no vault). A melody bar is a `bars/bar_NNN.md` data note whose json is
//   { "time_signature": "4/4", "steps": 16, "group_size": 4, "tempo_bpm": 100, "instrument": "cello", "notes": [ { "step": 1, "pitch": "G3", "length": 1 }, ... ] }       and NO `channels`.
// `step` counts from 1; `length` is in steps; a note must END INSIDE the bar (no tie across the barline yet); one voice: two notes never start on one step and a note never starts while another sounds.
// `pitch` is said one way here: a capital letter, `#` or `b`, and the octave (`C4` is middle C, `F#3`, `Bb4`); music21's own flat (`B-4`) is READ and said `Bb4` (the engine reads both: lib.py `_melody_pitch`).
// `instrument` is a General MIDI program by NAME from a small table (the engine's `_MELODY_INSTRUMENTS`: piano 0, guitar 24, mandolin 25 (steel guitar), violin 40, cello 42; the engine sets the program).
import { MAX_RHYTHM_STEPS, contentFingerprint, editabilityProblem, extractJsonBlock, parseFrontmatter, type Validation } from './rhythm-edit-core.ts';
/** 2026-11-23-1030: this core is the LIST MODEL's (music-composer code, reached only through src/list-model-selected.ts); the music edition's list-model.full.ts lists this string in `cores`, scripts/build-main.test.mjs greps the lean bundle for it. */
export const LIST_MODEL_SENTINEL_MELODY_BAR_CORE = 'forge-list-model-core:melody-bar-core';

export interface MelodyNote { step: number; pitch: string; length: number }
export interface MelodyData { time_signature: string; steps: number; group_size: number; tempo_bpm: number; instrument: string; notes: MelodyNote[] }

export const MELODY_INSTRUMENTS = ['piano', 'guitar', 'mandolin', 'violin', 'cello'] as const;
const INSTRUMENT_WORDS = `${MELODY_INSTRUMENTS.slice(0, -1).join(', ')} and ${MELODY_INSTRUMENTS[MELODY_INSTRUMENTS.length - 1]}`;
export const instrumentWords = (): string => INSTRUMENT_WORDS;
const SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** The bar of an EMPTY list: 4/4, 16 steps, tempo 100, the piano, no notes. */
export const MELODY_BASE: MelodyData = { time_signature: '4/4', steps: 16, group_size: 4, tempo_bpm: 100, instrument: 'piano', notes: [] };

export type Pitch = { ok: true; name: string; midi: number } | { ok: false; message: string };
/** A pitch as a person writes it (`Bb4`, `F#3`, any case) or as music21 does (`B-4`) -> its one spelling (`Bb4`) and MIDI number. Never throws. */
export function parsePitch(text: unknown): Pitch {
  const m = typeof text === 'string' ? /^([A-Ga-g])([#b-]?)(\d)$/.exec(text) : null;
  if (m === null) return { ok: false, message: `${typeof text === 'string' && text !== '' ? `"${text}"` : 'That'} is not a note name with an octave: a letter A to G, an optional # or b, and an octave 0 to 9, like C4 (middle C), F#3 or Bb4.` };
  const letter = m[1].toUpperCase(), accidental = m[2] === '-' ? 'b' : m[2];
  const midi = (Number(m[3]) + 1) * 12 + SEMITONE[letter] + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0);
  if (midi < 0 || midi > 127) return { ok: false, message: `"${text}" is outside the 128 notes MIDI has.` };
  return { ok: true, name: `${letter}${accidental}${m[3]}`, midi };
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const plural = (n: number): string => `${n} step${n === 1 ? '' : 's'}`;

/** The words for a note that does not fit the bar (the grammar and the validator say it the same way). */
export const endsOutside = (n: MelodyNote, steps: number): string => `A note must end inside the bar: ${n.pitch} on step ${n.step} for ${plural(n.length)} would end after step ${steps} (a tie across the barline is not possible yet).`;
export const onlyOneVoice = (later: MelodyNote, sounding: MelodyNote): string => later.step === sounding.step
  ? `A melody bar is one voice, so it plays one note at a time: step ${later.step} already has ${sounding.pitch} (two notes on one step are not possible yet; clear step ${sounding.step} first).`
  : `A melody bar is one voice, so it plays one note at a time: ${later.pitch} on step ${later.step} starts while ${sounding.pitch} (step ${sounding.step} for ${plural(sounding.length)}) still sounds (clear step ${sounding.step} first).`;

const TOP = ['time_signature', 'steps', 'group_size', 'tempo_bpm', 'instrument', 'notes'] as const;
/** Validate melody data as the engine would read it (its `melody_data_to_stream`), strictly: the six keys and nothing else; the notes come back sorted by step with their pitches said one way. */
export function validateMelodyData(raw: unknown): Validation<MelodyData> {
  const bad = (message: string): Validation<MelodyData> => ({ ok: false, message });
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return bad('The melody data must be an object.');
  const r = raw as Record<string, unknown>;
  if ('channels' in r) return bad('A melody bar has notes, not channels (a bar is a rhythm bar or a melody bar, never both).');
  for (const k of TOP) if (!(k in r)) return bad(`Not melody data: missing required field "${k}".`);
  for (const k of Object.keys(r)) if (!(TOP as readonly string[]).includes(k)) return bad(`Unexpected field "${k}" (a melody bar is ${TOP.join(', ')}).`);
  if (typeof r.time_signature !== 'string' || !/^\d+\/\d+$/.test(r.time_signature)) return bad('time_signature must be a string like "4/4".');
  const steps = r.steps;
  if (!isInt(steps) || steps <= 0 || steps > MAX_RHYTHM_STEPS) return bad(`steps must be a whole number from 1 to ${MAX_RHYTHM_STEPS}, got ${JSON.stringify(steps)}.`);
  const group = r.group_size;
  if (!isInt(group) || group <= 0 || steps % group !== 0) return bad(`group_size must be a positive whole number dividing steps (steps=${steps}, group_size=${JSON.stringify(group)}).`);
  const tempo = r.tempo_bpm;
  if (typeof tempo !== 'number' || !Number.isFinite(tempo) || tempo <= 0) return bad(`tempo_bpm must be a positive number, got ${JSON.stringify(tempo)}.`);
  const inst = typeof r.instrument === 'string' ? r.instrument.toLowerCase() : '';
  if (!(MELODY_INSTRUMENTS as readonly string[]).includes(inst)) return bad(`instrument must be one of ${INSTRUMENT_WORDS}, got ${JSON.stringify(r.instrument)}.`);
  if (!Array.isArray(r.notes)) return bad('notes must be a list.');
  const notes: MelodyNote[] = [];
  for (const [i, row] of r.notes.entries()) {
    const at = `note ${i + 1}`;
    if (row === null || typeof row !== 'object' || Array.isArray(row)) return bad(`${at} must be an object with step, pitch and length.`);
    const n = row as Record<string, unknown>;
    for (const k of ['step', 'pitch', 'length']) if (!(k in n)) return bad(`${at}: missing required field "${k}".`);
    for (const k of Object.keys(n)) if (!['step', 'pitch', 'length'].includes(k)) return bad(`${at}: unexpected field "${k}" (a note is step, pitch and length; one voice has no velocity yet).`);
    if (!isInt(n.step) || n.step < 1 || n.step > steps) return bad(`${at}: step must be a whole number from 1 to ${steps}, got ${JSON.stringify(n.step)}.`);
    if (!isInt(n.length) || n.length < 1) return bad(`${at}: length must be a whole number of steps, 1 or more, got ${JSON.stringify(n.length)}.`);
    const p = parsePitch(n.pitch);
    if (p.ok === false) return bad(`${at}: ${p.message}`);
    const note = { step: n.step, pitch: p.name, length: n.length };
    if (note.step + note.length - 1 > steps) return bad(`${at}: ${endsOutside(note, steps)}`);
    notes.push(note);
  }
  notes.sort((a, b) => a.step - b.step);
  for (let i = 1; i < notes.length; i++) if (notes[i].step < notes[i - 1].step + notes[i - 1].length) return bad(onlyOneVoice(notes[i], notes[i - 1]));
  return { ok: true, value: { time_signature: r.time_signature, steps, group_size: group, tempo_bpm: tempo, instrument: inst, notes } };
}

/** The json block of a melody bar: the five keys, then `notes`, one note a line. "\n" line ends; the caller converts to the note's. */
export function formatMelodyJson(d: MelodyData): string {
  const notes = d.notes.length === 0 ? '  "notes": []' : `  "notes": [\n${d.notes.map((n) => `    { "step": ${n.step}, "pitch": ${JSON.stringify(n.pitch)}, "length": ${n.length} }`).join(',\n')}\n  ]`;
  return `{\n  "time_signature": ${JSON.stringify(d.time_signature)},\n  "steps": ${d.steps},\n  "group_size": ${d.group_size},\n  "tempo_bpm": ${d.tempo_bpm},\n  "instrument": ${JSON.stringify(d.instrument)},\n${notes}\n}`;
}

export interface MelodyNoteRead { data: MelodyData; fingerprint: string }
/** A note's text as an editable melody bar (a data note, json, not read_only, one json block that is melody data). Never throws. */
export function readMelodyNote(text: string): Validation<MelodyNoteRead> {
  const fm = parseFrontmatter(String(text ?? ''));
  if (fm === null) return { ok: false, message: 'The note has no frontmatter, so it is not a data note.' };
  const problem = editabilityProblem(fm.fields);
  if (problem !== null) return { ok: false, message: problem };
  const block = extractJsonBlock(text);
  if (block.ok === false) return { ok: false, message: block.message };
  let parsed: unknown;
  try { parsed = JSON.parse(text.slice(block.contentStart, block.contentEnd)); } catch (e) { return { ok: false, message: `The json block is not valid JSON: ${(e as Error).message}` }; }
  const v = validateMelodyData(parsed);
  return v.ok === false ? { ok: false, message: v.message } : { ok: true, value: { data: v.value, fingerprint: contentFingerprint(text) } };
}

/** The text of a NEW melody bar: an empty list (`lines: []`), the base bar, and `melody: true` (the mark the phrase sentences read, synchronously, to say a melody bar cannot be used in a phrase yet). */
export function melodyNoteTemplate(name: string): string {
  return ['---', 'type: data', 'content_type: json', 'melody: true', `description: ${JSON.stringify(`${name} - a melody bar: say its notes in sentences, like Note G3 on step 1 for 1 step.`)}`, 'lines: []', '---', '', '```json', formatMelodyJson(MELODY_BASE), '```', ''].join('\n');
}

/** 2026-11-25-1042: the paths THIS session wrote with `melody: true` in their front matter (a melody bar made, a phrase whose head is a Repeat of one). Obsidian's metadata cache lags a write by a moment: until it has the front matter, the session's own word stands in. */
const wroteMelody = new Set<string>();
/** Remember (or forget) what a write of `path` said: the text's front matter holds the line `melody: true` or it does not. */
export const markMelody = (path: string, text: string): void => { (/^---\r?\n(?:(?!---)[^\n]*\n)*?melody: true\r?\n/.test(text) ? wroteMelody.add(path) : wroteMelody.delete(path)); };
/** The basenames in `folder` whose note says `melody: true`: the cache's word when it has the front matter (it is believed), this session's own writes when it has none yet. */
export const melodyNames = (app: { vault: { getFiles(): Array<{ path: string; basename: string }> }; metadataCache?: { getFileCache?(f: never): { frontmatter?: { melody?: unknown } } | null | undefined } }, folder: string): string[] =>
  app.vault.getFiles().filter((f) => { const fm = app.metadataCache?.getFileCache?.(f as never)?.frontmatter; return f.path.startsWith(`${folder}/`) && (fm === undefined || fm === null ? wroteMelody.has(f.path) : fm.melody === true); }).map((f) => f.basename);

/** Is this note a melody bar? (The tab, the list and the phrase machinery ask this; a rhythm bar and every other note: false.) */
export const isMelodyNote = (text: string): boolean => readMelodyNote(text).ok;
