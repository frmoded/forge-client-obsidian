// Auto-height glue (drain 2026-10-18-1800): binds the pure controller (widget-auto-height-core.ts) to an iframe's style. No Obsidian imports, so it is
// testable under node:test; the clock and timers default to the real ones and can be injected.
import { createAutoHeightController, type AutoHeightController } from './widget-auto-height-core.ts';

export interface AttachAutoHeightOptions {
  /** The height the iframe has now (0 when it has no px height yet, e.g. `100%`: the first request then always applies). */
  initial: number;
  /** The visible height of the pane the widget lives in; the controller never grows past ~1.5 x this. */
  paneHeight: () => number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => number;
  clearTimer?: (id: number) => void;
}

export function attachAutoHeight(iframe: { style: { height: string } }, opts: AttachAutoHeightOptions): AutoHeightController {
  return createAutoHeightController({
    initial: opts.initial,
    paneHeight: opts.paneHeight,
    apply: (px) => { iframe.style.height = `${px}px`; },
    now: opts.now ?? (() => Date.now()),
    setTimer: opts.setTimer ?? ((fn, ms) => globalThis.setTimeout(fn, ms) as unknown as number),
    clearTimer: opts.clearTimer ?? ((id) => globalThis.clearTimeout(id)),
  });
}
