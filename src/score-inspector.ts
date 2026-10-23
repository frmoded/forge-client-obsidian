// score_first_experiment M3 (drain 2026-10-21-1230) — the Score's inspector, put together: the generic interaction layer (artifact-inspector-core.ts) + the panel under the score + the
// hover-link to the Beat Box grid. Plain DOM, no obsidian import (a happy-dom test mounts this very code). It lives only in a score-first vault: attachScoreArea builds it only when
// the tab asked for provenance.
//
// What it does, in the order a person meets it:
//   * every time a score is SHOWN (live-score-dom.ts swaps host and map in the same tick) the interaction layer is attached to that host with THAT payload's map; the old one is detached;
//   * hovering an engraved note lights it and tells the grid (`postHighlight`); hovering a grid step (`gridHover`) lights the engraved note of the same (channel, step);
//   * clicking pins the note: the panel shows its lineage stack (the hit, then the note it came from, with an "Open note" action); Esc unpins; the arrow keys walk the notes;
//   * "Notes in this score" lists the distinct notes (one today); hovering one lights all its engraved notes.
// If the map could not be built, the panel says why (never a guess); if only the Kit view is unmapped, one quiet line says so.
import { attachArtifactInspector, lineageOf, notesInMap, orderByStepThenChannel, type ArtifactInspector, type InspectorEntry, type LineageEntry } from './artifact-inspector-core.ts';
import { barsCoveredBy } from './phrase-lineage-core.ts';
import { CANONICAL_CHANNELS, hitId, type Provenance, type ProvenanceMap, type ProvenanceResult } from './provenance-core.ts';

export const INSPECTOR_CLASS = 'forge-inspector';
export const INSPECTOR_HINT = 'Click an engraved note to see where it came from. Arrow keys move between notes; Esc lets go.';

export interface GridTarget { channel: string; step: number }

export interface ScoreInspectorPorts {
  /** The note this tab is showing (`bars/bar_003`): the scope of the ids and the first lineage entry. */
  noteId: string;
  /** "Open note": open that note's file (the plugin's own opener). */
  openNote(noteId: string): void;
  /** Engraved note hovered -> light the grid step (`null` clears). Absent (a phrase has no grid) = nothing is told. */
  postHighlight?(target: GridTarget | null): void;
  // score_first M6 (drain 2026-10-22-1950): the phrase tab reuses THIS inspector for bars. Every option below is absent for the bar's tab, which is exactly what it was.
  /** How the map is built from what was rendered (the data handed to the Score, and the engine's payload). Default: a bar's hits (`attachProvenance`). */
  annotate?(data: unknown, payload: Record<string, unknown>): ProvenanceResult;
  /** The lineage stack of a pinned element. Default: `lineageOf` (a hit, then its note). */
  lineage?(prov: Provenance): LineageEntry[];
  /** The arrow-key order. Default: by step, then channel. */
  order?(map: ProvenanceMap): string[];
  /** M8 (mix): a redraw (the Weight slider moved) keeps the pin: the same element if the new engraving still has it, else the map's first element (the bar). Absent = a redraw forgets the pin, as it always did. */
  keepPin?: boolean;
  /** M8 (mix): which elements get an enlarged click target (default: all). */
  enlargeIds?(map: ProvenanceMap): string[];
  /** M8 (mix): a cue painted from the whole state on every change of the pin (the colours by parent). `host` is the engraving's host, `pinnedId` null when nothing is pinned. */
  decorate?(host: HTMLElement, map: ProvenanceMap, pinnedId: string | null): void;
  /** The one-line hint when nothing is pinned. Default: the engraved-note hint. */
  hint?: string;
  /** The pointer target of each element: `null` = none added (a bar is its own target). Default: the note-sized enlargement. */
  enlargeTargets?: { x: number; y: number } | null;
  /** drain 2026-10-22-2300: light elements with a stylesheet-independent band and dim the rest while one is pinned (artifact-inspector-core `band`). */
  band?: boolean;
  /** Hovering an element with nothing pinned SHOWS its lineage stack (and leaving restores the hint). */
  previewOnHover?: boolean;
  /** The quiet line when only the Kit view is unmapped. */
  kitNote?: string;
}

export interface ScoreInspector {
  onShown(host: HTMLElement, result: ProvenanceResult): void;
  onHidden(host: HTMLElement): void;
  /** The pointer is over a grid step / ring cell in the Beat Box (`null` = it left): light the engraved note. */
  gridHover(target: GridTarget | null): void;
  /** M6: light these elements from outside (the phrase bracket); `[]` clears. */
  lightAll(ids: readonly string[]): void;
  dispose(): void;
}

export function createScoreInspector(slot: HTMLElement, ports: ScoreInspectorPorts): ScoreInspector {
  const doc = slot.ownerDocument;
  const root = doc.createElement('div');
  root.className = INSPECTOR_CLASS;
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Inspector');
  const title = doc.createElement('div'); title.className = 'forge-inspector-title'; title.textContent = 'Inspector';
  const body = doc.createElement('div'); body.className = 'forge-inspector-body'; body.setAttribute('aria-live', 'polite');
  const notes = doc.createElement('div'); notes.className = 'forge-inspector-notes';
  const quiet = doc.createElement('div'); quiet.className = 'forge-inspector-quiet';
  root.append(title, body, notes, quiet);
  slot.appendChild(root);

  let current: { host: HTMLElement; layer: ArtifactInspector; result: ProvenanceResult } | null = null;
  let lastPinned: string | null = null;                   // what was pinned when the Score was last redrawn (used only with `keepPin`)

  const hint = ports.hint ?? INSPECTOR_HINT;
  const showHint = (text: string) => { body.textContent = text; };
  showHint(hint);

  /** Render a stack. `preview` = it is only what the pointer is over (nothing pinned): the same stack, marked, and its hover-link is left off. */
  function renderStack(entry: InspectorEntry, preview: boolean) {
    body.textContent = '';
    const list = doc.createElement('ol'); list.className = preview ? 'forge-inspector-lineage forge-inspector-preview' : 'forge-inspector-lineage';
    for (const l of (ports.lineage ?? lineageOf)(entry.prov)) {
      const li = doc.createElement('li'); li.className = `forge-inspector-${l.kind}`;
      if (l.kind === 'legend' && l.legend) {
        // M8: coloured marks with their meaning; the colours are INLINE so a theme cannot take them away
        const span = doc.createElement('span');
        l.legend.forEach((item, i) => {
          if (i > 0) span.appendChild(doc.createTextNode(' · '));
          const mark = doc.createElement('span'); mark.className = 'forge-inspector-legend-mark'; mark.textContent = item.mark; mark.setAttribute('style', `color: ${item.colour}; font-weight: bold;`);
          span.appendChild(mark); span.appendChild(doc.createTextNode(` ${item.text}`));
        });
        li.appendChild(span); list.appendChild(li);
        continue;
      }
      const span = doc.createElement('span'); span.textContent = l.text; li.appendChild(span);
      if (l.kind === 'note' && l.noteId) {
        const b = doc.createElement('button'); b.type = 'button'; b.className = 'forge-inspector-open'; b.textContent = 'Open note';
        if (l.openLabel) b.setAttribute('aria-label', l.openLabel);
        const id = l.noteId;
        b.addEventListener('click', () => ports.openNote(id));
        li.appendChild(b);
      }
      if (l.covers !== undefined && !preview) {
        // the hover-link of a stack entry: it lights the bars it covers (never calls back into the inspector's own onHover, so there is no echo)
        const covers = l.covers; const pinnedId = entry.id;
        li.addEventListener('mouseenter', () => current?.layer.highlightAll(barsCoveredBy(current.result.map, pinnedId, covers)));
        li.addEventListener('mouseleave', () => current?.layer.highlightAll([]));
      }
      list.appendChild(li);
    }
    body.appendChild(list);
  }
  function renderPinned(entry: InspectorEntry | null) {
    if (entry === null) { showHint(hint); return; }
    renderStack(entry, false);
  }

  function renderNotes(result: ProvenanceResult | null) {
    notes.textContent = '';
    if (!result || Object.keys(result.map).length === 0) return;
    const head = doc.createElement('div'); head.className = 'forge-inspector-notes-title'; head.textContent = 'Notes in this score';
    const ul = doc.createElement('ul');
    for (const n of notesInMap(result.map)) {
      const li = doc.createElement('li'); li.className = 'forge-inspector-note';
      li.textContent = n.noteId;
      li.addEventListener('mouseenter', () => current?.layer.highlightAll(n.ids));
      li.addEventListener('mouseleave', () => current?.layer.highlightAll([]));
      ul.appendChild(li);
    }
    notes.append(head, ul);
  }

  function detach() {
    if (!current) return;
    current.layer.dispose();
    current = null;
  }

  return {
    onShown(host, result) {
      const wasPinned = ports.keepPin ? lastPinned : null;
      detach();
      renderNotes(result);
      quiet.textContent = '';
      if (result.problems.length > 0) {
        showHint(`This score could not be mapped to its note, so it cannot be inspected (${result.problems[0]}).`);
        return;
      }
      if (result.kitProblems.length > 0) quiet.textContent = ports.kitNote ?? 'Kit view: not mapped for this bar (use the multi-staff view to inspect).';
      showHint(hint);
      const map = result.map;
      const layer = attachArtifactInspector({
        root: host,
        map,
        order: ports.order ? ports.order(map) : orderByStepThenChannel(map, CANONICAL_CHANNELS),
        enlargeTargets: ports.enlargeTargets === undefined ? { x: 0.35, y: 0.15 } : ports.enlargeTargets ?? undefined,
        enlargeIds: ports.enlargeIds ? ports.enlargeIds(map) : undefined,
        decorate: ports.decorate ? (pinnedId) => ports.decorate!(host, map, pinnedId) : undefined,
        band: ports.band === true,
        onHover: (e) => {
          if (ports.previewOnHover && !layer.pinnedId()) { if (e) renderStack(e, true); else showHint(hint); }
          if (!ports.postHighlight) return;
          const p = e?.prov.params;
          ports.postHighlight(p && typeof p.channel === 'string' && typeof p.step === 'number' ? { channel: p.channel, step: p.step } : null);
        },
        onPin: (e) => { lastPinned = e ? e.id : null; renderPinned(e); },
      });
      current = { host, layer, result };
      if (wasPinned !== null) {
        const id = Object.prototype.hasOwnProperty.call(map, wasPinned) ? wasPinned : Object.keys(map)[0];
        if (id !== undefined) layer.pin(id);               // pins on the NEW engraving and re-renders the stack from the NEW map
      }
    },
    onHidden(host) {
      if (current && current.host === host) detach();
    },
    lightAll(ids) { current?.layer.highlightAll(ids); },
    gridHover(target) {
      if (!current) return;
      if (target === null) { current.layer.highlight(null); return; }
      const head = hitId('a', target.channel, target.step);
      const map = current.result.map;
      current.layer.highlightAll([head, ...Object.keys(map).filter((id) => map[id].params.tiedFrom === head)]);   // a tied hit lights its tail(s) too
    },
    dispose() {
      detach();
      root.remove();
    },
  };
}
