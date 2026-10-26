// 2026-10-26-1100 — the zoom a person chose on a Score, remembered across the redraws of the SAME tab. Every redraw of a phrase Score builds its engraving host from scratch, and the zoom level used to be a local variable
// of that render, so every Weight step, Bars change or fork put the Score back to 100% (a 17-bar morph is clipped at 100% when the pane is narrow). One memory per tab (the phrase view makes it); a render that is given
// none keeps the old behaviour (its own level, 100%). Pure: no DOM, no Obsidian.
export interface ZoomMemory {
  /** The index into the zoom levels. */
  get(): number;
  /** Remember an index (clamped to the levels that exist; a number that is not one changes nothing). */
  set(index: number): void;
  /** Back to 100%. */
  reset(): void;
}

export function createZoomMemory(levels: readonly number[], initialLevel: number): ZoomMemory {
  const home = Math.max(0, levels.indexOf(initialLevel));
  let index = home;
  return {
    get: () => index,
    set(next) {
      if (typeof next !== 'number' || Number.isNaN(next)) return;
      index = Math.min(levels.length - 1, Math.max(0, Math.round(next)));
    },
    reset() { index = home; },
  };
}

/** The zoom levels of a Score (the music edition's zoom buttons step through these). One list, so the memory a tab keeps and the renderer that reads it can never disagree about what an index means. */
export const SCORE_ZOOM_LEVELS: readonly number[] = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0];
