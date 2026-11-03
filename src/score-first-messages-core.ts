// score_first_experiment M4 (drain 2026-10-21-2010) — where a message goes in a score-first vault.
//
// In a vault that declares `profile = "score_first"` the engraved Score is the primary surface: what the person needs to know while making a drum bar is shown ON the score, and the
// Forge output panel stops opening by itself (it stays the truth log: it still receives every message, and the palette command "Open Forge log" opens it). In every other vault nothing changes:
// `routeMessage` answers 'panel-reveal' (today's behaviour) for EVERY message when `scoreFirst` is false, and that is the only answer such a vault ever gets (principle P3).
//
// Pure core (no obsidian): the router, and the small piece of shared state the two choke points (forgeNotice, ForgePlugin.getOutputView) and the Score panel talk through. The profile is
// read in ONE place (vault-profile-core, via score-first.ts); this file only receives the answer.

import { noticeLine } from './logged-notice-core.ts';

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

/** 2026-11-03-1155-91: with the "Forge log (N)" button gone, an error a Forge RUN writes to the panel (the four error methods of the sink) must not live in the panel alone: each one is ALSO a line on the Score
 *  (until the next good draw) and a `[forge-notice]` console line. The sentence of each method, as one plain text. */
export function panelErrorText(method: 'appendError' | 'appendForgeError' | 'appendLlmRecipeRejection' | 'appendSlotCacheNotFound', args: unknown[]): string {
  const a = args as any[];
  if (method === 'appendError') return String(a[1] ?? '').trim() || 'The run failed.';
  if (method === 'appendForgeError') return [a[1]?.cause, a[1]?.suggested_fix].filter((x) => typeof x === 'string' && x !== '').join(' ') || 'The run failed.';
  if (method === 'appendLlmRecipeRejection') return `The Recipe the LLM wrote was rejected (${a[1]?.failureMode ?? 'unknown reason'}); the Forge panel has the details.`;
  return 'The slot cache was not written: the note file was not found; the Forge panel has the details.';
}
const MIRRORED_ERRORS = ['appendError', 'appendForgeError', 'appendLlmRecipeRejection', 'appendSlotCacheNotFound'] as const;

const MIRRORED = Symbol.for('forge.panelErrorsMirrored');
/** The panel (or the sink that keeps its calls) with its four error methods mirrored to the Score and the console. The SAME object comes back (callers and tests compare it), patched once on its own properties
 *  (a second call is a no-op). A score-first vault only: the caller (ForgePlugin.getOutputView) wraps in that one branch, so every other vault gets the sink untouched. */
export function mirrorPanelErrors<T extends object>(sink: T, delivery: Pick<MessageDelivery, 'postToScore'>, log: (line: string) => void): T {
  const host = sink as Record<string | symbol, any>;
  if (host[MIRRORED]) return sink;
  for (const method of MIRRORED_ERRORS) {
    const original = host[method];
    if (typeof original !== 'function') continue;
    host[method] = (...args: unknown[]) => {
      const text = panelErrorText(method, args);
      log(noticeLine(text));
      delivery.postToScore({ text, kind: 'error', line: { persistence: 'until-next-draw' } });
      return original.apply(sink, args);
    };
  }
  host[MIRRORED] = true;
  return sink;
}

/** Shared state of a score-first session. One instance per plugin; `scoreFirst` is a CONSTANT of the vault set once by `score-first.ts` (there is no toggle). */
export class MessageDelivery {
  private scoreFirst = false;
  private unread = 0;
  private backlog: Array<(sink: OutputSinkLike) => void> = [];
  private unreadListeners = new Set<(n: number) => void>();
  private scoreListeners = new Set<(m: ScoreMessage) => void>();

  /** The profile answer is read asynchronously after load, so anything that depends on it (the header buttons of a markdown tab) may first run while it is still the default (false). Those listen here
   *  and re-decide the moment the answer CHANGES (drain 2026-10-22-2200). A listener that throws is logged and does not stop the others. */
  private scoreFirstListeners = new Set<(on: boolean) => void>();
  /** Once this vault has been seen as score-first in this session, always: the profile is a constant of the vault, and a later re-read that fails (a file mid-write, a read error) answers `false`
   *  through `isScoreFirst()` — which would put the Beat Box's buttons back on a phrase and take the phrase's own away. Cosmetic decisions that must not flicker with that (the header buttons) ask
   *  here; the live `isScoreFirst()` stays for everything that documents "turns off at once". */
  private everScoreFirst = false;
  hasBeenScoreFirst(): boolean { return this.everScoreFirst || this.scoreFirst; }
  /** Tests only: forget everything (the bundle is shared between tests). */
  resetForTests(): void { this.scoreFirst = false; this.everScoreFirst = false; }
  setScoreFirst(on: boolean): void {
    const changed = this.scoreFirst !== on;
    this.scoreFirst = on;
    if (on) this.everScoreFirst = true;
    if (!changed) return;
    for (const f of [...this.scoreFirstListeners]) {
      try { f(on); } catch (e) { console.error('MessageDelivery.setScoreFirst: a listener failed', e); }
    }
  }
  onScoreFirst(f: (on: boolean) => void): () => void { this.scoreFirstListeners.add(f); return () => { this.scoreFirstListeners.delete(f); }; }
  isScoreFirst(): boolean { return this.scoreFirst; }

  // --- the unread counter (the "Forge log (N)" button that showed it is gone, 1155-91; kept as evidence for the tests): messages that reached the panel while it was not being looked at
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
}

/** The one instance the plugin's choke points and the Score panel share. */
export const messageDelivery = new MessageDelivery();
