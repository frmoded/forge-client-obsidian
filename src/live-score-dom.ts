// score_first_experiment M1 (drain 2026-10-21-1100) — the DOM of the live Score panel (above the Beat Box since 2026-11-03-1155-93). Plain DOM, no obsidian import (so a happy-dom test mounts the very
// code the tab runs): the Obsidian-only parts — drawing a MusicXML payload with Verovio and silencing the player — arrive as two injected functions.
//
//   <div class="forge-rhythm-edit-score" role="region" aria-labelledby=(hidden name: Score of this bar)>
//     <div class="forge-rhythm-edit-score-status" aria-live="polite">…</div>        one line: progress, a refusal, an error ('' = nothing shown)
//     <div class="forge-rhythm-score-host">…engraving…</div>                        the same class the Score tab uses, so it is styled the same
//   </div>
//
// An edit keeps the old engraving on screen until the new one is READY. The renderer (`renderTaggedMusicXML`) is fire-and-forget: it returns at once and the engraving arrives
// later, so "returned" is not "ready" (measured in real Chromium: swapping on return left 1-2 blank frames and a 388 -> 103 px layout jump per edit). The next score is therefore
// drawn into a NEW host that is laid out but invisible (CSS `.forge-rhythm-score-host-pending`: absolute, hidden — still the panel's width, which Verovio reads), and the swap
// happens when an <svg> shows up in it (or after READY_TIMEOUT_MS, so a renderer that never produces one cannot freeze the old score forever): the old host's player is silenced
// and the old host removed in the same tick the new one is revealed. A newer draw while one is pending replaces the pending one.

import { setSrLabel } from './sr-label-core.ts';
import { MIN_HOST_WIDTH_PX } from './host-width-core.ts';
import { createLiveScore, type LiveScore, type LiveScoreDeps, type LiveScoreTiming, type LiveScoreView } from './live-score-core.ts';
import { LEAN_SCORE_NOTE, type ScorePanelPlan } from './score-first-core.ts';
import type { RhythmData } from './rhythm-edit-core.ts';
import { attachProvenance, type ProvenanceResult, type RhythmDataLike } from './provenance-core.ts';
import { mountScoreMessages, type ScoreMessagePorts, type ScoreMessages } from './score-messages-dom.ts';
import { createScoreInspector, type GridTarget, type ScoreInspector, type ScoreInspectorPorts } from './score-inspector.ts';

import { DESCRIPTION_BAR_CLASS } from './description-bar-dom.ts';

export const SCORE_PANEL_CLASS = 'forge-rhythm-edit-score';
export const SCORE_STATUS_CLASS = 'forge-rhythm-edit-score-status';
export const SCORE_HOST_CLASS = 'forge-rhythm-score-host';
export const SCORE_PANEL_LABEL = 'Score of this bar';
export const SCORE_HOST_PENDING_CLASS = 'forge-rhythm-score-host-pending';
/** 2026-10-31-1110: the engraving on screen is not the latest any more (a change is waiting to be drawn): dimmed, and the panel says it is busy. */
export const SCORE_HOST_STALE_CLASS = 'forge-rhythm-score-host-stale';
/** How long a pending score may take to produce its first <svg> before it is shown anyway. */
export const READY_TIMEOUT_MS = 4000;

export interface ScorePanelDeps {
  /** Draw `payload` into `host`; false when the renderer is unavailable. */
  renderInto(host: HTMLElement, payload: Record<string, unknown>): boolean;
  /** Silence any player inside `host` (called before a score is replaced or the panel goes). */
  stopPlayers(host: HTMLElement): void;
  /** A score has just become THE score (swapped in; the map arrives with the very payload that was rendered into `host`). */
  onShown?(host: HTMLElement, payload: Record<string, unknown>): void;
  /** `host` is about to go (replaced, cleared, panel disposed). */
  onHidden?(host: HTMLElement): void;
  /** Timers for the "ready" timeout (the page's own by default). */
  setTimer?(fn: () => void, ms: number): unknown;
  clearTimer?(handle: unknown): void;
  /** 2026-11-03-1155-93 (R6): the panel goes FIRST in its parent (see `scoreSlot`), not at the end. Absent = at the end, as it always was (the output panel's lab, the unit tests). Every score-first tab sets it. */
  first?: boolean;
}

/** 2026-11-03-1155-93 (R6): where the Score goes in a score-first tab: before everything the tab has mounted so far, except the description banner (it appears only when a note has something to say, and the person reads it first).
 *  Found BY ROLE (the banner's class), never by position, so a rebuild of the tab (a phrase that changes kind) and a banner that comes and goes leave the Score where it belongs. `null` = append. */
export function scoreSlot(parent: HTMLElement): Node | null {
  for (const c of Array.from(parent.children)) if (!c.classList.contains(DESCRIPTION_BAR_CLASS)) return c;
  return null;
}

export const SCORE_QUIET_CLASS = 'forge-rhythm-edit-score-quiet';
/** 2026-11-15-1217: a pane that changes width by less than this (a scrollbar) does not make the Score engrave again; the wait after the last change before it does. */
export const RELAYOUT_MIN_DELTA_PX = 24;
export const RELAYOUT_DEBOUNCE_MS = 250;

export interface ScorePanel {
  readonly el: HTMLElement;
  /** 2026-11-05-1189: one quiet sentence under the status line (the status line itself is cleared by every successful draw); `''` removes it. A bar's tab puts the two sentences its Inspector used to say here. */
  quiet(text: string): void;
  /** Where the inspector goes: always the LAST child of the panel, so engravings (inserted before it) stay above it. */
  readonly slot: HTMLElement;
  readonly view: LiveScoreView;
  /** 2026-11-15-1217: engrave the Score that is on screen AGAIN (its own payload, no engine run) for the width the pane has now; the first system that was in view stays where it was (`keep` is told before and after). A no-op with nothing shown. */
  redraw(keep?: { before(): void; after(): void }): void;
  /** The width the Score was last engraved for (px of its host), 0 = nothing shown. */
  readonly drawnWidth: () => number;
  dispose(): void;
}

export function mountScorePanel(parent: HTMLElement, deps: ScorePanelDeps): ScorePanel {
  const doc = parent.ownerDocument;
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => globalThis.setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h: unknown) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>));
  const el = doc.createElement('div');
  el.className = SCORE_PANEL_CLASS;
  el.setAttribute('role', 'region');
  const statusEl = doc.createElement('div');
  statusEl.className = SCORE_STATUS_CLASS;
  statusEl.setAttribute('aria-live', 'polite');
  el.appendChild(statusEl);
  const quietEl = doc.createElement('div');
  quietEl.className = SCORE_QUIET_CLASS;
  quietEl.setAttribute('aria-live', 'polite');
  el.appendChild(quietEl);
  setSrLabel(el, SCORE_PANEL_LABEL);                         // after the two lines: the status line stays the panel's first child (the messages mount into it)
  const slot = doc.createElement('div');
  slot.className = 'forge-rhythm-inspector-slot';
  el.appendChild(slot);
  parent.insertBefore(el, deps.first ? scoreSlot(parent) : null);
  let current: HTMLElement | null = null;
  let pending: { host: HTMLElement; cancel: () => void } | null = null;
  let stale = false;                                   // markPending: the score on screen is not the latest (the flag follows whichever host is current)
  let shownPayload: Record<string, unknown> | null = null;    // the payload of the Score on screen (redraw engraves it again)
  let shownWidth = 0;
  let afterSwap: (() => void) | null = null;

  const dropPending = () => {
    if (!pending) return;
    pending.cancel();
    pending.host.remove();
    pending = null;
  };
  const removeCurrent = () => {
    if (!current) return;
    deps.onHidden?.(current);
    deps.stopPlayers(current);
    current.remove();
    current = null;
  };
  /** The new host becomes THE score: revealed, and the old one silenced and removed in the same tick. */
  const swapIn = (next: HTMLElement, payload: Record<string, unknown>) => {
    pending = null;
    next.classList.remove(SCORE_HOST_PENDING_CLASS);
    next.classList.toggle(SCORE_HOST_STALE_CLASS, stale);
    const old = current;
    current = next;
    shownPayload = payload; shownWidth = next.clientWidth;
    if (old) { deps.onHidden?.(old); deps.stopPlayers(old); old.remove(); }
    deps.onShown?.(next, payload);                     // the map and the engraving arrive together
    const f = afterSwap; afterSwap = null; f?.();
  };

  const view: LiveScoreView = {
    status(text) { statusEl.textContent = text; },       // selectable text (styles.css): an error or a refusal is copied with a triple-click and Cmd+C
    pending(on) {
      stale = on;
      current?.classList.toggle(SCORE_HOST_STALE_CLASS, on);
      if (on) el.setAttribute('aria-busy', 'true'); else el.removeAttribute('aria-busy');
    },
    draw(payload) {
      dropPending();                                   // a newer score supersedes one that has not shown yet
      const next = doc.createElement('div');
      next.className = current ? `${SCORE_HOST_CLASS} ${SCORE_HOST_PENDING_CLASS}` : SCORE_HOST_CLASS;   // nothing to keep on screen for a FIRST score
      el.insertBefore(next, slot);
      let ok = false;
      try {
        ok = deps.renderInto(next, payload);
      } finally {
        if (!ok) next.remove();                        // unavailable renderer, or it threw: the old score (if any) stays
      }
      if (!ok) return false;
      if (!current || next.querySelector('svg')) { swapIn(next, payload); return true; }
      // Fire-and-forget renderer: wait for the engraving, then swap.
      const MO = (doc.defaultView as (Window & { MutationObserver?: typeof MutationObserver }) | null)?.MutationObserver;
      const observer = typeof MO === 'function' ? new MO(() => { if (next.querySelector('svg')) { cancel(); swapIn(next, payload); } }) : null;
      observer?.observe(next, { childList: true, subtree: true });
      const timer = setTimer(() => { cancel(); swapIn(next, payload); }, READY_TIMEOUT_MS);
      const cancel = () => { observer?.disconnect(); clearTimer(timer); };
      pending = { host: next, cancel };
      return true;
    },
    clear() { dropPending(); removeCurrent(); stale = false; el.removeAttribute('aria-busy'); },
  };

  return {
    el,
    slot,
    view,
    quiet(text) { quietEl.textContent = text; },
    drawnWidth: () => shownWidth,
    redraw(keep) {
      if (!shownPayload || !current) return;
      keep?.before();
      if (keep) afterSwap = () => keep.after();
      view.draw(shownPayload);
    },
    dispose() {
      dropPending();
      removeCurrent();
      el.remove();
    },
  };
}

/** The lean edition's panel: one line, no score. */
export function mountLeanNote(parent: HTMLElement, text: string, first = false): HTMLElement {
  const doc = parent.ownerDocument;
  const el = doc.createElement('div');
  el.className = `${SCORE_PANEL_CLASS} forge-rhythm-edit-score-lean`;
  el.textContent = text;
  parent.insertBefore(el, first ? scoreSlot(parent) : null);
  return el;
}

/** What the Beat Box tab holds on to for the Score above the widget. */
export interface ScoreArea {
  /** The Score panel (or the lean edition's one line): what a tab puts the parts that belong right under the Score after (the phrase's bracket). */
  readonly el: HTMLElement;
  /** The widget's data changed (debounced re-draw). A no-op in the lean edition. */
  update(data: unknown): void;
  /** Draw this bar now (open, reload from the note). A no-op in the lean edition. */
  showNow(data: unknown): void;
  /** 2026-10-31-1110: nothing can be drawn for `data` and the surface knows it without the engine: show `message` now, past the debounce and a render in flight. A no-op in the lean edition. */
  refuse(data: unknown, message: string): void;
  /** The pointer is over a Beat Box grid step (`null` = left): light the engraved note. A no-op without an inspector. */
  gridHover(target: GridTarget | null): void;
  /** M6: light these elements of the shown Score from outside (the phrase bracket); `[]` clears. A no-op without an inspector. */
  lightAll(ids: readonly string[]): void;
  dispose(): void;
}

export interface ScoreAreaPorts extends ScorePanelDeps {
  /** The engine step for a bar. Required unless `produce` is given. */
  compute?(data: RhythmData, title: string): Promise<unknown>;
  /** score_first M5: replaces the data -> score step for a surface whose data is not a bar (the phrase view: the phrase note's text in, the extended bar's Score out). Same scheduler, same panel. */
  produce?: LiveScoreDeps['produce'];
  /** score_first M3: present = the Score gets its provenance map and the inspector (hover, pin, lineage, hover-link). Absent = the Score is exactly the M1 Score. */
  inspector?: ScoreInspectorPorts;
  /** 2026-11-15-1217 (SHOW_INSPECTOR): `false` = the inspector runs exactly as ever (the map, hover, pin, the highlight, the arrow keys) but its box is never put on the page and it says nothing under the Score. Absent or `true` = as before. */
  showInspector?: boolean;
  /** Optional: report how long the provenance map took to build (ms). */
  onProvenanceMs?(ms: number): void;
  /** score_first M4: present = the panel shows the message line (the output panel stays closed; see score-first-messages-core.ts). Absent = neither exists. */
  messages?: ScoreMessagePorts;
  title: string;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** 2026-10-31-1110: dim the Score on screen from the moment its data changes until the new one is drawn (a surface whose render takes seconds). Absent = the Score stays as it was, undimmed, until replaced. */
  markPending?: boolean;
  /** How long after the last change the Score is redrawn. Absent = the live Score's own (LIVE_SCORE_DEBOUNCE_MS). The mix tab asks for a shorter one: it is dragged, not clicked. */
  debounceMs?: number;
  now?: () => number;
  onTiming?(t: LiveScoreTiming): void;
}

/** The ONE place the Beat Box tab gets its Score area. `plan` 'none' (every vault that is not score-first) touches NOTHING and returns null — the tab's DOM is exactly what it
 *  was; 'lean-note' adds the one-line explanation; 'score' adds the live panel. */
export function attachScoreArea(parent: HTMLElement, plan: ScorePanelPlan, ports: ScoreAreaPorts): ScoreArea | null {
  if (plan === 'none') return null;
  if (plan === 'lean-note') {
    const note = mountLeanNote(parent, LEAN_SCORE_NOTE, ports.first);
    return { el: note, update() { /* no score in the lean edition */ }, showNow() { /* no score in the lean edition */ }, refuse() { /* no score in the lean edition */ }, gridHover() { /* no score in the lean edition */ }, lightAll() { /* no score in the lean edition */ }, dispose() { note.remove(); } };
  }
  // The provenance map travels WITH the payload it was built for: compute() attaches ids to the MusicXML and remembers the map by payload identity; the panel hands the very
  // payload back when that engraving becomes the shown one, so the map and the SVG are swapped in together (never a map for a score that is not on screen).
  const results = new WeakMap<object, ProvenanceResult>();
  let inspector: ScoreInspector | null = null;
  // The map is built from the data and the payload: a bar's hits by default; a phrase (M6) brings its own `annotate` (the bars of the extended Score).
  const withProvenance = (data: unknown, raw: unknown): unknown => {
    if (typeof raw !== 'object' || raw === null) return raw;
    const t0 = performance.now();
    const r = ports.inspector!.annotate
      ? ports.inspector!.annotate(data, raw as Record<string, unknown>)
      : attachProvenance(ports.inspector!.noteId, data as unknown as RhythmDataLike, raw as Record<string, unknown>);
    ports.onProvenanceMs?.(performance.now() - t0);
    results.set(r.payload, r);
    return r.payload;
  };
  const compute: ScoreAreaPorts['compute'] = ports.inspector && ports.compute
    ? async (data, title) => withProvenance(data, await ports.compute!(data, title))
    : ports.compute;
  const produce: ScoreAreaPorts['produce'] = ports.inspector && ports.produce
    ? async (data, title) => {
      const outcome = await ports.produce!(data, title);
      return outcome.kind === 'score' ? { kind: 'score', payload: withProvenance(data, outcome.payload) as Record<string, unknown> } : outcome;
    }
    : ports.produce;
  let messages: ScoreMessages | null = null;
  const panel = mountScorePanel(parent, {
    ...ports,
    onShown: (host, payload) => { messages?.drawSucceeded(); const r = results.get(payload); if (r && inspector) inspector.onShown(host, r); ports.onShown?.(host, payload); },
    onHidden: (host) => { inspector?.onHidden(host); ports.onHidden?.(host); },
  });
  if (ports.inspector) {
    const hidden = ports.showInspector === false && ports.inspector.headless !== true;                     // 2026-11-15-1217: the default view: the same inspector, its box not on the page, no sentence under the Score
    inspector = createScoreInspector(panel.slot, ports.inspector.headless === true ? { ...ports.inspector, say: (text) => { panel.quiet(text); } } : hidden ? { ...ports.inspector, headless: true, say: () => {} } : ports.inspector);
  }
  if (ports.messages) messages = mountScoreMessages(panel.el.firstElementChild as HTMLElement, ports.messages, { setTimer: ports.setTimer, clearTimer: ports.clearTimer });
  // 2026-11-15-1217: the Score is engraved for the width of its pane (it wraps into systems and the tab scrolls vertically). When the pane's width changes (the window, the right dock) the Score on screen is engraved AGAIN for the new width, from its own payload (no engine run),
  // after a quiet moment; a change smaller than RELAYOUT_MIN_DELTA_PX (a scrollbar appearing) is ignored, so it never chases itself. The tab's vertical scroll keeps its relative place. The dialog's height changes the height only: no width, no relayout.
  const RO = (parent.ownerDocument.defaultView as (Window & { ResizeObserver?: typeof ResizeObserver }) | null)?.ResizeObserver;
  let relayoutTimer: unknown = null;
  const shownHostWidth = (): number => (panel.el.querySelector(`.${SCORE_HOST_CLASS}:not(.${SCORE_HOST_PENDING_CLASS})`) as HTMLElement | null)?.clientWidth ?? 0;
  const relayout = (): void => {
    relayoutTimer = null;
    const now = shownHostWidth();
    if (now < MIN_HOST_WIDTH_PX || Math.abs(now - panel.drawnWidth()) < RELAYOUT_MIN_DELTA_PX) return;
    const scroller = panel.el.closest('.forge-chat-body') as HTMLElement | null;
    let ratio = 0;
    panel.redraw(scroller ? {
      before: () => { const room = scroller.scrollHeight - scroller.clientHeight; ratio = room > 0 ? scroller.scrollTop / room : 0; },
      after: () => { const room = scroller.scrollHeight - scroller.clientHeight; scroller.scrollTop = ratio * Math.max(0, room); },
    } : undefined);
  };
  const resizeObserver = typeof RO === 'function' ? new RO(() => { if (relayoutTimer !== null) ports.clearTimer(relayoutTimer); relayoutTimer = ports.setTimer(relayout, RELAYOUT_DEBOUNCE_MS); }) : null;
  resizeObserver?.observe(panel.el);
  const live: LiveScore = createLiveScore({
    compute,
    produce,
    view: panel.view,
    title: ports.title,
    setTimer: ports.setTimer,
    clearTimer: ports.clearTimer,
    debounceMs: ports.debounceMs,
    markPending: ports.markPending,
    now: ports.now,
    onTiming: ports.onTiming,
  });
  return {
    el: panel.el,
    update: (data) => live.update(data),
    showNow: (data) => live.showNow(data),
    refuse: (data, message) => live.refuse(data, message),
    gridHover: (target) => inspector?.gridHover(target),
    lightAll: (ids) => inspector?.lightAll(ids),
    dispose() { resizeObserver?.disconnect(); if (relayoutTimer !== null) ports.clearTimer(relayoutTimer); live.dispose(); inspector?.dispose(); messages?.dispose(); panel.dispose(); },
  };
}
