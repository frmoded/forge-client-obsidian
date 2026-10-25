// score_first M7c Phase B (drain 2026-10-24-1230) — the colour cue of a morph's pinned bar: every notehead of THAT bar is drawn by where its hit came from — only bar a (not changed yet), only bar b (already changed), both
// bars — as a fill AND a small shape beside it (▲ ■ ●), all INLINE-styled with literal colours (the M6 lesson: a cue that is only a class name or a stylesheet rule was invisible in the real Obsidian). The same drawing as
// the mix's (mix-hits-dom.ts: the mark is the mix's); the difference is WHICH hits: a morph has many bars, so only the bars of the pinned element are painted, and a forked bar has no mapped hits. Plain DOM; repainted from
// the whole state on every call, so it can never go stale (and calling it twice paints once).
import { MIX_MARK_CLASS, markFor } from './mix-hits-dom.ts';
import { MORPH_COLOURS, MORPH_HIT_ROLE, type MorphHitKind } from './morph-lineage-core.ts';
import type { ProvenanceMap } from './provenance-core.ts';

const PAINTED = 'data-forge-morph-painted';

function elementFor(root: HTMLElement, id: string): Element | null {
  return root.querySelector(`[id="${id.replace(/"/g, '')}"]`);
}

/** Paint the hits of the pinned element's bar (`pinnedId` is any element of the morph: a bar or a hit), or clear everything when nothing is pinned. */
export function paintMorphHits(root: HTMLElement, map: ProvenanceMap, pinnedId: string | null): void {
  root.querySelectorAll(`.${MIX_MARK_CLASS}`).forEach((e) => e.remove());
  root.querySelectorAll(`[${PAINTED}]`).forEach((e) => {
    (e as unknown as HTMLElement).style.removeProperty('fill');
    // a browser leaves `style=""` behind once its last property is gone, and in real Chrome that empty attribute alone shifted anti-aliased pixels of the engraving (measured for the mix): give the markup back exactly
    if ((e.getAttribute('style') ?? '').trim() === '') e.removeAttribute('style');
    e.removeAttribute(PAINTED);
  });
  if (pinnedId === null || !Object.prototype.hasOwnProperty.call(map, pinnedId)) return;
  const bar = map[pinnedId].params.bar;
  for (const [id, prov] of Object.entries(map)) {
    if (prov.role !== MORPH_HIT_ROLE || prov.params.bar !== bar) continue;
    const el = elementFor(root, id);
    if (!el) continue;
    const kind = String(prov.params.kind) as MorphHitKind;
    const colour = MORPH_COLOURS[kind];
    const head = (el.querySelector('.notehead') ?? el) as unknown as HTMLElement;
    head.style.fill = colour;
    head.setAttribute(PAINTED, '1');
    const g = head as unknown as SVGGraphicsElement;
    if (typeof g.getBBox !== 'function') continue;                 // a DOM without layout: the fill alone
    try {
      const bb = g.getBBox();
      if (!(bb.width > 0 && bb.height > 0)) continue;
      el.appendChild(markFor(el.ownerDocument, kind, colour, false, bb));
    } catch { /* an element that cannot be measured keeps the fill */ }
  }
}
