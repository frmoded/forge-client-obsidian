// 2026-10-30-1020 - the bars the notebook has selected are tinted on the Score itself, so the person sees what Run will use. Plain DOM over the engraving (no obsidian import). The tint is a translucent rectangle INSIDE the bar's
// group, first child (behind the drawing), painted with INLINE style and a literal fallback colour: the same lesson as the inspector's band (2026-10-22-2300: a stylesheet-only cue was not visible in the real Obsidian). It is drawn
// from the whole selection every time and is idempotent (a bar that has its tint is not touched), because the inspector's observer repaints on every DOM change and must not find work in ours.
import { pinnedNoteFor } from './linked-panes-core.ts';
import { PHRASE_BAR_ROLE } from './phrase-lineage-core.ts';

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

// 2026-11-24-1033 - THE NOTE EACH DRAWN BAR WAS MADE FROM, on the measure itself. The composer says a bar by NUMBER (`Copy bar 3.`); a person (and the sentence service) says it by LINK (`please duplicate [[bar_007]]`). The only thing that knows which note made bar K is the phrase tab's
// provenance map, so the tab writes it on each measure (`data-forge-bar-note="bar_007"`) and the composer reads it back (did-you-mean-core `drawnBarNames`). Only a bar of a phrase that a NOTE OF bars/ made has one (the note the notes pane follows: a fork wins, then the source); a bar of a transform, a mix
// or a morph has none, and a Score with a bar that has none says nothing at all (the reader answers "unknown", never "not in the phrase"). Idempotent like the tint: the inspector's observer repaints on every DOM change and must not find work in ours.
export const BAR_NOTE_ATTR = 'data-forge-bar-note';
export function paintBarNotes(host: Element, map: Readonly<Record<string, { noteId: string; role: string; params: Record<string, unknown> }>>): number {
  const want = new Map<Element, string>();
  for (const id of Object.keys(map)) {
    const prov = map[id];
    if (prov.role !== PHRASE_BAR_ROLE) continue;
    const pin = pinnedNoteFor(prov), m = pin === null ? null : /^bars\/([^/]+)$/.exec(pin.noteId);
    const bar = m === null ? null : host.querySelector(`[id="${id.replace(/"/g, '')}"]`);
    if (m !== null && bar !== null) want.set(bar, m[1]);
  }
  let edits = 0;
  for (const el of Array.from(host.querySelectorAll(`[${BAR_NOTE_ATTR}]`))) if (!want.has(el)) { el.removeAttribute(BAR_NOTE_ATTR); edits++; }
  for (const [el, name] of want) if (el.getAttribute(BAR_NOTE_ATTR) !== name) { el.setAttribute(BAR_NOTE_ATTR, name); edits++; }
  return edits;
}
