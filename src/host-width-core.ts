// score_first M6 (drain 2026-10-22-1950, rider) — a Score engraved into a host that has not been laid out yet. The driver's console showed Verovio refusing `pageWidth` 80 (its minimum is 100)
// because the host measured 16 px at mount (a tab in the background, a pane that has not opened): the engraving failed instead of waiting. Two small decisions, both here so they are tested
// without Verovio or Obsidian:
//   pageWidthFor  the page width Verovio is asked for: 5x the host's width when the host really has one, else the default page (2100). Never below Verovio's minimum.
//   waitForWidth  wait (ResizeObserver, with a timeout) until the host has a real width, so the first engraving is made for the width it will be shown at, not for 16 px.

/** A host narrower than this has not been laid out (a real pane is hundreds of pixels). 20 px x 5 = 100, Verovio's own minimum page width. */
export const MIN_HOST_WIDTH_PX = 20;
export const DEFAULT_PAGE_WIDTH = 2100;
export const VEROVIO_MIN_PAGE_WIDTH = 100;

export function pageWidthFor(hostWidthPx?: number): number {
  if (typeof hostWidthPx !== 'number' || !Number.isFinite(hostWidthPx) || hostWidthPx < MIN_HOST_WIDTH_PX) return DEFAULT_PAGE_WIDTH;
  return Math.max(VEROVIO_MIN_PAGE_WIDTH, hostWidthPx * 5);
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
