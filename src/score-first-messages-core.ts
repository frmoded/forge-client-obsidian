// score_first_experiment M4 (drain 2026-10-21-2010) — where a message goes in a score-first vault.
//
// In a vault that declares `profile = "score_first"` the engraved Score is the primary surface: what the person needs to know while making a drum bar is shown ON the score, and the
// Forge output panel stops opening by itself (it stays the truth log: it still receives every message, and one click on "Forge log (N)" opens it). In every other vault nothing changes:
// `routeMessage` answers 'panel-reveal' (today's behaviour) for EVERY message when `scoreFirst` is false, and that is the only answer such a vault ever gets (principle P3).
//
// Pure core (no obsidian): the router, and the small piece of shared state the two choke points (forgeNotice, ForgePlugin.getOutputView) and the Score panel talk through. The profile is
// read in ONE place (vault-profile-core, via score-first.ts); this file only receives the answer.

export type MessageKind = 'info' | 'error' | 'success';
/** 'notice' = any plain text message; 'llm' = an LLM call is happening / its outcome; 'stale' = a note is out of date or changed because a parent changed. Classified from the text by
 *  `classifyMessageSource` at the choke points (the callers do not say). */
export type MessageSource = 'notice' | 'llm' | 'stale';
export type PanelDelivery = 'panel-reveal' | 'panel-silent';
/** How long a line stays on the Score: an error until the next successful draw (or a newer message), anything else for a few seconds. */
export type ScoreLine = { persistence: 'until-next-draw' | 'transient' };
export interface Routing { panel: PanelDelivery; score: ScoreLine | null }

export const TRANSIENT_LINE_MS = 6000;
export const BACKLOG_CAP = 200;

export function routeMessage(m: { scoreFirst: boolean; kind: MessageKind; source: MessageSource }): Routing {
  if (!m.scoreFirst) return { panel: 'panel-reveal', score: null };      // P3: the ONLY answer outside a score-first vault, for every kind and source
  if (m.kind === 'error') return { panel: 'panel-silent', score: { persistence: 'until-next-draw' } };
  if (m.kind === 'success' || m.source === 'llm' || m.source === 'stale') return { panel: 'panel-silent', score: { persistence: 'transient' } };
  return { panel: 'panel-silent', score: null };                          // the rest is panel-only (still appended, never revealed)
}

/** The ranked sources, from the text of a message. Deliberately narrow: a text that matches nothing is 'notice' and stays panel-only. */
export function classifyMessageSource(text: string): MessageSource {
  if (/\/generate|\bgenerat(e|ing|ed)\b|\bLLM\b|\battempts?\b/i.test(text)) return 'llm';
  if (/out of date|\bstale\b|changed because/i.test(text)) return 'stale';
  return 'notice';
}

/** What the plugin's callers may do with "the output panel" (the eight methods of ForgeOutputView they use). In a score-first vault, while the panel does not exist, calls are kept
 *  and replayed into it when it is first opened. */
export interface OutputSinkLike {
  append(...a: any[]): unknown;
  appendError(...a: any[]): unknown;
  appendForgeError(...a: any[]): unknown;
  appendMessage(...a: any[]): unknown;
  appendLlmRecipeRejection(...a: any[]): unknown;
  appendSlotCacheNotFound(...a: any[]): unknown;
  previewBinarySnippet(...a: any[]): unknown;
  previewDataSnippet(...a: any[]): unknown;
}
const SINK_METHODS = ['append', 'appendError', 'appendForgeError', 'appendMessage', 'appendLlmRecipeRejection', 'appendSlotCacheNotFound', 'previewBinarySnippet', 'previewDataSnippet'] as const;

export interface ScoreMessage { text: string; kind: MessageKind; line: ScoreLine }

/** Shared state of a score-first session. One instance per plugin; `scoreFirst` is a CONSTANT of the vault set once by `score-first.ts` (there is no toggle). */
export class MessageDelivery {
  private scoreFirst = false;
  private unread = 0;
  private backlog: Array<(sink: OutputSinkLike) => void> = [];
  private unreadListeners = new Set<(n: number) => void>();
  private scoreListeners = new Set<(m: ScoreMessage) => void>();
  private openLog: (() => void) | null = null;

  /** The profile answer is read asynchronously after load, so anything that depends on it (the header buttons of a markdown tab) may first run while it is still the default (false). Those listen here
   *  and re-decide the moment the answer CHANGES (drain 2026-10-22-2200). A listener that throws is logged and does not stop the others. */
  private scoreFirstListeners = new Set<(on: boolean) => void>();
  setScoreFirst(on: boolean): void {
    const changed = this.scoreFirst !== on;
    this.scoreFirst = on;
    if (!changed) return;
    for (const f of [...this.scoreFirstListeners]) {
      try { f(on); } catch (e) { console.error('MessageDelivery.setScoreFirst: a listener failed', e); }
    }
  }
  onScoreFirst(f: (on: boolean) => void): () => void { this.scoreFirstListeners.add(f); return () => { this.scoreFirstListeners.delete(f); }; }
  isScoreFirst(): boolean { return this.scoreFirst; }

  // --- the unread counter behind "Forge log (N)": messages that reached the panel while it was not being looked at
  unreadCount(): number { return this.unread; }
  bump(): void { this.unread++; this.unreadListeners.forEach((f) => f(this.unread)); }
  markOpened(): void { if (this.unread === 0) return; this.unread = 0; this.unreadListeners.forEach((f) => f(0)); }
  onUnread(f: (n: number) => void): () => void { this.unreadListeners.add(f); return () => this.unreadListeners.delete(f); }

  // --- panel entries made while no panel exists (score-first only): kept, then replayed into the panel when it is first opened
  stash(replay: (sink: OutputSinkLike) => void): void {
    this.backlog.push(replay);
    if (this.backlog.length > BACKLOG_CAP) this.backlog.shift();
    this.bump();
  }
  backlogSize(): number { return this.backlog.length; }
  /** A sink that records every call (any of the eight methods) for replay. Returned instead of a real view while the panel does not exist. */
  bufferedSink(): OutputSinkLike {
    const sink: Record<string, (...a: unknown[]) => unknown> = {};
    for (const name of SINK_METHODS) sink[name] = (...args: unknown[]) => { this.stash((real) => { (real as unknown as Record<string, (...a: unknown[]) => unknown>)[name](...args); }); return undefined; };
    return sink as unknown as OutputSinkLike;
  }
  /** The panel exists now: replay what was kept into it, in order, once. Returns how many were replayed. The replayed entries are already counted as unread. */
  drain(real: OutputSinkLike): number {
    const todo = this.backlog; this.backlog = [];
    for (const f of todo) { try { f(real); } catch (e) { console.error('MessageDelivery.drain: replaying a kept panel entry failed', e); } }
    return todo.length;
  }

  // --- messages shown on the Score
  postToScore(m: ScoreMessage): void { this.scoreListeners.forEach((f) => f(m)); }
  onScoreMessage(f: (m: ScoreMessage) => void): () => void { this.scoreListeners.add(f); return () => this.scoreListeners.delete(f); }

  // --- "Forge log (N)" opens the panel: the plugin registers how
  setOpenLog(f: (() => void) | null): void { this.openLog = f; }
  openForgeLog(): void {
    if (!this.openLog) { console.error('[forge-log] openForgeLog: no handler registered (the plugin never called setOpenLog); the click cannot open the panel'); return; }
    this.openLog();
  }
}

/** The one instance the plugin's choke points and the Score panel share. */
export const messageDelivery = new MessageDelivery();
