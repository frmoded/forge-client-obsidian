// Auto-height for hosted widgets (drain 2026-10-18-1800 §2) — the HOST half, pure (no DOM, no timers of its own: the clock and the timer are injected).
//
// A widget that wants its iframe to fit its content measures itself (ResizeObserver) and posts `{type: "resize", height}`. The host
// validates the message, clamps the height and applies it. Everything that keeps this from misbehaving is here, because a widget whose layout depends on
// the iframe's own height (a `100vh` somewhere) would otherwise turn "resize" into a feedback loop: the guards are (1) a validated, whole-pixel message,
// (2) a [min, 1.5 x pane] clamp, (3) a dead band of 2 px around the current height, (4) a minimum interval between applies with the LATEST request
// winning (trailing edge), and (5) a sliding window cap on applies per second, so a runaway is slowed to a crawl rather than followed.
export const WIDGET_RESIZE_MESSAGE = 'resize';
export const AUTO_HEIGHT_MIN_PX = 120;
export const AUTO_HEIGHT_MAX_PANE_FACTOR = 1.5;
/** Used only when the pane height is unknown (0 / NaN, e.g. a detached or hidden leaf). */
export const AUTO_HEIGHT_ABSOLUTE_MAX_PX = 4000;
/** A change of this many px or fewer, from the last APPLIED height, is sub-pixel / scrollbar wobble and is ignored. */
export const AUTO_HEIGHT_DEAD_BAND_PX = 2;
export const AUTO_HEIGHT_MIN_INTERVAL_MS = 100;
export const AUTO_HEIGHT_WINDOW_MS = 1000;
export const AUTO_HEIGHT_MAX_APPLIES_PER_WINDOW = 8;
/** Beyond any real widget; a number this large is a bug or an attack, not a height. */
const PARSE_CEILING_PX = 100000;

/** The height a widget asked for, in whole pixels, or null when the message is not a well-formed resize (never a made-up number). */
export function parseWidgetResize(data: unknown): number | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const m = data as { type?: unknown; height?: unknown };
  if (m.type !== WIDGET_RESIZE_MESSAGE) return null;
  if (typeof m.height !== 'number' || !Number.isFinite(m.height)) return null;
  if (m.height < 0 || m.height > PARSE_CEILING_PX) return null;
  return Math.round(m.height);
}

export function clampAutoHeightPx(height: number, paneHeight: number): number {
  const known = Number.isFinite(paneHeight) && paneHeight > 0;
  const max = known ? Math.max(AUTO_HEIGHT_MIN_PX, Math.round(paneHeight * AUTO_HEIGHT_MAX_PANE_FACTOR)) : AUTO_HEIGHT_ABSOLUTE_MAX_PX;
  return Math.min(max, Math.max(AUTO_HEIGHT_MIN_PX, Math.round(height)));
}

export interface AutoHeightDeps {
  /** The height the iframe has now (the first paint: the note-aware initial height). */
  initial: number;
  paneHeight: () => number;
  apply: (px: number) => void;
  now: () => number;
  setTimer: (fn: () => void, ms: number) => number;
  clearTimer: (id: number) => void;
}

export interface AutoHeightController {
  request(rawHeight: number): void;
  dispose(): void;
}

export function createAutoHeightController(deps: AutoHeightDeps): AutoHeightController {
  let current = deps.initial;
  let disposed = false;
  let pending: number | null = null;
  let timer: number | null = null;
  const applyTimes: number[] = [];

  /** The earliest moment the next apply may happen: after the minimum interval AND within the per-window cap. */
  const earliest = (): number => {
    const t = deps.now();
    while (applyTimes.length && t - applyTimes[0] >= AUTO_HEIGHT_WINDOW_MS) applyTimes.shift();
    let at = applyTimes.length ? applyTimes[applyTimes.length - 1] + AUTO_HEIGHT_MIN_INTERVAL_MS : -Infinity;
    if (applyTimes.length >= AUTO_HEIGHT_MAX_APPLIES_PER_WINDOW) at = Math.max(at, applyTimes[0] + AUTO_HEIGHT_WINDOW_MS);
    return at;
  };
  const clearPending = () => {
    pending = null;
    if (timer !== null) { deps.clearTimer(timer); timer = null; }
  };
  const applyNow = (px: number) => {
    current = px;
    applyTimes.push(deps.now());
    deps.apply(px);
  };
  const schedule = (at: number) => {
    if (timer !== null) return;
    timer = deps.setTimer(() => {
      timer = null;
      if (disposed || pending === null) return;
      const again = earliest();
      if (deps.now() < again) { schedule(again); return; }
      const px = pending;
      pending = null;
      if (Math.abs(px - current) > AUTO_HEIGHT_DEAD_BAND_PX) applyNow(px);
    }, Math.max(0, at - deps.now()));
  };

  return {
    request(raw) {
      if (disposed) return;
      const px = clampAutoHeightPx(raw, deps.paneHeight());
      if (Math.abs(px - current) <= AUTO_HEIGHT_DEAD_BAND_PX) { clearPending(); return; }   // content went back to what is shown: drop a stale pending update
      const at = earliest();
      if (deps.now() >= at) { clearPending(); applyNow(px); return; }
      pending = px;                                                                           // coalesce: the latest wins
      schedule(at);
    },
    dispose() {
      disposed = true;
      clearPending();
    },
  };
}
