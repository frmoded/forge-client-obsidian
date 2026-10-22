// score_first_experiment M3 (drain 2026-10-21-1230) — the ARTIFACT INSPECTOR: a generic interaction layer over any SVG whose elements carry ids, plus a provenance map (id -> { noteId, role, params }).
// Nothing in this file knows about drums or Verovio: a melody score, a simulation frame or a floor plan with ids and a map could use it as it is (principle P7, reuse before invent).
//
// Behaviour (the driver's choice, 2026-10-21: design A's inspector panel + design C's hover-link; "it will change through time", so the layer stays small and replaceable):
//   hover      an element with an entry in the map is highlighted (class `forge-artifact-hot`) and `onHover(entry)` is told; leaving tells `onHover(null)`.
//   click      pins the element (class `forge-artifact-pinned`) and `onPin(entry)`; Esc, or a click on empty space inside the root, unpins (`onPin(null)`).
//   keyboard   the root is focusable; ArrowRight/Down = next, ArrowLeft/Up = previous element in `order` (default: the order of the map's keys); it pins and highlights as it goes.
//   outside    `highlight(id)` lights an element from elsewhere (the Beat Box grid) WITHOUT calling `onHover` (no echo); `highlight(null)` clears it.
// Highlights are classes only: a stylesheet recolours, nothing here changes size or position, so nothing shifts (the M1 lesson about layout jumps).
import type { Provenance, ProvenanceMap } from './provenance-core.ts';

export const HOT_CLASS = 'forge-artifact-hot';
export const PINNED_CLASS = 'forge-artifact-pinned';

export interface InspectorEntry { id: string; prov: Provenance }

export interface ArtifactInspectorOptions {
  /** The element the SVG lives in (the engraving's host). */
  root: HTMLElement;
  map: ProvenanceMap;
  onHover(entry: InspectorEntry | null): void;
  onPin(entry: InspectorEntry | null): void;
  /** Navigation order for the arrow keys (ids in the map). Default: the map's key order. */
  order?: readonly string[];
  /** Grow each element's pointer target: an invisible rect (class `forge-artifact-hitbox`) of the element's bounding box, widened by `x` and heightened by `y` as fractions of it. A drawn
   *  notehead is ~9 px wide, and a pointer in the middle of an SVG glyph can still miss it; the rect lives INSIDE the element, so events map to it exactly as to the glyph. */
  enlargeTargets?: { x: number; y: number };
}

export interface ArtifactInspector {
  highlight(id: string | null): void;
  /** Light several elements at once (e.g. every engraved note of one note); `[]` clears. */
  highlightAll(ids: readonly string[]): void;
  pin(id: string | null): void;
  pinnedId(): string | null;
  dispose(): void;
}

export const HITBOX_CLASS = 'forge-artifact-hitbox';

function addHitAreas(root: HTMLElement, ids: readonly string[], pad: { x: number; y: number }): Element[] {
  const made: Element[] = [];
  for (const id of ids) {
    const g = elementFor(root, id) as unknown as SVGGraphicsElement | null;
    if (!g || typeof g.getBBox !== 'function') continue;   // not an SVG graphics element (or a DOM without layout): nothing to enlarge
    if (Array.from(g.children).some((c) => c.getAttribute('class') === HITBOX_CLASS)) continue;   // this very element already has its target
    try {
      const b = g.getBBox();
      if (!(b.width > 0 && b.height > 0)) continue;
      const r = g.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.setAttribute('class', HITBOX_CLASS);
      r.setAttribute('x', String(b.x - b.width * pad.x)); r.setAttribute('y', String(b.y - b.height * pad.y));
      r.setAttribute('width', String(b.width * (1 + 2 * pad.x))); r.setAttribute('height', String(b.height * (1 + 2 * pad.y)));
      r.setAttribute('fill', 'transparent'); r.setAttribute('stroke', 'none'); r.setAttribute('pointer-events', 'all');
      g.appendChild(r); made.push(r);
    } catch { /* an element that cannot be measured keeps its own shape as its target */ }
  }
  return made;
}

function elementFor(root: HTMLElement, id: string): Element | null {
  return root.querySelector(`[id="${id.replace(/"/g, '')}"]`);
}

/** The nearest ancestor-or-self of `t` (inside `root`) whose id is in the map. */
function mappedAncestor(root: HTMLElement, map: ProvenanceMap, t: EventTarget | null): Element | null {
  let el = (t as Node | null)?.nodeType === 1 ? (t as Element) : null;   // duck-typed: `instanceof Element` is false across windows (Obsidian pop-outs) and in test DOMs
  while (el && el !== root) {
    if (el.id && Object.prototype.hasOwnProperty.call(map, el.id)) return el;
    el = el.parentElement ?? (el.parentNode as Element | null);
  }
  return null;
}

export function attachArtifactInspector(opts: ArtifactInspectorOptions): ArtifactInspector {
  const { root, map } = opts;
  const order = (opts.order ?? Object.keys(map)).filter((id) => Object.prototype.hasOwnProperty.call(map, id));
  let hot: string[] = [];
  let pinned: string | null = null;
  const entry = (id: string): InspectorEntry => ({ id, prov: map[id] });
  const mark = (id: string | null, cls: string, on: boolean) => { if (id !== null) elementFor(root, id)?.classList.toggle(cls, on); };
  const setHotAll = (ids: readonly string[]) => {
    if (ids.length === hot.length && ids.every((x, i) => x === hot[i])) return;
    hot.forEach((x) => mark(x, HOT_CLASS, false));
    hot = [...ids];
    hot.forEach((x) => mark(x, HOT_CLASS, true));
  };
  const setHot = (id: string | null) => setHotAll(id === null ? [] : [id]);
  const setPinned = (id: string | null) => {
    if (id === pinned) return;
    mark(pinned, PINNED_CLASS, false);
    pinned = id;
    mark(pinned, PINNED_CLASS, true);
    opts.onPin(pinned === null ? null : entry(pinned));
  };

  const onOver = (e: Event) => {
    const el = mappedAncestor(root, map, e.target);
    if (!el) return;
    setHot(el.id);
    opts.onHover(entry(el.id));
  };
  const onOut = (e: Event) => {
    const to = (e as MouseEvent).relatedTarget;
    if (mappedAncestor(root, map, to)) return;            // moving to another mapped element: its own mouseover takes over
    if (hot.length === 0) return;
    setHot(null);
    opts.onHover(null);
  };
  const onClick = (e: Event) => {
    const el = mappedAncestor(root, map, e.target);
    setPinned(el ? el.id : null);                          // a click on empty space inside the root unpins
  };
  const onKey = (e: Event) => {
    const k = (e as KeyboardEvent).key;
    if (k === 'Escape') { setPinned(null); return; }
    const next = k === 'ArrowRight' || k === 'ArrowDown' ? 1 : k === 'ArrowLeft' || k === 'ArrowUp' ? -1 : 0;
    if (next === 0 || order.length === 0) return;
    e.preventDefault();
    const at = pinned === null ? -1 : order.indexOf(pinned);
    const to = at < 0 ? (next === 1 ? 0 : order.length - 1) : (at + next + order.length) % order.length;
    setHot(order[to]);
    setPinned(order[to]);
    opts.onHover(entry(order[to]));
  };
  // The engraving may not be in the DOM yet when this attaches (the renderer is fire-and-forget), and the Score's own Kit / Multi-staff toggle REPLACES the SVG inside the same host:
  // grow the targets for what is there now, and again whenever the content changes (an element that already has its target is skipped, so our own additions end the loop).
  const hitAreas: Element[] = [];
  const growTargets = () => { if (opts.enlargeTargets) hitAreas.push(...addHitAreas(root, Object.keys(map), opts.enlargeTargets)); };
  const reapplyMarks = () => { hot.forEach((x) => mark(x, HOT_CLASS, true)); mark(pinned, PINNED_CLASS, true); };   // a replaced SVG has new elements with the same ids
  growTargets();
  const MO = (root.ownerDocument.defaultView as (Window & { MutationObserver?: typeof MutationObserver }) | null)?.MutationObserver;
  const arrival = typeof MO === 'function' ? new MO(() => { growTargets(); reapplyMarks(); }) : null;
  arrival?.observe(root, { childList: true, subtree: true });
  if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '0');
  root.addEventListener('mouseover', onOver);
  root.addEventListener('mouseout', onOut);
  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKey);

  return {
    highlight(id) { setHot(id !== null && Object.prototype.hasOwnProperty.call(map, id) ? id : null); },
    highlightAll(ids) { setHotAll(ids.filter((x) => Object.prototype.hasOwnProperty.call(map, x))); },
    pin(id) { setPinned(id !== null && Object.prototype.hasOwnProperty.call(map, id) ? id : null); },
    pinnedId: () => pinned,
    dispose() {
      root.removeEventListener('mouseover', onOver);
      root.removeEventListener('mouseout', onOut);
      root.removeEventListener('click', onClick);
      root.removeEventListener('keydown', onKey);
      arrival?.disconnect();
      hitAreas.forEach((r) => r.remove());
      hot.forEach((x) => mark(x, HOT_CLASS, false));
      mark(pinned, PINNED_CLASS, false);
      hot = [];
      pinned = null;
    },
  };
}

/** The navigation order of a map's elements: the hits by step, then by canonical channel order (what a reader scans). Generic fallback: the map's own key order. */
export function orderByStepThenChannel(map: ProvenanceMap, channelOrder: readonly string[]): string[] {
  const rank = (id: string) => {
    const p = map[id].params;
    const step = typeof p.step === 'number' ? p.step : Number.MAX_SAFE_INTEGER;
    const ch = typeof p.channel === 'string' ? channelOrder.indexOf(p.channel) : -1;
    return [step, ch < 0 ? channelOrder.length : ch] as const;
  };
  return Object.keys(map).filter((id) => map[id].params.tiedFrom === undefined).sort((a, b) => { const x = rank(a), y = rank(b); return x[0] - y[0] || x[1] - y[1]; });
}

/** One line of the lineage stack. */
export interface LineageEntry {
  /** 'hit' and 'note' are the bar inspector's; 'bar' and 'tempo' are a phrase's (M6). The kind is a CSS class (`forge-inspector-<kind>`). */
  kind: 'hit' | 'note' | 'bar' | 'tempo';
  text: string;
  noteId?: string;
  /** M6: the link's accessible name (the bar inspector's "Open note" buttons have none: its DOM is unchanged). */
  openLabel?: string;
  /** M6: what hovering this entry lights — the pinned element only, or every element of the map. Absent = nothing (the bar inspector). */
  covers?: 'self' | 'all';
}

/** The lineage of a pinned element, outermost-meaningful first: the hit itself, then the note it came from. (Parents of extend/mix notes slot in between later.) */
export function lineageOf(prov: Provenance): LineageEntry[] {
  const p = prov.params;
  const out: LineageEntry[] = [];
  if (prov.role === 'hit') {
    const vel = typeof p.velocity === 'number' ? `, velocity ${p.velocity}` : '';
    const tail = p.tiedFrom !== undefined ? ' — tied continuation' : '';
    out.push({ kind: 'hit', text: `${String(p.channel)} — step ${typeof p.step === 'number' ? p.step + 1 : '?'} (${String(p.beat)})${vel}${tail}` });
  } else {
    out.push({ kind: 'hit', text: prov.role });
  }
  out.push({ kind: 'note', text: prov.noteId, noteId: prov.noteId });
  return out;
}

/** The distinct notes a map draws on, with their element ids, in first-appearance order. */
export function notesInMap(map: ProvenanceMap): Array<{ noteId: string; ids: string[] }> {
  const by = new Map<string, string[]>();
  for (const [id, p] of Object.entries(map)) (by.get(p.noteId) ?? by.set(p.noteId, []).get(p.noteId)!).push(id);
  return [...by.entries()].map(([noteId, ids]) => ({ noteId, ids }));
}
