// score_first M8 (drain 2026-10-23-0230) — the colour cue of a mix's pinned bar: every notehead is drawn by where its hit came from — only bar a, only bar b, both bars — as a fill AND a small shape
// beside it (▲ ■ ●; hollow for a ghost), all INLINE-styled with literal colours. The M6 lesson (Iteration 114): a cue that is only a class name or a stylesheet rule was invisible in the real Obsidian, so
// nothing here depends on the theme or on styles.css. Plain DOM; repainted from the whole state on every call, so it can never go stale (and calling it twice paints once).
import { MIX_COLOURS, MIX_HIT_ROLE, type MixHitKind } from './mix-lineage-core.ts';
import type { ProvenanceMap } from './provenance-core.ts';

export const MIX_MARK_CLASS = 'forge-mix-mark';
const PAINTED = 'data-forge-mix-painted';

const parentOf = (kind: MixHitKind): 'a' | 'b' | 'both' => (kind === 'a' || kind === 'ghost-a' ? 'a' : kind === 'b' || kind === 'ghost-b' ? 'b' : 'both');

function elementFor(root: HTMLElement, id: string): Element | null {
  return root.querySelector(`[id="${id.replace(/"/g, '')}"]`);
}

/** Paint the pinned bar's hits (`pinnedId` is any element of the mix: the bar or a hit), or clear everything when nothing is pinned. */
export function paintMixHits(root: HTMLElement, map: ProvenanceMap, pinnedId: string | null): void {
  root.querySelectorAll(`.${MIX_MARK_CLASS}`).forEach((e) => e.remove());
  root.querySelectorAll(`[${PAINTED}]`).forEach((e) => {
    (e as unknown as HTMLElement).style.removeProperty('fill');
    (e as unknown as HTMLElement).style.removeProperty('opacity');
    // a browser leaves `style=""` behind once its last property is gone, and in real Chrome that empty attribute alone shifted 89 anti-aliased pixels of the engraving (measured): give the markup back exactly
    if ((e.getAttribute('style') ?? '').trim() === '') e.removeAttribute('style');
    e.removeAttribute(PAINTED);
  });
  if (pinnedId === null) return;
  for (const [id, prov] of Object.entries(map)) {
    if (prov.role !== MIX_HIT_ROLE) continue;
    const el = elementFor(root, id);
    if (!el) continue;
    const kind = String(prov.params.kind) as MixHitKind;
    const parent = parentOf(kind);
    const ghost = kind === 'ghost-a' || kind === 'ghost-b';
    const colour = MIX_COLOURS[parent];
    const head = (el.querySelector('.notehead') ?? el) as unknown as HTMLElement;
    head.style.fill = colour;
    if (ghost) head.style.opacity = '0.6';
    head.setAttribute(PAINTED, '1');
    const g = head as unknown as SVGGraphicsElement;
    if (typeof g.getBBox !== 'function') continue;                 // a DOM without layout: the fill alone
    try {
      const bb = g.getBBox();
      if (!(bb.width > 0 && bb.height > 0)) continue;
      el.appendChild(markFor(el.ownerDocument, parent, colour, ghost, bb));
    } catch { /* an element that cannot be measured keeps the fill */ }
  }
}

export function markFor(doc: Document, parent: 'a' | 'b' | 'both', colour: string, ghost: boolean, bb: { x: number; y: number; width: number; height: number }): Element {
  const NS = 'http://www.w3.org/2000/svg';
  const s = bb.width * 0.7;                                         // the mark's size follows the notehead's
  const cx = bb.x - s * 0.7, cy = bb.y + bb.height / 2;             // just left of the notehead (a stem and a beam go up and to the right)
  let shape: Element;
  if (parent === 'a') {
    shape = doc.createElementNS(NS, 'polygon');
    shape.setAttribute('points', `${cx},${cy - s / 2} ${cx + s / 2},${cy + s / 2} ${cx - s / 2},${cy + s / 2}`);
  } else if (parent === 'b') {
    shape = doc.createElementNS(NS, 'rect');
    shape.setAttribute('x', String(cx - s / 2)); shape.setAttribute('y', String(cy - s / 2)); shape.setAttribute('width', String(s)); shape.setAttribute('height', String(s));
  } else {
    shape = doc.createElementNS(NS, 'circle');
    shape.setAttribute('cx', String(cx)); shape.setAttribute('cy', String(cy)); shape.setAttribute('r', String(s / 2));
  }
  shape.setAttribute('class', MIX_MARK_CLASS);
  shape.setAttribute('pointer-events', 'none');
  const fill = ghost ? 'none' : colour;
  shape.setAttribute('fill', fill); shape.setAttribute('stroke', colour); shape.setAttribute('stroke-width', String(Math.max(1, s * 0.12)));
  shape.setAttribute('style', `fill: ${fill}; stroke: ${colour}; pointer-events: none;`);
  return shape;
}
