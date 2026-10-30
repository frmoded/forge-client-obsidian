// 2026-10-30-1020 - the bars the notebook has selected are tinted on the Score itself, so the person sees what Run will use. Plain DOM over the engraving (no obsidian import). The tint is a translucent rectangle INSIDE the bar's
// group, first child (behind the drawing), painted with INLINE style and a literal fallback colour: the same lesson as the inspector's band (2026-10-22-2300: a stylesheet-only cue was not visible in the real Obsidian). It is drawn
// from the whole selection every time and is idempotent (a bar that has its tint is not touched), because the inspector's observer repaints on every DOM change and must not find work in ours.
export const SELECTED_BAR_CLASS = 'forge-selected-bar';
const ACCENT = '#7c5cff';
const OPACITY = '0.22';
const SVG_NS = 'http://www.w3.org/2000/svg';

const tintOf = (bar: Element): Element | null => Array.from(bar.children).find((c) => c.getAttribute('class') === SELECTED_BAR_CLASS) ?? null;

/** Tint exactly the bars `ids` inside `host`; every other tint goes. Returns the number of edits made (0 = already as asked). A bar that is not on the Score, cannot be measured or has no size is skipped. */
export function paintSelectionTint(host: Element, ids: readonly string[]): number {
  const wanted = new Set(ids);
  let edits = 0;
  for (const r of Array.from(host.querySelectorAll(`.${SELECTED_BAR_CLASS}`))) {
    const bar = r.parentNode as Element | null;
    if (bar && wanted.has(bar.id)) continue;
    r.remove(); edits++;
  }
  for (const id of wanted) {
    const bar = host.querySelector(`[id="${id.replace(/"/g, '')}"]`) as (Element & { getBBox?: () => { x: number; y: number; width: number; height: number } }) | null;
    if (!bar || tintOf(bar) !== null || typeof bar.getBBox !== 'function') continue;
    try {
      const b = bar.getBBox();
      if (!(b.width > 0 && b.height > 0)) continue;
      const r = bar.ownerDocument.createElementNS(SVG_NS, 'rect');
      r.setAttribute('class', SELECTED_BAR_CLASS);
      r.setAttribute('x', String(b.x)); r.setAttribute('y', String(b.y)); r.setAttribute('width', String(b.width)); r.setAttribute('height', String(b.height));
      r.setAttribute('pointer-events', 'none');
      r.setAttribute('fill', ACCENT); r.setAttribute('fill-opacity', OPACITY);          // presentation attributes as the floor, inline style (which can use the theme colour) on top
      r.setAttribute('style', `fill: var(--interactive-accent, ${ACCENT}); fill-opacity: ${OPACITY}; pointer-events: none;`);
      bar.insertBefore(r, bar.firstChild);
      edits++;
    } catch { /* a bar that cannot be measured stays untinted */ }
  }
  return edits;
}
