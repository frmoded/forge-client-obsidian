// score_first M6 (drain 2026-10-22-1950, rider) — a Score engraved into a host that has not been laid out yet. The driver's console showed Verovio refusing `pageWidth` 80 (its minimum is 100)
// because the host measured 16 px at mount (a tab in the background, a pane that has not opened): the engraving failed instead of waiting. Two small decisions, both here so they are tested
// without Verovio or Obsidian:
//   pageWidthFor  the page width Verovio is asked for: 5x the host's width when the host really has one, else the default page (2100). Never below Verovio's minimum.
//   waitForWidth  wait (ResizeObserver, with a timeout) until the host has a real width, so the first engraving is made for the width it will be shown at, not for 16 px.

/** A host narrower than this has not been laid out (a real pane is hundreds of pixels). 20 px x 5 = 100, Verovio's own minimum page width. */
export const MIN_HOST_WIDTH_PX = 20;
export const DEFAULT_PAGE_WIDTH = 2100;
export const VEROVIO_MIN_PAGE_WIDTH = 100;

/** The engraving scale (Verovio `scale`, percent): the SVG is `pageWidth * scale / 100` px wide, so a page of `host * 100 / scale` is exactly as wide as its host. */
export const ENGRAVING_SCALE = 40;
/** 2026-11-15-1217: the page width that makes the engraving as wide as its host at its natural size (2.5 at scale 40): the Score then WRAPS into systems that fill the pane and the tab scrolls vertically. */
export const FIT_PAGE_FACTOR = 100 / ENGRAVING_SCALE;

/** 2026-11-15-1217: a compact (score-first) Score sits in `.forge-output-musicxml.forge-score-compact`, which has 8 px of padding each side (styles.css): the engraving is made that much narrower than its host, so it fills the pane without a horizontal scrollbar. */
export const COMPACT_SCORE_INSET_PX = 16;

/** The page width Verovio is asked for. `factor` is the multiple of the host's width: 5 (the default) engraves a page twice as wide as the host at natural size, which the CSS then shrinks to fit; FIT_PAGE_FACTOR engraves for the host's own width (the score-first tabs). */
export function pageWidthFor(hostWidthPx?: number, factor = 5): number {
  if (typeof hostWidthPx !== 'number' || !Number.isFinite(hostWidthPx) || hostWidthPx < MIN_HOST_WIDTH_PX) return DEFAULT_PAGE_WIDTH;
  return Math.max(VEROVIO_MIN_PAGE_WIDTH, hostWidthPx * factor);
}

export interface WidthHost {
  clientWidth: number;
  ownerDocument: { defaultView: unknown };
}

/** Resolves with the host's width: at once when it already has a real one; otherwise when a ResizeObserver reports one, or after `timeoutMs` with whatever it has by then (the caller then falls back
 *  through `pageWidthFor`, so a host that never gets a width still engraves). */
export function waitForWidth(host: WidthHost, minPx = MIN_HOST_WIDTH_PX, timeoutMs = 1500, timers: { set(fn: () => void, ms: number): unknown; clear(h: unknown): void } = { set: (fn, ms) => globalThis.setTimeout(fn, ms), clear: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>) }): Promise<number> {
  if (host.clientWidth >= minPx) return Promise.resolve(host.clientWidth);
  return new Promise((resolve) => {
    let done = false;
    let observer: { disconnect(): void } | null = null;
    let timer: unknown = null;
    const finish = () => {
      if (done) return;
      done = true;
      observer?.disconnect();
      if (timer !== null) timers.clear(timer);
      resolve(host.clientWidth);
    };
    const RO = (host.ownerDocument.defaultView as { ResizeObserver?: new (cb: () => void) => { observe(el: unknown): void; disconnect(): void } } | null)?.ResizeObserver;
    if (typeof RO === 'function') {
      const ro = new RO(() => { if (host.clientWidth >= minPx) finish(); });
      ro.observe(host);
      observer = ro;
    }
    timer = timers.set(finish, timeoutMs);
  });
}
