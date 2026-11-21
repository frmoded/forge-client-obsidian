// 2026-11-20-1004 (THE FAILED-PROMPT REVIEW QUEUE, phase 1: a LOCAL queue; checklists/failed_prompt_review_queue_design.md sections 2, 3, 5, 6, 8) - the PURE core (no obsidian, no DOM, no file, no network). A sentence typed in a composer that
// ends unprocessed (the grammar cannot read it AND the sentence service gave nothing) becomes ONE record: one JSON line of `failed-prompts.jsonl` in the plugin's own data folder (the store is the controller's). This file knows the record and its
// limits (cut AND said), the queue file, the five resolutions (skip is the tab's own, session-only) with their undo, the personal table (a resolved sentence maps to its lines), the weekly failure list and the export.
// A record NEVER holds: a file name, a note body beyond the canonical lines, a token, the person's name; the vault is a random id made once, not its name. Everything in a record is TEXT (the tab renders it as text).
/** 2026-11-19-0997: this core is the LIST MODEL's (music-composer code, reached only through src/list-model-selected.ts); the music edition's list-model.full.ts lists this string in `cores`, scripts/build-main.test.mjs greps the lean bundle for it. */
export const LIST_MODEL_SENTINEL_FAILED_PROMPT_CORE = 'forge-list-model-core:failed-prompt-core';

export const FAILED_FILE = 'failed-prompts.jsonl';
export const RESOLVED_FILE = 'failed-prompts-resolved.jsonl';
/** The limits: a sentence 500 characters, 50 lines (each at most 300), a record 8 KB; the text of a refusal or an error 500; what a person types into a resolution: a note 500, a question 200. */
export const FP_LIMITS = { sentence: 500, lines: 50, line: 300, record: 8192, text: 500, note: 500, question: 200, build: 100 } as const;

export type FailKind = 'phrase' | 'arrangement' | 'composition' | 'bar';
const KINDS: readonly FailKind[] = ['phrase', 'arrangement', 'composition', 'bar'];
export type ServiceOutcome = 'none' | 'refused' | 'cancelled' | 'not-set-up' | `error:${string}`;
const OUTCOME = /^(none|refused|cancelled|not-set-up|error:[A-Za-z0-9._-]{1,20})$/;

export interface Resolution { kind: 'lines' | 'teach' | 'not-a-request' | 'ask'; lines?: string[]; note?: string; question?: string; time: string }
export type ResolutionInput = { kind: 'lines'; lines: string[] } | { kind: 'teach'; note: string } | { kind: 'not-a-request' } | { kind: 'ask'; question: string };
export interface FailedRecord {
  id: string; time: string; build: string; 'vault-id': string; kind: FailKind; sentence: string; lines: string[]; 'bar-count': number | null;
  'grammar-error': { message: string; column: number } | null; 'service-result': { result: ServiceOutcome; text: string }; resolution: Resolution | null;
  /** Present only when something was cut: which fields (`sentence`, `lines`, `grammar-error`, `service-text`). */
  cut?: string[];
}
export interface FailureInput {
  kind: FailKind; sentence: string; lines: readonly string[]; barCount: number | null; grammarError: { message: string; column: number } | null; service: { result: ServiceOutcome; text?: string };
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]+/g;
const clean = (v: unknown): string => String(v ?? '').replace(CONTROL, ' ').trim();
const bytes = (r: FailedRecord): number => new TextEncoder().encode(JSON.stringify(r)).length;

export function makeRecord(input: FailureInput, meta: { id: string; time: string; build: string; vaultId: string }): FailedRecord {
  const cut: string[] = [];
  let sentence = clean(input.sentence); if (sentence.length > FP_LIMITS.sentence) { sentence = sentence.slice(0, FP_LIMITS.sentence); cut.push('sentence'); }
  let lines = (Array.isArray(input.lines) ? input.lines : []).filter((l): l is string => typeof l === 'string').map((l) => clean(l).slice(0, FP_LIMITS.line));
  if (lines.length > FP_LIMITS.lines) { lines = lines.slice(0, FP_LIMITS.lines); cut.push('lines'); }
  let ge = input.grammarError === null || input.grammarError === undefined ? null : { message: clean(input.grammarError.message), column: Number.isFinite(input.grammarError.column) ? Math.max(0, Math.floor(input.grammarError.column)) : 0 };
  if (ge !== null && ge.message.length > FP_LIMITS.text) { ge = { ...ge, message: ge.message.slice(0, FP_LIMITS.text) }; cut.push('grammar-error'); }
  const result = (OUTCOME.test(String(input.service?.result)) ? input.service.result : 'none') as ServiceOutcome;
  let text = clean(input.service?.text); if (text.length > FP_LIMITS.text) { text = text.slice(0, FP_LIMITS.text); cut.push('service-text'); }
  const bc = input.barCount;
  const r: FailedRecord = {
    id: meta.id, time: meta.time, build: clean(meta.build).slice(0, FP_LIMITS.build), 'vault-id': meta.vaultId, kind: KINDS.includes(input.kind) ? input.kind : 'phrase', sentence, lines,
    'bar-count': typeof bc === 'number' && Number.isFinite(bc) && bc >= 0 ? Math.floor(bc) : null, 'grammar-error': ge, 'service-result': { result, text }, resolution: null,
  };
  const note = (what: string) => { if (!cut.includes(what)) cut.push(what); };
  while (bytes({ ...r, ...(cut.length > 0 ? { cut } : {}) }) > FP_LIMITS.record && r.lines.length > 0) { r.lines = r.lines.slice(0, Math.max(0, r.lines.length - 5)); note('lines'); }
          // the other fields are capped (sentence 500, grammar words 500, service text 500, build 100, ids short): without lines a record always fits
  return cut.length > 0 ? { ...r, cut } : r;
}

export const recordLine = (r: FailedRecord): string => JSON.stringify(r);

/** A random id from a random source and the clock (tests give both). */
export const newId = (rand: () => number, now: number): string => `fp-${Math.floor(now).toString(36)}-${Math.floor(rand() * 36 ** 6).toString(36).padStart(6, '0')}`;

/** The sentence as the personal table keys it: lower case, one space, no quotes around it, no final stop. */
export const normalise = (sentence: string): string => clean(sentence).replace(/\s+/g, ' ').replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').replace(/[.!?\s]+$/g, '').toLowerCase();

// ---- the queue file --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
function recordOf(v: unknown): FailedRecord | null {
  if (!isObj(v) || typeof v.id !== 'string' || typeof v.time !== 'string' || typeof v.sentence !== 'string' || !KINDS.includes(v.kind as FailKind) || !Array.isArray(v.lines)) return null;
  const res = isObj(v.resolution) && typeof v.resolution.kind === 'string' && typeof v.resolution.time === 'string' ? (v.resolution as unknown as Resolution) : null;
  const sr = isObj(v['service-result']) && OUTCOME.test(String(v['service-result'].result)) ? { result: v['service-result'].result as ServiceOutcome, text: typeof v['service-result'].text === 'string' ? v['service-result'].text : '' } : { result: 'none' as ServiceOutcome, text: '' };
  const ge = isObj(v['grammar-error']) && typeof v['grammar-error'].message === 'string' ? { message: v['grammar-error'].message, column: Number(v['grammar-error'].column) || 0 } : null;
  return {
    id: v.id, time: v.time, build: typeof v.build === 'string' ? v.build : '', 'vault-id': typeof v['vault-id'] === 'string' ? v['vault-id'] : '', kind: v.kind as FailKind, sentence: v.sentence,
    lines: v.lines.filter((l): l is string => typeof l === 'string'), 'bar-count': typeof v['bar-count'] === 'number' ? v['bar-count'] : null, 'grammar-error': ge, 'service-result': sr, resolution: res,
    ...(Array.isArray(v.cut) ? { cut: v.cut.filter((c): c is string => typeof c === 'string') } : {}),
  };
}
/** The records of a queue file, in file order; a line that is not a record is skipped and counted (a blank line is neither). */
export function parseQueue(text: string): { records: FailedRecord[]; bad: number } {
  const records: FailedRecord[] = []; let bad = 0;
  for (const raw of String(text ?? '').split('\n')) {
    if (raw.trim() === '') continue;
    let v: unknown; try { v = JSON.parse(raw); } catch { bad++; continue; }
    const r = recordOf(v); if (r === null) bad++; else records.push(r);
  }
  return { records, bad };
}
/** Everything as one file's text (a line per record, a final newline). */
export const queueText = (records: readonly FailedRecord[]): string => (records.length === 0 ? '' : `${records.map(recordLine).join('\n')}\n`);

/** Oldest first by time; EQUAL times keep the file order (Array.prototype.sort is stable). */
const byTime = (records: readonly FailedRecord[]): FailedRecord[] => [...records].sort((a, b) => a.time.localeCompare(b.time));
/** The unresolved records, OLDEST first (by time, then file order). */
export const pendingOf = (records: readonly FailedRecord[]): FailedRecord[] => byTime(records.filter((r) => r.resolution === null));

export function resolve(records: readonly FailedRecord[], id: string, input: ResolutionInput, time: string): FailedRecord[] {
  const res: Resolution = input.kind === 'lines' ? { kind: 'lines', lines: input.lines.filter((l) => typeof l === 'string').slice(0, FP_LIMITS.lines).map((l) => l.slice(0, FP_LIMITS.line)), time }
    : input.kind === 'teach' ? { kind: 'teach', note: input.note.slice(0, FP_LIMITS.note), time }
    : input.kind === 'ask' ? { kind: 'ask', question: input.question.slice(0, FP_LIMITS.question), time } : { kind: 'not-a-request', time };
  return records.map((r) => (r.id === id ? { ...r, resolution: res } : r));
}
export const unresolve = (records: readonly FailedRecord[], id: string): FailedRecord[] => records.map((r) => (r.id === id ? { ...r, resolution: null } : r));

// ---- the personal table, the weekly list, the export --------------------------------------------------------------------------------------------------------------------------------

/** normalised sentence -> the lines a person resolved it to (only `lines` resolutions with at least one line; a later resolution wins). */
export function tableOf(records: readonly FailedRecord[]): Map<string, string[]> {
  const table = new Map<string, string[]>();
  const resolved = records.filter((r) => (r.resolution?.kind === 'lines' ? r.resolution.lines ?? [] : []).length > 0).map((r) => ({ r })).sort((a, b) => a.r.resolution!.time.localeCompare(b.r.resolution!.time));          // a later resolution wins; equal times: the later in the file (stable sort)
  for (const { r } of resolved) table.set(normalise(r.sentence), [...r.resolution!.lines!]);
  return table;
}
export const knownLines = (table: ReadonlyMap<string, string[]>, sentence: string): string[] | null => { const l = table.get(normalise(sentence)); return l === undefined ? null : [...l]; };

/** The top failed sentences by count (normalised; ties: the earliest first), as text for the clipboard. */
export function failureList(records: readonly FailedRecord[], top: number): string {
  if (records.length === 0) return 'No failed sentences.';
  const counts = new Map<string, { n: number; first: string }>();
  for (const r of records) { const k = normalise(r.sentence); const c = counts.get(k); if (c === undefined) counts.set(k, { n: 1, first: r.time }); else { c.n++; if (r.time < c.first) c.first = r.time; } }
  const rows = [...counts.entries()].sort((a, b) => b[1].n - a[1].n || a[1].first.localeCompare(b[1].first));
  const shown = rows.slice(0, Math.max(1, top));
  return [`Failed sentences (top ${shown.length} of ${rows.length} different, ${records.length} in all)`, ...shown.map(([k, c]) => `${c.n}\t${k}`)].join('\n');
}

/** The RESOLVED records, oldest first, one JSON line each (what `failed-prompts-resolved.jsonl` holds). */
export function exportLines(records: readonly FailedRecord[]): string {
  const done = byTime(records.filter((r) => r.resolution !== null));
  return done.length === 0 ? '' : `${done.map(recordLine).join('\n')}\n`;
}
