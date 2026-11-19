// 2026-11-19-0975 - the tempo marks of an engraved Score follow the tempo control of its row (see tempo-marks-core.ts for the rule and the rounding). Plain DOM, no obsidian import: a test builds it in happy-dom over a REAL Verovio SVG.
// Verovio engraves a mark as `<g class="tempo"><text> <tspan>(the note glyph)</tspan> <tspan> = </tspan> <tspan>118</tspan> </text></g>`: the number is the last leaf tspan whose text is a plain number. The engraved number is kept in
// `data-forge-written` the first time a mark is painted, and every later paint computes from THAT (never from what the last paint said), so 105 %, then 100 % is exactly the engraving again. Nothing else in the SVG is touched.
import { markNumberAt } from './tempo-marks-core.ts';

const WRITTEN = 'data-forge-written';

/** The leaf element holding the bpm number of one tempo mark, or null when the mark has none (a word). */
function numberOf(mark: Element): Element | null {
  let found: Element | null = null;
  for (const el of Array.from(mark.querySelectorAll('tspan'))) {
    if (el.children.length > 0) continue;
    if (el.hasAttribute(WRITTEN) || /^\s*\d+(?:\.\d+)?\s*$/.test(el.textContent ?? '')) found = el;
  }
  return found;
}

/** Say the tempo of every mark under `root` at `pct` percent. Returns how many marks it painted (0 = the Score has none, e.g. a Score of a note with no tempo). */
export function paintTempoMarks(root: ParentNode, pct: number): number {
  let painted = 0;
  for (const mark of Array.from(root.querySelectorAll('g.tempo'))) {
    const el = numberOf(mark);
    if (el === null) continue;
    if (!el.hasAttribute(WRITTEN)) el.setAttribute(WRITTEN, el.textContent ?? '');
    const text = markNumberAt(el.getAttribute(WRITTEN) ?? '', pct);
    if (el.textContent !== text) el.textContent = text;
    painted++;
  }
  return painted;
}
