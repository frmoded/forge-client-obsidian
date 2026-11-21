// 2026-11-20-1004 (THE FAILED-PROMPT REVIEW QUEUE, phase 1) - the SETUP core (no `obsidian` import): what the composer's controller hands in when a sentence ends unprocessed (`noteFailure`), the one object the plugin builds (`createReview`: the store,
// the port the controller records through, the review tab's ports, the weekly list, the "+" menu entry), and the grammar check the tab uses (the COMPOSER'S: planAppend over the item's lines for a phrase, an arrangement or a composition,
// planBarAppend for a bar). The Obsidian side (the ItemView, the commands, the setting, the adapter) is src/failed-prompt-view.ts.
/** 2026-11-19-0997: this module is the LIST MODEL's (music-composer code, reached only through src/list-model-selected.ts). */
export const LIST_MODEL_SENTINEL_FAILED_PROMPT_SETUP_CORE = 'forge-list-model-core:failed-prompt-setup-core';
import { failureList, type FailKind, type FailedRecord, type FailureInput } from './failed-prompt-core.ts';
import { createFailedStore, type FailedStore, type FileAdapter } from './failed-prompt-store.ts';
import type { ReviewTabPorts } from './failed-prompt-tab-dom.ts';
import { planAppend } from './sentence-list-core.ts';
import { listOfNote } from './sentence-list-note-core.ts';
import { planBarAppend } from './bar-list-core.ts';
import type { GrammarVault } from './phrase-grammar-core.ts';

/** The "+" menu entry's id (the composer's menu runs it). */
export const REVIEW_MENU_ID = 'review-unprocessed-sentences';
/** What the composer's controller sees of the queue (absent in lean and when nothing set it up). */
export interface FailedPromptsPort {
  record(input: FailureInput): void; known(sentence: string): string[] | null;
  /** The description controller hands itself over once it exists (the tab's "Apply to the open note" appends through it). */
  attach?(controller: { appendLine(path: string, sentence: string): Promise<{ ok: boolean; message: string }> }): void;
  /** The composer's "+" menu entry (null when nothing waits) and what it does. */
  menuItem?(): { id: string; label: string } | null; open?(): void;
}

export interface NoteFailureInput {
  family: FailKind; sentence: string;
  /** A list note: its text and the vault's names (the canonical lines are parsed from them); a bar: its own lines. */
  cur?: string; vault?: GrammarVault; lines?: readonly string[];
  /** The note's open pane: its Score's drawn bars are counted (only the number is kept). */
  pane?: HTMLElement | undefined;
  grammar: { message: string; column: number } | null; service: FailureInput['service'];
}
/** Hand one failure to the queue's port: nothing happens when there is no port. Never throws into the composer. */
export function noteFailure(port: FailedPromptsPort | undefined, i: NoteFailureInput): void {
  try {
    const lines = i.family === 'bar' ? [...(i.lines ?? [])] : listOfNote(i.cur ?? '', i.family, i.vault as GrammarVault).list;
    const host = i.pane?.querySelector('.forge-rhythm-score-host'); const n = host === null || host === undefined ? 0 : host.querySelectorAll('g.measure').length;
    port?.record({ kind: i.family, sentence: i.sentence, lines, barCount: i.family === 'bar' || n === 0 ? null : n, grammarError: i.grammar, service: i.service });
  } catch { /* a queue that cannot take a record never breaks the composer */ }
}

export interface ReviewDeps {
  adapter: FileAdapter; dir: string; enabled(): boolean; build(): string; now(): number; rand(): number; warn(line: string): void; vault(): GrammarVault;
  active(): { path: string; kind: FailKind; lines: string[] } | null; applyLines(path: string, lines: string[]): Promise<{ ok: boolean; message: string }>; copy(text: string): Promise<void>;
}
export interface Review {
  store: FailedStore; port: FailedPromptsPort; tabPorts: ReviewTabPorts;
  menuItem(): { id: string; label: string } | null;
  /** What the plugin gives the controller's `open` (the tab opener) and what "Apply to the open note" uses (the controller attached itself). */
  bindOpen(open: () => void): void; appendLine(path: string, sentence: string): Promise<{ ok: boolean; message: string }>;
  failureText(): Promise<string>; copyFailureList(): Promise<string>;
  /** Wait for every record handed to the port so far to be on disk. */
  settle(): Promise<void>;
}

export function createReview(d: ReviewDeps): Review {
  const store = createFailedStore({ adapter: d.adapter, dir: d.dir, enabled: d.enabled, build: d.build, now: d.now, rand: d.rand, warn: d.warn });
  let inflight: Promise<unknown> = Promise.resolve();
  let controller: { appendLine(path: string, sentence: string): Promise<{ ok: boolean; message: string }> } | null = null; let opener: () => void = () => {};
  const menuItem = (): { id: string; label: string } | null => { const n = store.pendingCount(); return n > 0 ? { id: REVIEW_MENU_ID, label: `Review unprocessed (${n})` } : null; };
  const port: FailedPromptsPort = {
    record: (input) => { inflight = inflight.then(() => store.record(input)).catch(() => undefined); }, known: (s) => store.known(s),
    attach: (c) => { controller = c; }, menuItem, open: () => { opener(); },
  };
  const checkLines = async (item: FailedRecord, lines: string[]): Promise<Array<string | null>> => {
    const out: Array<string | null> = []; const accepted: string[] = [];          // a line is checked after the lines that READ above it (a refused line does not count for the next one)
    for (let i = 0; i < lines.length; i++) {
      const upto = [...accepted, lines[i]];
      const p = item.kind === 'bar' ? planBarAppend(item.lines, upto) : await planAppend(item.lines, item.kind, upto, { vault: d.vault() });
      const said = p.ok === false ? `The grammar did not accept this sentence (column ${p.column}: ${p.message}).` : null;
      out.push(said); if (said === null) accepted.push(lines[i]);
    }
    return out;
  };
  const tabPorts: ReviewTabPorts = {
    enabled: d.enabled, load: async () => (await store.load()).records, save: (r) => store.save(r), check: checkLines, copy: d.copy, exportResolved: () => store.exportResolved(),
    active: d.active, applyLines: d.applyLines, now: () => new Date(d.now()).toISOString(),
  };
  const failureText = async (): Promise<string> => failureList((await store.load()).records, 20);
  return {
    store, port, tabPorts, settle: async () => { await inflight; },
    menuItem, bindOpen: (open) => { opener = open; },
    appendLine: async (path, sentence) => (controller === null ? { ok: false, message: 'The composer is not ready.' } : controller.appendLine(path, sentence)),
    failureText, copyFailureList: async () => { const t = await failureText(); await d.copy(t); return t; },
  };
}

// ---- the controller's tracker (the bookkeeping of "which sentence ended how", moved behind the seam so the lean edition carries only thin calls) ------------------------------------------------------------------------

export interface Tracker {
  /** The grammar rejected the last sentence typed in this note's composer (and the note's text then). */
  rejected(path: string, plan: { message: string; column: number }, cur: string): void;
  /** How the last request to the service ended without a plan: an HTTP status (0 = unreachable), 'none' (not built) or null (a new request: forget). 200 = the service answered and refused. */
  svc(path: string, how: number | 'none' | null, text?: string): void;
  /** The sentence ended unprocessed for this reason (`result`: none, not-set-up, cancelled). */
  fail(path: string, sentence: string, result: string, text?: string): void;
  /** The request ended: records the sentence if it ended without a plan (see `svc`). */
  ended(path: string, sentence: string): void;
  /** A write went through: the next failure of the same sentence is a new one. */
  forget(path: string): void;
  known(sentence: string): string[] | null;
  /** A BAR sentence that ended unprocessed: `how` is 'unoffered' (no service here), 'cancelled', or the refusal (`status` as in `svc`). */
  bar(path: string, sentence: string, lines: readonly string[], grammar: { message: string; column: number } | null, how: 'unoffered' | 'cancelled' | { status?: number; text: string }): void;
}
/** What the tracker reads of the controller's ports (the controller passes its own `ports`). */
export interface TrackerPorts { failedPrompts?: FailedPromptsPort | undefined; askPlan?: unknown; vault(): GrammarVault; panes(): Array<{ path: string; contentEl: HTMLElement }> }
const resultOf = (status: number | undefined): string => (status === undefined || status === 200 ? 'refused' : status === 0 ? 'error:unreachable' : `error:${status}`);

/** null = there is no queue port (the setting is off, lean): the controller then keeps nothing and records nothing. */
export function createTracker(ports: TrackerPorts, familyOf: (path: string) => FailKind | null): Tracker | null {
  const port = ports.failedPrompts;
  if (port === undefined) return null;
  const d = { family: (path: string): Exclude<FailKind, 'bar'> | null => { const f = familyOf(path); return f === 'bar' ? null : f; }, vault: () => ports.vault(), pane: (path: string) => ports.panes().find((p) => p.path === path)?.contentEl, offered: (): 'none' | 'not-set-up' => (ports.askPlan === undefined ? 'none' : 'not-set-up') };
  const rejected = new Map<string, { message: string; column: number; cur: string }>(), ended = new Map<string, { result: string; text: string }>(), last = new Map<string, string>();
  const fail = (path: string, sentence: string, result: string, text = ''): void => {
    const r = rejected.get(path), family = d.family(path);
    if (r === undefined || family === null || last.get(path) === sentence) return;
    last.set(path, sentence);
    noteFailure(port, { family, sentence, cur: r.cur, vault: d.vault(), pane: d.pane(path), grammar: { message: r.message, column: r.column }, service: { result: result as never, text } });
  };
  return {
    rejected: (path, plan, cur) => { rejected.set(path, { message: plan.message, column: plan.column, cur }); },
    svc: (path, how, text = '') => { if (how === null) ended.delete(path); else ended.set(path, { result: how === 'none' ? 'none' : resultOf(how), text }); },
    fail, ended: (path, sentence) => { const e = ended.get(path); if (e !== undefined) fail(path, sentence, e.result, e.text); },
    forget: (path) => { last.delete(path); },
    known: (s) => port.known(s),
    bar: (path, sentence, lines, grammar, how) => {
      const key = `bar:${path}`; if (last.get(key) === sentence) return; last.set(key, sentence);
      const service = how === 'unoffered' ? { result: d.offered(), text: '' } : how === 'cancelled' ? { result: 'cancelled', text: '' } : { result: resultOf(how.status), text: how.text };
      noteFailure(port, { family: 'bar', sentence, lines, grammar, service: service as never });
    },
  };
}
