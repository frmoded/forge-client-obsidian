// Drain 2026-10-19-1500 §3 — the "Updated from note" label, timed by ATTENTION rather than by the wall clock. Pure: the clock, the timers and the
// "can the student see this?" question are injected (the view answers it from window focus, page visibility and an IntersectionObserver).
//
// Why: the label used to be hidden 4 s after the vault event. An external change (`git checkout` in a terminal) reaches Obsidian only when its window
// regains focus — the moment the 4 s began, with the student not yet looking at the embed — and an embed scrolled off screen spent them unseen. The
// label is shown at once, and the 4 s count down only while `isAttentive()` is true: lose attention and the remainder is kept, regain it and the
// count resumes, so it is on screen for 4 s of actually being visible.
export interface UpdatedLabelDeps {
  ms: number;
  isAttentive(): boolean;
  now(): number;
  show(): void;
  hide(): void;
  setTimer(fn: () => void, ms: number): number;
  clearTimer(id: number): void;
}

export interface UpdatedLabel {
  /** The note changed under the embed: show the label and (re)start its count. */
  flash(): void;
  /** Focus, page visibility or on-screen state changed: pause or resume the count. */
  attentionChanged(): void;
  dispose(): void;
}

export function createUpdatedLabel(deps: UpdatedLabelDeps): UpdatedLabel {
  let showing = false;
  let disposed = false;
  let remaining = deps.ms;
  let timer: number | null = null;
  let startedAt = 0;

  const stopTimer = () => {
    if (timer !== null) { deps.clearTimer(timer); timer = null; }
  };
  const run = () => {
    if (!showing || timer !== null) return;
    startedAt = deps.now();
    timer = deps.setTimer(() => {
      timer = null;
      showing = false;
      remaining = deps.ms;
      deps.hide();
    }, remaining);
  };
  const pause = () => {
    if (timer === null) return;
    remaining = Math.max(0, remaining - (deps.now() - startedAt));
    stopTimer();
  };

  return {
    flash() {
      if (disposed) return;
      stopTimer();
      remaining = deps.ms;
      if (!showing) { showing = true; deps.show(); }
      if (deps.isAttentive()) run();
    },
    attentionChanged() {
      if (disposed || !showing) return;
      if (deps.isAttentive()) run(); else pause();
    },
    dispose() {
      disposed = true;
      showing = false;
      stopTimer();
    },
  };
}

/** Can the student see the label right now? All three: the window has focus, the page is visible (not a background tab / minimised), and the embed is on screen. */
export function isLabelAttentive(state: { windowFocused: boolean; pageVisible: boolean; onScreen: boolean }): boolean {
  return state.windowFocused && state.pageVisible && state.onScreen;
}
