// score_first M5 (drain 2026-10-22-1850) — phrases: a bar stretched into n bars, with an optional ritardando or accelerando.
//
// A phrase is a DATA NOTE in `phrases/` that holds only parameters, never bars:
//   { "kind": "extend", "source": "bar_005", "bars": 8, "style": "repeat_with_fills", "tempo_change_pct": -20 }
// The Score it shows is DERIVED (P4, P6): the source bar's data note goes through the engine's `extend_rhythm` and `rhythm_bars_to_stream`. Nothing here is stored but those five fields.
//
// Pure core (no obsidian, no engine): parse + validate (defaults, refuse), the clamps the control strip uses, the note's text and its rewrite, the next free name, the "New phrase from this
// bar" decision and its action with the vault injected, and the Score of a phrase with the engine injected. The gate (score-first vault or not) is an INPUT here; it is read in one place,
// score-first.ts, like every other score-first decision.

import { editabilityProblem, extractJsonBlock, parseFrontmatter, readRhythmNote, type RhythmData, type Validation } from './rhythm-edit-core.ts';
import { computeScore, type ScoreOutcome } from './rhythm-score-core.ts';

export const PHRASE_FOLDER = 'phrases';
export const PHRASE_VIEW_TYPE = 'forge-phrase';
const BAR_FOLDER = 'bars';                       // the same folder score-first-core.ts names; kept here so this file stays free of the profile gate's module
const BAR_PATH = /^bars\/(bar_\d+)\.md$/;
const PHRASE_PATH = /^phrases\/phrase_\d+\.md$/;
const PHRASE_NAME = /^phrase_(\d+)$/;
const SOURCE_NAME = /^[A-Za-z0-9_-]+$/;

/** The three styles `extend_rhythm` knows (`_RHYTHM_EXTEND_STYLES` in forge/music/lib.py). */
export const PHRASE_STYLES = ['repeat_with_fills', 'building', 'ghost_notes'] as const;
export type PhraseStyle = typeof PHRASE_STYLES[number];

/** What each style does, in plain words, for the strip next to the style's name (drain 2026-10-22-2100: the driver noticed bar 4 differs and nothing said why). Each is what `extend_rhythm` really does
 *  (forge/music/lib.py docstring; a real-engine test in phrase-engine.test.ts pins the fill rule), not a paraphrase of what its name suggests. */
export const PHRASE_STYLE_NOTES: Record<PhraseStyle, string> = {
  repeat_with_fills: '(every bar repeats the bar, with a fill in the last beat of every 4th bar; the last bar gets one too unless the bar before it already has one)',
  building: '(the hi-hat gets busier: quarters in bar 1, eighths in bar 2, sixteenths from bar 3)',
  ghost_notes: '(every bar repeats the bar, with quiet snare notes added between the beats, never where the bar already hits)',
};

export const PHRASE_BARS_MIN = 1;
export const PHRASE_BARS_MAX = 64;
export const PHRASE_PCT_MIN = -90;
export const PHRASE_PCT_MAX = 100;
export const PHRASE_DEFAULTS = { bars: 4, style: 'repeat_with_fills' as PhraseStyle, tempo_change_pct: 0 };

export interface PhraseParams {
  kind: 'extend';
  source: string;
  bars: number;
  style: PhraseStyle;
  tempo_change_pct: number;
}

const KEYS = ['kind', 'source', 'bars', 'style', 'tempo_change_pct'] as const;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A phrase as the engine will be asked for it. `kind` and `source` are required; the rest default. Hand-edited JSON that is wrong is REFUSED naming the field (never silently
 *  corrected: the person should see that 99 bars is not a thing); the control strip CLAMPS what it writes, so it never produces such a value. */
export function validatePhrase(raw: unknown): Validation<PhraseParams> {
  const bad = (message: string): Validation<PhraseParams> => ({ ok: false, message });
  if (!isPlainObject(raw)) return bad('The phrase must be an object.');
  for (const key of Object.keys(raw)) {
    if (!(KEYS as readonly string[]).includes(key)) return bad(`Unexpected field "${key}" (a phrase holds only ${KEYS.join(', ')}).`);
  }
  if (raw.kind !== 'extend') return bad(`kind must be "extend", got ${JSON.stringify(raw.kind)}.`);
  const source = raw.source;
  if (typeof source !== 'string' || !SOURCE_NAME.test(source)) {
    return bad(`source must be the name of a bar in ${BAR_FOLDER}/ (letters, digits, _ and -; no folder, no .md), got ${JSON.stringify(source)}.`);
  }
  const bars = raw.bars === undefined ? PHRASE_DEFAULTS.bars : raw.bars;
  if (typeof bars !== 'number' || !Number.isInteger(bars) || bars < PHRASE_BARS_MIN || bars > PHRASE_BARS_MAX) {
    return bad(`bars must be a whole number from ${PHRASE_BARS_MIN} to ${PHRASE_BARS_MAX}, got ${JSON.stringify(raw.bars)}.`);
  }
  const style = raw.style === undefined ? PHRASE_DEFAULTS.style : raw.style;
  if (typeof style !== 'string' || !(PHRASE_STYLES as readonly string[]).includes(style)) {
    return bad(`style must be one of ${PHRASE_STYLES.join(', ')}, got ${JSON.stringify(raw.style)}.`);
  }
  const pct = raw.tempo_change_pct === undefined ? PHRASE_DEFAULTS.tempo_change_pct : raw.tempo_change_pct;
  if (typeof pct !== 'number' || !Number.isFinite(pct) || pct < PHRASE_PCT_MIN || pct > PHRASE_PCT_MAX) {
    return bad(`tempo_change_pct must be a number from ${PHRASE_PCT_MIN} to ${PHRASE_PCT_MAX}, got ${JSON.stringify(raw.tempo_change_pct)}.`);
  }
  return { ok: true, value: { kind: 'extend', source, bars, style: style as PhraseStyle, tempo_change_pct: pct } };
}

/** What the control strip writes: bars as a whole number in range, the percentage in range. Anything that is not a number is the default. */
export function clampPhraseBars(n: number): number {
  if (typeof n !== 'number' || Number.isNaN(n)) return PHRASE_DEFAULTS.bars;
  return Math.min(PHRASE_BARS_MAX, Math.max(PHRASE_BARS_MIN, Math.round(n)));
}
export function clampPhrasePct(n: number): number {
  if (typeof n !== 'number' || Number.isNaN(n)) return PHRASE_DEFAULTS.tempo_change_pct;
  return Math.min(PHRASE_PCT_MAX, Math.max(PHRASE_PCT_MIN, n));
}

/** A phrase note's text -> its parameters. The note must be an editable (not read_only) `type: data`, `content_type: json` note holding exactly one json block. */
export function readPhraseNote(text: string): Validation<PhraseParams> {
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
  return validatePhrase(parsed);
}

/** The block's text, field order as in the design. */
export function formatPhraseJson(p: PhraseParams): string {
  return [
    '{',
    `  "kind": ${JSON.stringify(p.kind)},`,
    `  "source": ${JSON.stringify(p.source)},`,
    `  "bars": ${p.bars},`,
    `  "style": ${JSON.stringify(p.style)},`,
    `  "tempo_change_pct": ${p.tempo_change_pct}`,
    '}',
  ].join('\n');
}

/** A control-strip edit, as a pure rewrite of the note's CURRENT text: only the json block's content changes, every other byte (frontmatter, line endings) is kept. Refused for a note that
 *  is not an editable data note (including `read_only: true`, constitution D7). The caller runs it inside one atomic read-modify-write. */
export function applyPhraseWrite(currentText: string, p: PhraseParams): { ok: true; text: string } | { ok: false; message: string } {
  const fm = parseFrontmatter(currentText);
  if (!fm) return { ok: false, message: 'Not saved: the note has no frontmatter, so it is not a data note.' };
  const problem = editabilityProblem(fm.fields);
  if (problem) return { ok: false, message: `Not saved: ${problem}` };
  const block = extractJsonBlock(currentText);
  if (block.ok === false) return { ok: false, message: `Not saved: ${block.message}` };
  const json = formatPhraseJson(p).replace(/\n/g, block.eol);
  return { ok: true, text: currentText.slice(0, block.contentStart) + json + currentText.slice(block.contentEnd) };
}

/** The starter content of a new phrase: the defaults, the source named. The description is a double-quoted scalar (a JSON string is a YAML one). */
export function phraseNoteContent(name: string, source: string): string {
  const p: PhraseParams = { kind: 'extend', source, ...PHRASE_DEFAULTS };
  return [
    '---',
    'type: data',
    'content_type: json',
    `description: ${JSON.stringify(`${name} — ${source} stretched into a longer phrase. Parameters only; the Score is derived from the bar.`)}`,
    '---',
    '',
    '```json',
    formatPhraseJson(p),
    '```',
    '',
  ].join('\n');
}

export function phraseName(n: number): string {
  return `phrase_${String(n).padStart(3, '0')}`;
}
export function phrasePath(name: string): string {
  return `${PHRASE_FOLDER}/${name}.md`;
}
export function phraseSourcePath(source: string): string {
  return `${BAR_FOLDER}/${source}.md`;
}
/** One past the highest `phrase_NNN` (not the first gap); names that do not look like that are ignored. */
export function nextPhraseName(existingBasenames: Iterable<string>): string {
  let max = 0;
  for (const b of existingBasenames) {
    const m = PHRASE_NAME.exec(b);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return phraseName(max + 1);
}
/** Is this path a phrase (`phrases/phrase_NNN.md`, directly in the folder)? The folder's README and anything else is not. */
export function isPhrasePath(path: string | null | undefined): boolean {
  return typeof path === 'string' && PHRASE_PATH.test(path);
}
/** The bar's name when `path` is a bar (`bars/bar_NNN.md`, directly in the folder), else null. */
export function sourceBarName(path: string | null | undefined): string | null {
  if (typeof path !== 'string') return null;
  const m = BAR_PATH.exec(path);
  return m ? m[1] : null;
}

/** Is "New phrase from this bar" offered? Only in a score-first vault, and only while the active file is a bar. Everywhere else it does not exist (not hidden — absent). */
export function newPhraseAvailable(input: { scoreFirst: boolean; activePath: string | null | undefined }): boolean {
  return input.scoreFirst === true && sourceBarName(input.activePath) !== null;
}

export type NewPhrasePlan = { ok: true; name: string; path: string; content: string } | { ok: false; message: string };

export function planNewPhrase(input: { activePath: string | null | undefined; existingBasenames: Iterable<string>; exists: (path: string) => boolean; attempts?: number }): NewPhrasePlan {
  const source = sourceBarName(input.activePath);
  if (source === null) return { ok: false, message: `New phrase: open a bar from ${BAR_FOLDER}/ first (the note you are on is not a bar).` };
  const taken = new Set(input.existingBasenames);
  const attempts = input.attempts ?? 3;
  for (let i = 0; i < attempts; i++) {
    const name = nextPhraseName(taken);
    const path = phrasePath(name);
    if (!input.exists(path)) return { ok: true, name, path, content: phraseNoteContent(name, source) };
    taken.add(name);
  }
  return { ok: false, message: `Could not find a free phrase name in ${PHRASE_FOLDER}/ — try again.` };
}

export interface NewPhrasePorts<F> {
  /** The path of the note the person is on right now. */
  activePath(): string | null;
  folderExists(): boolean;
  createFolder(): Promise<void>;
  /** Basenames in `phrases/` right now (fresh on every call: a retry must see the phrase that just took the name). */
  listPhraseBasenames(): string[];
  exists(path: string): boolean;
  create(path: string, content: string): Promise<F>;
  open(file: F): Promise<void>;
  notify(message: string): void;
  /** Obsidian's refusal to create a file that is already there. */
  isAlreadyExists(e: unknown): boolean;
}

export type NewPhraseResult = { ok: true; path: string } | { ok: false; message: string };

/** The whole "New phrase from this bar" action with the vault and the UI injected (same shape as `createNewBar`): make `phrases/` if missing, pick the next free name from a FRESH listing,
 *  create the note, open it. Every failure is a notice naming the reason, plus a `console.error` naming this function for a caught error. */
export async function createNewPhrase<F>(ports: NewPhrasePorts<F>): Promise<NewPhraseResult> {
  const fail = (message: string): NewPhraseResult => { ports.notify(message); return { ok: false, message }; };
  try {
    const first = planNewPhrase({ activePath: ports.activePath(), existingBasenames: [], exists: () => false });
    if (first.ok === false) return fail(first.message);               // not on a bar: say so before touching the vault
    if (!ports.folderExists()) {
      try { await ports.createFolder(); } catch (e) { if (!ports.isAlreadyExists(e)) throw e; }
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const plan = planNewPhrase({ activePath: ports.activePath(), existingBasenames: ports.listPhraseBasenames(), exists: (p) => ports.exists(p) });
      if (plan.ok === false) return fail(plan.message);
      let file: F;
      try {
        file = await ports.create(plan.path, plan.content);
      } catch (e) {
        if (ports.isAlreadyExists(e)) continue;
        throw e;
      }
      await ports.open(file);
      return { ok: true, path: plan.path };
    }
    return fail('Could not make a new phrase: the name kept being taken. Try again.');
  } catch (e) {
    console.error('createNewPhrase failed', e);
    return fail(`Could not make a new phrase: ${(e as Error)?.message ?? e}`);
  }
}

export interface PhraseScoreDeps {
  /** The text of a vault note by path (fresh on every call). Rejects when the note is not there. */
  readNote(path: string): Promise<string>;
  /** Engine: `extend_rhythm` + `rhythm_bars_to_stream` on the source bar's data with the phrase's parameters, as a tagged MusicXML payload. */
  compute(data: RhythmData, params: PhraseParams, title: string): Promise<unknown>;
}

/** The Score of a phrase, from the phrase's parameters (already parsed JSON): validate them, read the source bar FRESH from the vault, ask the engine. A phrase that is wrong or whose source is
 *  missing or not rhythm data is a refusal naming why — never a thrown error, never a blank result. Writes nothing. */
export async function producePhrase(deps: PhraseScoreDeps, raw: unknown, title: string): Promise<ScoreOutcome> {
  const valid = validatePhrase(raw);
  if (valid.ok === false) return { kind: 'refusal', message: `Phrase: ${valid.message}` };
  const params = valid.value;
  const path = phraseSourcePath(params.source);
  let text: string;
  try {
    text = await deps.readNote(path);
  } catch (e) {
    return { kind: 'refusal', message: `Phrase: the source bar ${params.source} (${path}) was not found or could not be read (${(e as Error)?.message ?? e}).` };
  }
  const bar = readRhythmNote(text);
  if (bar.ok === false) return { kind: 'refusal', message: `Phrase: the source ${params.source} is not usable: ${bar.message}` };
  return computeScore((data, t) => deps.compute(data, params, t), bar.value.data, title);
}

/** What the phrase view hands the live Score: the phrase note's current TEXT (or why it could not be read). The Score parses it itself, so a note that is not valid is the SAME kind of
 *  refusal line as a missing source — one path, one place that says why. The source bar is read only for a phrase that is valid. */
export async function producePhraseNote(deps: PhraseScoreDeps, note: string | { unreadable: string }, title: string): Promise<ScoreOutcome> {
  if (typeof note !== 'string') return { kind: 'refusal', message: `Phrase: the phrase note could not be read (${note.unreadable}).` };
  const read = readPhraseNote(note);
  if (read.ok === false) return { kind: 'refusal', message: `Phrase: ${read.message}` };
  return producePhrase(deps, read.value, title);
}
