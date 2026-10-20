// score_first_experiment M1 (drain 2026-10-21-1100) — the DOM of the live Score panel under the Beat Box. Plain DOM, no obsidian import (so a happy-dom test mounts the very
// code the tab runs): the Obsidian-only parts — drawing a MusicXML payload with Verovio and silencing the player — arrive as two injected functions.
//
//   <div class="forge-rhythm-edit-score" role="region" aria-label="Score of this bar">
//     <div class="forge-rhythm-edit-score-status" aria-live="polite">…</div>        one line: progress, a refusal, an error ('' = nothing shown)
//     <div class="forge-rhythm-score-host">…engraving…</div>                        the same class the Score tab uses, so it is styled the same
//   </div>
//
// An edit keeps the old engraving on screen until the new one is READY. The renderer (`renderTaggedMusicXML`) is fire-and-forget: it returns at once and the engraving arrives
// later, so "returned" is not "ready" (measured in real Chromium: swapping on return left 1-2 blank frames and a 388 -> 103 px layout jump per edit). The next score is therefore
// drawn into a NEW host that is laid out but invisible (CSS `.forge-rhythm-score-host-pending`: absolute, hidden — still the panel's width, which Verovio reads), and the swap
// happens when an <svg> shows up in it (or after READY_TIMEOUT_MS, so a renderer that never produces one cannot freeze the old score forever): the old host's player is silenced
// and the old host removed in the same tick the new one is revealed. A newer draw while one is pending replaces the pending one.

import { createLiveScore, type LiveScore, type LiveScoreTiming, type LiveScoreView } from './live-score-core.ts';
import { LEAN_SCORE_NOTE, type ScorePanelPlan } from './score-first-core.ts';
import type { RhythmData } from './rhythm-edit-core.ts';

export const SCORE_PANEL_CLASS = 'forge-rhythm-edit-score';
export const SCORE_STATUS_CLASS = 'forge-rhythm-edit-score-status';
export const SCORE_HOST_CLASS = 'forge-rhythm-score-host';
export const SCORE_PANEL_LABEL = 'Score of this bar';
export const SCORE_HOST_PENDING_CLASS = 'forge-rhythm-score-host-pending';
/** How long a pending score may take to produce its first <svg> before it is shown anyway. */
export const READY_TIMEOUT_MS = 4000;

export interface ScorePanelDeps {
  /** Draw `payload` into `host`; false when the renderer is unavailable. */
  renderInto(host: HTMLElement, payload: Record<string, unknown>): boolean;
  /** Silence any player inside `host` (called before a score is replaced or the panel goes). */
  stopPlayers(host: HTMLElement): void;
  /** Timers for the "ready" timeout (the page's own by default). */
  setTimer?(fn: () => void, ms: number): unknown;
  clearTimer?(handle: unknown): void;
}

export interface ScorePanel {
  readonly el: HTMLElement;
  readonly view: LiveScoreView;
  dispose(): void;
}

export function mountScorePanel(parent: HTMLElement, deps: ScorePanelDeps): ScorePanel {
  const doc = parent.ownerDocument;
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => globalThis.setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h: unknown) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>));
  const el = doc.createElement('div');
  el.className = SCORE_PANEL_CLASS;
  el.setAttribute('role', 'region');
  el.setAttribute('aria-label', SCORE_PANEL_LABEL);
  const statusEl = doc.createElement('div');
  statusEl.className = SCORE_STATUS_CLASS;
  statusEl.setAttribute('aria-live', 'polite');
  el.appendChild(statusEl);
  parent.appendChild(el);
  let current: HTMLElement | null = null;
  let pending: { host: HTMLElement; cancel: () => void } | null = null;

  const dropPending = () => {
    if (!pending) return;
    pending.cancel();
    pending.host.remove();
    pending = null;
  };
  const removeCurrent = () => {
    if (!current) return;
    deps.stopPlayers(current);
    current.remove();
    current = null;
  };
  /** The new host becomes THE score: revealed, and the old one silenced and removed in the same tick. */
  const swapIn = (next: HTMLElement) => {
    pending = null;
    next.classList.remove(SCORE_HOST_PENDING_CLASS);
    const old = current;
    current = next;
    if (old) { deps.stopPlayers(old); old.remove(); }
  };

  const view: LiveScoreView = {
    status(text) { statusEl.textContent = text; },
    draw(payload) {
      dropPending();                                   // a newer score supersedes one that has not shown yet
      const next = doc.createElement('div');
      next.className = current ? `${SCORE_HOST_CLASS} ${SCORE_HOST_PENDING_CLASS}` : SCORE_HOST_CLASS;   // nothing to keep on screen for a FIRST score
      el.appendChild(next);
      let ok = false;
      try {
        ok = deps.renderInto(next, payload);
      } finally {
        if (!ok) next.remove();                        // unavailable renderer, or it threw: the old score (if any) stays
      }
      if (!ok) return false;
      if (!current || next.querySelector('svg')) { swapIn(next); return true; }
      // Fire-and-forget renderer: wait for the engraving, then swap.
      const MO = (doc.defaultView as (Window & { MutationObserver?: typeof MutationObserver }) | null)?.MutationObserver;
      const observer = typeof MO === 'function' ? new MO(() => { if (next.querySelector('svg')) { cancel(); swapIn(next); } }) : null;
      observer?.observe(next, { childList: true, subtree: true });
      const timer = setTimer(() => { cancel(); swapIn(next); }, READY_TIMEOUT_MS);
      const cancel = () => { observer?.disconnect(); clearTimer(timer); };
      pending = { host: next, cancel };
      return true;
    },
    clear() { dropPending(); removeCurrent(); },
  };

  return {
    el,
    view,
    dispose() {
      dropPending();
      removeCurrent();
      el.remove();
    },
  };
}

/** The lean edition's panel: one line, no score. */
export function mountLeanNote(parent: HTMLElement, text: string): HTMLElement {
  const doc = parent.ownerDocument;
  const el = doc.createElement('div');
  el.className = `${SCORE_PANEL_CLASS} forge-rhythm-edit-score-lean`;
  el.textContent = text;
  parent.appendChild(el);
  return el;
}

/** What the Beat Box tab holds on to for the Score under the widget. */
export interface ScoreArea {
  /** The widget's data changed (debounced re-draw). A no-op in the lean edition. */
  update(data: unknown): void;
  /** Draw this bar now (open, reload from the note). A no-op in the lean edition. */
  showNow(data: unknown): void;
  dispose(): void;
}

export interface ScoreAreaPorts extends ScorePanelDeps {
  compute(data: RhythmData, title: string): Promise<unknown>;
  title: string;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  now?: () => number;
  onTiming?(t: LiveScoreTiming): void;
}

/** The ONE place the Beat Box tab gets its Score area. `plan` 'none' (every vault that is not score-first) touches NOTHING and returns null — the tab's DOM is exactly what it
 *  was; 'lean-note' adds the one-line explanation; 'score' adds the live panel. */
export function attachScoreArea(parent: HTMLElement, plan: ScorePanelPlan, ports: ScoreAreaPorts): ScoreArea | null {
  if (plan === 'none') return null;
  if (plan === 'lean-note') {
    const note = mountLeanNote(parent, LEAN_SCORE_NOTE);
    return { update() { /* no score in the lean edition */ }, showNow() { /* no score in the lean edition */ }, dispose() { note.remove(); } };
  }
  const panel = mountScorePanel(parent, ports);
  const live: LiveScore = createLiveScore({
    compute: ports.compute,
    view: panel.view,
    title: ports.title,
    setTimer: ports.setTimer,
    clearTimer: ports.clearTimer,
    now: ports.now,
    onTiming: ports.onTiming,
  });
  return {
    update: (data) => live.update(data),
    showNow: (data) => live.showNow(data),
    dispose() { live.dispose(); panel.dispose(); },
  };
}
