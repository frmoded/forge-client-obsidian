// Beat-as-data Phase 5 (drain 2026-10-05-2100) — edit a rhythm data note through the Rhythm Box widget. The pure, testable half:
// the widget<->plugin message protocol, validation that mirrors the engine's rhythm_data_to_stream schema, the pretty-printer
// (the shape of every shipped rhythm-data note), and the write path that replaces ONLY the note's fenced json block.
//
// Obsidian-free by design (the repo's pure-core convention): the view that hosts the widget lives in rhythm-edit-view.ts and
// calls into this module for every decision.
//
// Constitution: D5 says Forge's runtime does not write to hand-authored data notes and D6 defers note code that mutates another
// note at compute time. This is neither — it is an explicit, user-initiated edit of one file through a UI the user is operating
// (equivalent to typing in the editor): no note code runs, nothing is written unless the user clicks Save, and the write is
// refused if the note changed on disk since it was opened. D7 (`read_only: true`) IS honoured: such a note is never written.

import type { AutosaveStatus } from './rhythm-autosave-core.ts';

export const RHYTHM_CHANNELS = ['kick', 'snare', 'hihat'] as const;
export const MAX_RHYTHM_STEPS = 64;

/** Where the widget lives in a vault that has the music-theory content. */
/** The Beat Box view's registered type (Phase 5c: lives here so edges-view.ts can recognise a Beat Box tab without importing the view). */
export const RHYTHM_EDIT_VIEW_TYPE = 'forge-rhythm-edit';
export const RHYTHM_BOX_WIDGET_PATH = 'music_instruments/resources/html/rhythm_box.html';

/** A rhythm step: false = rest, true = a hit at the default velocity, an int 1-127 = a hit at that MIDI velocity (0 also reads as a rest). */
export type RhythmStep = boolean | number;

export interface RhythmData {
  time_signature: string;
  steps: number;
  group_size: number;
  swing_pct: number;
  tempo_bpm: number;
  channels: Record<string, RhythmStep[]>;
}

export type Validation<T> = { ok: true; value: T } | { ok: false; message: string };

// ---- message protocol ------------------------------------------------------------------------------------------

export const MSG_READY = 'forge-rhythm-ready';           // widget -> plugin, once its script has run
export const MSG_LOAD = 'forge-rhythm-load';             // plugin -> widget, in answer to ready
export const MSG_SAVE = 'forge-rhythm-save';             // widget -> plugin, on its Save click
export const MSG_SAVE_RESULT = 'forge-rhythm-save-result'; // plugin -> widget (Phase 5; still understood by the widget, no longer sent)
// Phase 5b (autosave). Backward compatible: nothing above changed.
export const MSG_RELOAD = 'forge-rhythm-reload';           // widget -> plugin: the user clicked "Reload from note"
export const MSG_STATUS = 'forge-rhythm-status';           // plugin -> widget: the autosave indicator (saving | saved | error | conflict | idle)

export type WidgetMessage =
  | { kind: 'ready' }
  | { kind: 'reload' }
  | { kind: 'save'; data: unknown }
  | { kind: 'malformed'; reason: string }   // claims to be ours but unusable: dropped with a console warning, never written
  | { kind: 'ignored' };                    // not a message we know: dropped silently

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Classify a raw `message` event payload from the widget. The caller must ALSO check `event.source === iframe.contentWindow`. */
export function parseWidgetMessage(raw: unknown): WidgetMessage {
  if (!isPlainObject(raw)) return { kind: 'ignored' };
  if (raw.type === MSG_READY) return { kind: 'ready' };
  if (raw.type === MSG_RELOAD) return { kind: 'reload' };
  if (raw.type === MSG_SAVE) {
    if (isPlainObject(raw.data)) return { kind: 'save', data: raw.data };
    return { kind: 'malformed', reason: 'a save message without a data object' };
  }
  return { kind: 'ignored' };
}

export function buildLoadMessage(data: RhythmData, noteName: string) {
  return { type: MSG_LOAD, data, noteName };
}

export function buildSaveResultMessage(ok: boolean, message: string) {
  return { type: MSG_SAVE_RESULT, ok, message };
}

/** The autosave indicator the widget shows in its host bar. `message` is present for `error` and `conflict` only. */
export function buildStatusMessage(status: AutosaveStatus) {
  return status.state === 'error' || status.state === 'conflict'
    ? { type: MSG_STATUS, state: status.state, message: status.message }
    : { type: MSG_STATUS, state: status.state };
}

// ---- validation (mirrors forge/music/lib.py rhythm_data_to_stream) ----------------------------------------------

const TOP_LEVEL_KEYS = ['time_signature', 'steps', 'group_size', 'swing_pct', 'tempo_bpm', 'channels'] as const;

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

/** Validate rhythm data as the engine would read it. Extra top-level fields are REFUSED: a save rewrites the whole block with the
 *  six known fields, so anything else would be silently dropped. `swing_pct` may be omitted (the engine defaults it to 0). */
export function validateRhythmData(raw: unknown): Validation<RhythmData> {
  const bad = (message: string): Validation<RhythmData> => ({ ok: false, message });
  if (!isPlainObject(raw)) return bad('The rhythm data must be an object.');
  for (const key of ['time_signature', 'steps', 'group_size', 'tempo_bpm', 'channels']) {
    if (!(key in raw)) return bad(`Not rhythm data: missing required field "${key}".`);
  }
  for (const key of Object.keys(raw)) {
    if (!(TOP_LEVEL_KEYS as readonly string[]).includes(key)) {
      return bad(`Unexpected field "${key}" (the Rhythm Box would drop it on save).`);
    }
  }
  if (typeof raw.time_signature !== 'string' || raw.time_signature.trim() === '') return bad('time_signature must be a non-empty string.');
  const steps = raw.steps;
  if (!isInt(steps) || steps <= 0) return bad(`steps must be a positive whole number, got ${JSON.stringify(steps)}.`);
  if (steps > MAX_RHYTHM_STEPS) return bad(`steps may be at most ${MAX_RHYTHM_STEPS}, got ${steps}.`);
  const groupSize = raw.group_size;
  if (!isInt(groupSize) || groupSize <= 0 || steps % groupSize !== 0) {
    return bad(`group_size must be a positive whole number dividing steps (steps=${steps}, group_size=${JSON.stringify(groupSize)}).`);
  }
  const swing = raw.swing_pct === undefined ? 0 : raw.swing_pct;
  if (typeof swing !== 'number' || !Number.isFinite(swing) || swing < 0 || swing > 100) {
    return bad(`swing_pct must be a number from 0 to 100, got ${JSON.stringify(raw.swing_pct)}.`);
  }
  const tempo = raw.tempo_bpm;
  if (typeof tempo !== 'number' || !Number.isFinite(tempo) || tempo <= 0) return bad(`tempo_bpm must be a positive number, got ${JSON.stringify(tempo)}.`);
  const channels = raw.channels;
  if (!isPlainObject(channels) || Object.keys(channels).length === 0) return bad('channels must be a non-empty object.');
  const out: Record<string, RhythmStep[]> = {};
  for (const [name, row] of Object.entries(channels)) {
    if (!(RHYTHM_CHANNELS as readonly string[]).includes(name)) {
      return bad(`Unknown channel "${name}" (supported: ${RHYTHM_CHANNELS.join(', ')}).`);
    }
    if (!Array.isArray(row) || row.length !== steps) return bad(`Channel "${name}" must be a list of ${steps} steps.`);
    const clean: RhythmStep[] = [];
    for (let i = 0; i < row.length; i++) {
      const v: unknown = row[i];
      const ok = v === true || v === false || (isInt(v) && v >= 0 && v <= 127);
      if (!ok) return bad(`Channel "${name}" step ${i} is ${JSON.stringify(v)} (expected false, true, or a velocity 1-127).`);
      clean.push(v as RhythmStep);
    }
    out[name] = clean;
  }
  return { ok: true, value: { time_signature: raw.time_signature, steps, group_size: groupSize, swing_pct: swing, tempo_bpm: tempo, channels: out } };
}

// ---- the pretty-printer ----------------------------------------------------------------------------------------

/** The json block as every shipped rhythm-data note has it (and as the widget's own Export JSON writes it): 2-space indent, the six
 *  keys in a fixed order, each channel array on ONE line with ", " separators. Uses "\n"; the caller converts to the note's EOL. */
export function formatRhythmJson(data: RhythmData): string {
  const lines = [
    `  "time_signature": ${JSON.stringify(data.time_signature)},`,
    `  "steps": ${data.steps},`,
    `  "group_size": ${data.group_size},`,
    `  "swing_pct": ${data.swing_pct ?? 0},`,
    `  "tempo_bpm": ${data.tempo_bpm},`,
    '  "channels": {',
  ];
  const names = Object.keys(data.channels);
  names.forEach((name, i) => {
    lines.push(`    ${JSON.stringify(name)}: ${JSON.stringify(data.channels[name]).replace(/,/g, ', ')}${i < names.length - 1 ? ',' : ''}`);
  });
  lines.push('  }');
  return `{\n${lines.join('\n')}\n}`;
}

// ---- reading and rewriting a note ------------------------------------------------------------------------------

interface ParsedNote {
  fields: Record<string, string>;
  bodyStart: number;
}

/** Leading `---` frontmatter -> its top-level scalar fields and where the body begins. Null when there is none. */
function parseFrontmatter(text: string): ParsedNote | null {
  const m = /^---(\r?\n)([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(text);
  if (!m) return null;
  const fields: Record<string, string> = {};
  for (const line of m[2].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*?)\s*$/.exec(line);
    if (!kv) continue;
    fields[kv[1]] = kv[2].replace(/^(["'])(.*)\1$/, '$2');
  }
  return { fields, bodyStart: m[0].length };
}

export interface JsonBlock {
  /** Index of the first character of the block's content (just after the opening fence line). */
  contentStart: number;
  /** Index just past the block's last content character (just before the newline that precedes the closing fence). */
  contentEnd: number;
  /** The note's line ending ("\n" or "\r\n"), taken from the opening fence line. */
  eol: string;
}

/** Locate THE fenced json block. The body must be exactly one fenced json block plus optional whitespace — anything else (prose,
 *  a second block, another fence language, an unclosed block) is refused: the write never guesses where to put the data. */
export function extractJsonBlock(text: string): ({ ok: true } & JsonBlock) | { ok: false; message: string } {
  const fm = parseFrontmatter(text);
  if (!fm) return { ok: false, message: 'The note has no frontmatter, so it is not a data note.' };
  const body = text.slice(fm.bodyStart);
  const open = /^\s*```json[ \t]*(\r?\n)/.exec(body);
  if (!open) return { ok: false, message: 'The note body must be exactly one fenced ```json block (found something else before it, or no json block).' };
  const contentStart = fm.bodyStart + open[0].length;
  const close = /\r?\n```[ \t]*(?=\r?\n|$)/.exec(text.slice(contentStart));
  if (!close) return { ok: false, message: 'The json block is not closed.' };
  const contentEnd = contentStart + close.index;
  const rest = text.slice(contentStart + close.index + close[0].length);
  if (rest.trim() !== '') return { ok: false, message: 'The note has text after the json block; it must contain exactly one fenced json block and nothing else.' };
  return { ok: true, contentStart, contentEnd, eol: open[1] };
}

/** Why this note cannot be edited, or null if it can: a data note, content_type json, not read_only (constitution D7). */
function editabilityProblem(fields: Record<string, string>): string | null {
  if (fields.type !== 'data') return `This is not a data note (type: ${fields.type ?? 'missing'}).`;
  if (fields.content_type !== 'json') return `This data note's content_type is ${fields.content_type ?? 'missing'}, not json.`;
  if (fields.read_only === 'true') return 'This note is marked read_only: true, so it will not be edited (constitution D7). Remove that line to edit it.';
  return null;
}

/** A cheap deterministic fingerprint of a note's full text (cyrb53 + length), used to detect that it changed on disk since it was opened. */
export function contentFingerprint(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}:${text.length}`;
}

export interface RhythmNote {
  data: RhythmData;
  fingerprint: string;
}

/** Read a note's text as an editable rhythm data note. */
export function readRhythmNote(text: string): Validation<RhythmNote> {
  const fm = parseFrontmatter(text);
  if (!fm) return { ok: false, message: 'The note has no frontmatter, so it is not a data note.' };
  const problem = editabilityProblem(fm.fields);
  if (problem) return { ok: false, message: problem };
  const block = extractJsonBlock(text);
  if (block.ok === false) return { ok: false, message: block.message };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(block.contentStart, block.contentEnd));
  } catch (e) {
    return { ok: false, message: `The json block is not valid JSON: ${(e as Error).message}` };
  }
  const v = validateRhythmData(parsed);
  if (v.ok === false) return { ok: false, message: v.message };
  return { ok: true, value: { data: v.value, fingerprint: contentFingerprint(text) } };
}

export type SaveResult =
  | { ok: true; text: string }
  | { ok: false; kind: 'invalid' | 'stale' | 'refused'; message: string };

/**
 * The write decision, as a pure function of (the note's CURRENT text, the fingerprint taken when it was opened, the widget's
 * payload). Returns the full new text or a refusal — the caller writes only on `ok`, inside one atomic read-modify-write.
 * Order: the payload is validated first (nothing is ever written for invalid data), then staleness, then whether the note is
 * still an editable rhythm note; only the json block's content changes — every other byte is kept.
 */
export function applySave(currentText: string, fingerprintAtLoad: string, payload: unknown): SaveResult {
  const valid = validateRhythmData(payload);
  if (valid.ok === false) return { ok: false, kind: 'invalid', message: `Not saved: ${valid.message}` };
  if (contentFingerprint(currentText) !== fingerprintAtLoad) {
    return { ok: false, kind: 'stale', message: 'Not saved: the note changed on disk since you opened it. Reopen it from the note to pick up the changes.' };
  }
  const note = readRhythmNote(currentText);
  if (note.ok === false) return { ok: false, kind: 'refused', message: `Not saved: ${note.message}` };
  const block = extractJsonBlock(currentText);
  if (block.ok === false) return { ok: false, kind: 'refused', message: `Not saved: ${block.message}` };
  const json = formatRhythmJson(valid.value).replace(/\n/g, block.eol);
  return { ok: true, text: currentText.slice(0, block.contentStart) + json + currentText.slice(block.contentEnd) };
}

// ---- command availability --------------------------------------------------------------------------------------

/** Synchronous availability for the "Edit rhythm in Rhythm Box" command: only a `type: data`, `content_type: json` note is a
 *  candidate. Whether its body is actually rhythm data (and not read_only) is checked on invocation, with a Notice naming why. */
export function isRhythmEditCandidate(frontmatter: Record<string, unknown> | null | undefined): boolean {
  return !!frontmatter && typeof frontmatter === 'object' && frontmatter.type === 'data' && frontmatter.content_type === 'json';
}

// ---- the note session behind autosave (Phase 5b) ---------------------------------------------------------------

export type ModifyVerdict = 'ignore' | 'reload' | 'conflict';

/**
 * The fingerprint bookkeeping that lets autosave write the same note over and over WITHOUT ever mistaking its own writes for an
 * external change, and still notice a real one. Pure: the caller (the view) feeds it the note's current text.
 *
 *  - baseline  the fingerprint of the note as we last read it or last wrote it.
 *  - expected  the fingerprint of the text our IN-FLIGHT write is producing. It is set INSIDE apply() (i.e. inside the atomic
 *              vault.process callback), so the modify event that write triggers — which Obsidian may deliver before the process()
 *              promise resolves — is recognised as ours.
 *  commit() makes expected the new baseline after a successful write; rollback() forgets it after a failed one.
 */
export class RhythmNoteSession {
  private baseline: string;
  private expected: string | null = null;

  constructor(baselineFingerprint: string) {
    this.baseline = baselineFingerprint;
  }

  static fromText(text: string): RhythmNoteSession {
    return new RhythmNoteSession(contentFingerprint(text));
  }

  /** Run inside the atomic read-modify-write. Same decision as applySave, plus it records what we are about to write. */
  apply(currentText: string, payload: unknown): SaveResult {
    const result = applySave(currentText, this.baseline, payload);
    if (result.ok) this.expected = contentFingerprint(result.text);
    return result;
  }

  /** The write succeeded: what we wrote is now the baseline, so the next autosave is not "stale". */
  commit(): void {
    if (this.expected !== null) {
      this.baseline = this.expected;
      this.expected = null;
    }
  }

  /** The write failed: nothing was written, forget the expectation. */
  rollback(): void {
    this.expected = null;
  }

  /** The user reloaded from the note: its current text is the new baseline. */
  rebaseline(text: string): void {
    this.baseline = contentFingerprint(text);
    this.expected = null;
  }

  /**
   * A vault `modify` event for this note arrived; what should we do?
   *  ignore    it is our own write (or a no-op touch): content equals the baseline or the write in flight.
   *  conflict  someone else changed it while a save is pending / in flight: never write over it.
   *  reload    someone else changed it and nothing of ours is pending: show the new content.
   */
  classifyModify(currentText: string, busy: boolean): ModifyVerdict {
    const fp = contentFingerprint(currentText);
    if (fp === this.baseline || fp === this.expected) return 'ignore';
    return busy ? 'conflict' : 'reload';
  }
}
