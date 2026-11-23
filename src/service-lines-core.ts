// 2026-11-20-1003 (THE SENTENCE SERVICE AS THE FLUENT FRONT END) - the pure core (no obsidian, no DOM, no network). The GRAMMAR stays the canonical language: the service is asked, for what the grammar cannot read, to
// answer in CANONICAL SENTENCES (lines), or with ONE short clarifying question. This file builds the extra request fields and reads such an answer; the controller checks every line with the grammar (the `check` callback)
// before anything is shown, so a line the grammar refuses is dropped and said, never applied. An answer that has neither `lines` nor `question` (an older service: it answers the old `plan`) is LEGACY: the caller reads it as
// it always did. Nothing here sends vault text beyond what the request lists: the grammar table, the note's own lines, the Score's bar count and numbers, and the previous question.
/** 2026-11-19-0997: this core is the LIST MODEL's (music-composer code, reached only through src/list-model-selected.ts); the music edition's list-model.full.ts lists this string in `cores`, scripts/build-main.test.mjs greps the lean bundle for it. */
export const LIST_MODEL_SENTINEL_SERVICE_LINES_CORE = 'forge-list-model-core:service-lines-core';
import { VERBS } from './phrase-grammar-core.ts';
import { BAR_FORMS } from './bar-grammar-core.ts';
import { buildPlanRequest, planTransportRefusal } from './sentence-plan-core.ts';
import { drawSeeds, planAppend, type ReplayCtx } from './sentence-list-core.ts';
import { listOfNote } from './sentence-list-note-core.ts';
import type { GrammarParams, GrammarVault } from './phrase-grammar-core.ts';

export type LinesFamily = 'phrase' | 'arrangement' | 'composition' | 'bar';
/** The most lines taken from one answer, the longest line, the longest question, the largest answer (its json), and the caps on what the request carries. */
export const LINES_MAX = 12, LINE_MAX = 300, QUESTION_MAX = 300, ANSWER_MAX = 4000, REQUEST_LINES_MAX = 60, REQUEST_BARS_MAX = 200;
/** The version of the service that answers in lines (the proposal in the 1003 FEEDBACK). */
export const LINES_SERVICE_VERSION = '0.2.49';

export const LINES_INSTRUCTION = 'Answer only with canonical sentences from the grammar table, one per line, that do what the request says to this note; or, when the request is unclear, answer with ONE short clarifying question and no sentences.';

/** The verbs of the grammar a family can say (generated from VERBS: a verb with a kind belongs to that kind's family; the rest are listed by name, and a test fails when a new verb belongs to no family). */
const PHRASE_KINDS = new Set(['extend', 'mix', 'morph', 'transform']);
const PHRASE_VERBS = new Set(['thin out', 'double up', 'keep', 'delete', 'copy', 'move', 'bar replaced', 'threshold', 'ghost notes', 'make it']);
const ARRANGEMENT_VERBS = new Set(['volume', 'mute', 'only', 'together']);
const COMPOSITION_VERBS = new Set(['then play', 'repeat that']);
const inFamily = (f: Exclude<LinesFamily, 'bar'>, v: (typeof VERBS)[number]): boolean => f === 'phrase' ? (v.kind !== null && PHRASE_KINDS.has(v.kind)) || PHRASE_VERBS.has(v.verb)
  : f === 'arrangement' ? v.kind === 'arrangement' || ARRANGEMENT_VERBS.has(v.verb)
  : v.kind === 'composition' || COMPOSITION_VERBS.has(v.verb);

/** `verb: example` rows for the family; a bar's rows are the bar grammar's own forms. */
export function grammarTable(family: LinesFamily): string[] {
  if (family === 'bar') return BAR_FORMS.map((form) => `bar: ${form}`);
  return VERBS.filter((v) => inFamily(family, v)).map((v) => `${v.verb}: ${v.example}`);
}

export interface LinesFields {
  mode: 'lines'; note_kind: LinesFamily; grammar: string[]; list: string[]; bar_count: number | null; bar_numbers: number[]; instruction: string;
  previous?: { sentence: string; question: string };
}
/** The fields ADDED to a plan request. `barCount` null = the Score is not drawn (no numbers). */
export function linesRequestFields(input: { family: LinesFamily; list: readonly string[]; barCount: number | null; previous?: { sentence: string; question: string } }): LinesFields {
  const list = input.list.slice(0, REQUEST_LINES_MAX).map((l) => l.slice(0, LINE_MAX));
  const n = input.barCount !== null && Number.isFinite(input.barCount) ? Math.max(0, Math.floor(input.barCount)) : 0;
  return {
    mode: 'lines', note_kind: input.family, grammar: grammarTable(input.family), list, bar_count: input.barCount, bar_numbers: Array.from({ length: Math.min(n, REQUEST_BARS_MAX) }, (_, i) => i + 1), instruction: LINES_INSTRUCTION,
    ...(input.previous !== undefined ? { previous: { sentence: input.previous.sentence, question: input.previous.question } } : {}),
  };
}

// ---- the answer ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

export type LinesRead =
  | { kind: 'legacy' }
  | { kind: 'lines'; lines: string[]; dropped: Array<{ line: string; why: string }> }
  | { kind: 'question'; question: string }
  /** `status` (askLinesBar only): the HTTP status of an answer that was refused for its transport (0 = unreachable); absent = the service answered and refused. */
  | { kind: 'refused'; message: string; status?: number };

/** What the grammar says of the next line, given the lines accepted so far: null = it reads it, else the reason. */
export type LineCheck = (accepted: readonly string[], line: string) => Promise<string | null>;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
// control characters and the characters of markup, code and escapes: a sentence of the grammar has none of them (links are `[[ ]]`, which stay)
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u001f\u007f<>`{}\\]/;
const UNSAFE_ALL = new RegExp(UNSAFE.source, 'g');          // for SHOWING a dropped line: every such character becomes a space

const REASON_MAX = 240;
/** 2026-11-23-1018: the service's own words, made safe to show: markup, code and control characters become spaces, one line, capped. */
const plainReason = (v: unknown): string => (typeof v === 'string' ? v.replace(UNSAFE_ALL, ' ').replace(/\s+/g, ' ').trim().slice(0, REASON_MAX).trim() : '');

export async function readLinesAnswer(res: { status: number; json: unknown }, check: LineCheck): Promise<LinesRead> {
  if (res.status !== 200 || !isObj(res.json)) return { kind: 'legacy' };
  const json = res.json;
  if (!('lines' in json) && !('question' in json)) return { kind: 'legacy' };
  // 2026-11-23-1018: the service answers EVERY failure as { ok: false, error: <reason>, lines: null, question: null }: its reason is what the driver is told (it used to be read as "lines were not a list")
  if (json.ok === false) { const why = plainReason(json.error); return { kind: 'refused', message: why !== '' ? why : 'The service refused without saying why. Try saying it differently.' }; }
  const size = ((): number => { try { return JSON.stringify(json).length; } catch { return Number.POSITIVE_INFINITY; } })();
  if (size > ANSWER_MAX) return { kind: 'refused', message: 'The service\'s answer was too long to trust; nothing was used.' };
  const raw = json.lines;
  if (raw !== undefined && raw !== null && !Array.isArray(raw)) return { kind: 'refused', message: 'The service\'s answer could not be read: its lines were not a list.' };
  if (raw === null && (json.question === undefined || json.question === null)) return { kind: 'refused', message: 'The service gave no lines.' };          // 2026-11-23-1018: ok with neither lines nor a question
  const lines: string[] = [], dropped: Array<{ line: string; why: string }> = [];
  for (const item of (raw ?? []) as unknown[]) {
    if (typeof item !== 'string') { dropped.push({ line: String(typeof item === 'object' ? JSON.stringify(item) : item).slice(0, 80), why: 'it was not text' }); continue; }
    const line = item.trim();
    if (lines.length >= LINES_MAX) { dropped.push({ line, why: `more than ${LINES_MAX} lines` }); continue; }
    if (line === '') { dropped.push({ line, why: 'it was empty' }); continue; }
    if (item.length > LINE_MAX) { dropped.push({ line: `${line.slice(0, 60)}…`, why: 'it is too long' }); continue; }
    if (UNSAFE.test(item)) { dropped.push({ line: line.replace(UNSAFE_ALL, ' ').slice(0, 80), why: 'it has markup or control characters' }); continue; }
    let why: string | null;
    try { why = await check(lines, line); } catch { why = 'the line could not be checked'; }
    if (why !== null) dropped.push({ line, why }); else lines.push(line);
  }
  if (lines.length > 0) return { kind: 'lines', lines, dropped };
  if ('question' in json) {
    const q = json.question;
    if (typeof q !== 'string' || q.trim() === '' || q.length > QUESTION_MAX || UNSAFE.test(q)) return { kind: 'refused', message: 'The service asked a question I could not use. Try saying it differently.' };
    return { kind: 'question', question: q.trim() };
  }
  const named = dropped.slice(0, 3).map((d) => `"${d.line}" (${d.why})`).join('; ');
  return { kind: 'refused', message: `The service answered, but I could not use any line of it: ${named}.` };
}

// ---- asking (the controller's side, moved here so the lean edition carries none of it) ---------------------------------------------------------------------------------------------------------

type Res = { status: number; json: unknown };
export interface AskLinesIo<T> {
  payload: unknown; askPlan(payload: unknown): Promise<Res>;
  /** Only a sentence typed in the composer is asked in lines mode; a hand-edited Description (no composer) is asked the old way. */
  fromBox: boolean; family: LinesFamily; previous: { sentence: string; question: string } | undefined;
  readNote(): Promise<string>;
  /** The note's pane (its Score is counted for the bar numbers), the vault's names and the replay context: what the grammar needs to check a line. */
  pane: HTMLElement | undefined; vault: GrammarVault; ctx: ReplayCtx; draw(): number;
  /** The old answer (a plan), read as it always was. */
  legacy(res: Res): Promise<T>;
}
/** An answer of lines is the plan itself (`params` of the replay, the seeded `lines`); a question rides on a refusal. */
export type LinesOutcome = { ok: true; params: GrammarParams; lines: string[]; droppedNotice?: string } | { ok: false; message: string; question?: string };

/** What was left out of an answer, in one muted sentence. */
export const droppedNoticeOf = (dropped: ReadonlyArray<{ line: string; why: string }>): string => `Left out of the service's answer: ${dropped.map((d) => `"${d.line}" (${d.why})`).join('; ')}.`;

/** Ask the service for a list note's sentence: with the lines fields when it is typed in the composer, then read the answer (lines checked by the grammar, a question, or the old plan = legacy). */
export async function askLinesNote<T>(io: AskLinesIo<T>): Promise<T | LinesOutcome> {
  if (!io.fromBox || io.family === 'bar') return io.legacy(await io.askPlan(io.payload));
  const family = io.family;
  const base = listOfNote(await io.readNote().catch(() => ''), family, io.vault).list;
  const host = io.pane?.querySelector('.forge-rhythm-score-host');
  const drawn = host === null || host === undefined ? 0 : host.querySelectorAll('g.measure').length;
  const res = await io.askPlan({ ...(io.payload as object), ...linesRequestFields({ family, list: base, barCount: drawn > 0 ? drawn : null, ...(io.previous !== undefined ? { previous: io.previous } : {}) }) });
  const planOf = async (acc: readonly string[], draw: () => number) => { const seeded = drawSeeds([...acc], family, draw); return { seeded, plan: await planAppend(base, family, seeded, io.ctx) }; };
  const lr = await readLinesAnswer(res, async (acc, line) => { const p = (await planOf([...acc, line], io.draw)).plan; return p.ok === false ? p.message : null; });
  if (lr.kind === 'legacy') return io.legacy(res);
  if (lr.kind === 'refused') return { ok: false, message: lr.message };
  if (lr.kind === 'question') return { ok: false, message: lr.question, question: lr.question };
  const { seeded, plan } = await planOf(lr.lines, io.draw);
  if (plan.ok === false) return { ok: false, message: plan.message };
  if (plan.replay.params === null) return { ok: false, message: 'The service\'s lines do not change this note.' };
  return { ok: true, params: plan.replay.params, lines: seeded, ...(lr.dropped.length > 0 ? { droppedNotice: droppedNoticeOf(lr.dropped) } : {}) };
}

export interface AskBarIo {
  askPlan: ((payload: unknown) => Promise<Res>) | undefined; configured: (() => boolean) | undefined; barNames(): string[]; ownKey(): string | undefined;
  sentence: string; list: readonly string[]; check: LineCheck; previous: { sentence: string; question: string } | undefined;
  remember(q: { sentence: string; question: string } | null): void; asking(): void; trace(outcome: string): void;
}
/** A BAR sentence the bar grammar cannot read: null = the service is not offered here (the bar grammar's own refusal stands); an older service (the old plan) says it does not know bar sentences yet. */
export async function askLinesBar(io: AskBarIo): Promise<LinesRead | null> {
  if (io.askPlan === undefined || io.configured?.() === false) return null;
  const built = buildPlanRequest({ sentence: io.sentence, barNames: io.barNames(), phraseNames: [], ownKey: io.ownKey() });
  if (built.ok === false) return { kind: 'refused', message: built.message };
  io.asking();
  let res: Res;
  try { res = await io.askPlan({ ...built.payload, ...linesRequestFields({ family: 'bar', list: io.list, barCount: null, ...(io.previous !== undefined ? { previous: io.previous } : {}) }) }); }
  catch (e) { return { kind: 'refused', status: 0, message: `Could not reach the transpile service (${(e as Error)?.message ?? e}). Check your connection and Settings → Forge Actions (Beta) → Transpile service URL.` }; }
  const lr = await readLinesAnswer(res, io.check);
  if (lr.kind === 'legacy') { io.remember(null); return { kind: 'refused', status: res.status, message: planTransportRefusal(res, LINES_SERVICE_VERSION) ?? `This transpile service does not know bar sentences yet (it needs version ${LINES_SERVICE_VERSION} or newer). The person who runs it has to update it.` }; }
  io.remember(lr.kind === 'question' ? { sentence: io.sentence, question: lr.question } : null);
  io.trace(lr.kind);
  return lr;
}
