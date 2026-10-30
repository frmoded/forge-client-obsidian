// score_first M10 slice 3 (drain 2026-10-30-1000) - the ROWS of an arrangement's Score, drawn into the engraving. The MusicXML gives the measure of the first part an id (`ph_bar_3`, annotatePhraseXml) but a part's staff has none, so the map's rows
// (`ph_bar_3_kick`: arrangement-nav-core.ts) have nothing to be clicked on. Verovio draws one measure group per bar holding one `g.staff` per part, in the order of the parts (measured with the real toolkit: arrangement-nav-engine.test.ts);
// this puts into each staff, BEHIND its drawing, a transparent group with the row's id covering the staff and a little above and below it. A click on a notehead, a rest or the empty staff then lands on the row of that kit's channel and of
// that bar; the inspector pins it. Plain DOM, no obsidian import. Idempotent: a row that is there is left alone, so the inspector's own repaints (which call this again) cost nothing and end.
import { ARRANGEMENT_ROW_ROLE } from './arrangement-nav-core.ts';
import type { ProvenanceMap } from './provenance-core.ts';

export const ROW_CLASS = 'forge-arr-row';
/** How far the row reaches above and below its staff, as a fraction of the staff's height. */
export const ROW_PAD = 0.25;
const SVG = 'http://www.w3.org/2000/svg';

const byId = (host: Element, id: string): Element | null => host.querySelector(`[id="${id.replace(/"/g, '')}"]`);

/** Draw the rows of `map` that are not drawn yet. Returns how many it made. A bar whose measure is not in the SVG (the Kit view) or whose staff cannot be measured gets none: nothing is guessed. */
export function ensureArrangementRows(host: HTMLElement, map: ProvenanceMap): number {
  let made = 0;
  const staves = new Map<number, Element[]>();
  for (const [id, prov] of Object.entries(map)) {
    if (prov.role !== ARRANGEMENT_ROW_ROLE) continue;
    const bar = prov.params.bar, index = prov.params.staff;
    if (typeof bar !== 'number' || typeof index !== 'number') continue;
    if (byId(host, id) !== null) continue;
    if (!staves.has(bar)) {
      const measure = byId(host, `ph_bar_${bar}`);
      staves.set(bar, measure === null ? [] : Array.from(measure.children).filter((c) => c.classList.contains('staff')));
    }
    const staff = staves.get(bar)![index] as unknown as (SVGGraphicsElement | undefined);
    if (!staff || typeof staff.getBBox !== 'function') continue;
    try {
      const b = staff.getBBox();
      if (!(b.width > 0 && b.height > 0)) continue;
      const doc = staff.ownerDocument;
      const g = doc.createElementNS(SVG, 'g');
      g.setAttribute('id', id);
      g.setAttribute('class', ROW_CLASS);
      const r = doc.createElementNS(SVG, 'rect');
      r.setAttribute('x', String(b.x)); r.setAttribute('y', String(b.y - b.height * ROW_PAD));
      r.setAttribute('width', String(b.width)); r.setAttribute('height', String(b.height * (1 + 2 * ROW_PAD)));
      r.setAttribute('fill', 'transparent'); r.setAttribute('stroke', 'none'); r.setAttribute('pointer-events', 'all');
      g.appendChild(r);
      staff.insertBefore(g, staff.firstChild);                    // behind the drawing: a notehead is above it and still gets its own click
      made++;
    } catch { /* a staff that cannot be measured has no row: the bar is not guessed at */ }
  }
  return made;
}
