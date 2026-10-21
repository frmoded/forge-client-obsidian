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
import { attachArtifactInspector, lineageOf, notesInMap, orderByStepThenChannel, type ArtifactInspector, type InspectorEntry } from './artifact-inspector-core.ts';
import { CANONICAL_CHANNELS, hitId, type ProvenanceResult } from './provenance-core.ts';

export const INSPECTOR_CLASS = 'forge-inspector';
export const INSPECTOR_HINT = 'Click an engraved note to see where it came from. Arrow keys move between notes; Esc lets go.';

export interface GridTarget { channel: string; step: number }

export interface ScoreInspectorPorts {
  /** The note this tab is showing (`bars/bar_003`): the scope of the ids and the first lineage entry. */
  noteId: string;
  /** "Open note": open that note's file (the plugin's own opener). */
  openNote(noteId: string): void;
  /** Engraved note hovered -> light the grid step (`null` clears). */
  postHighlight(target: GridTarget | null): void;
}

export interface ScoreInspector {
  onShown(host: HTMLElement, result: ProvenanceResult): void;
  onHidden(host: HTMLElement): void;
  /** The pointer is over a grid step / ring cell in the Beat Box (`null` = it left): light the engraved note. */
  gridHover(target: GridTarget | null): void;
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

  const showHint = (text: string) => { body.textContent = text; };
  showHint(INSPECTOR_HINT);

  function renderPinned(entry: InspectorEntry | null) {
    body.textContent = '';
    if (entry === null) { showHint(INSPECTOR_HINT); return; }
    const list = doc.createElement('ol'); list.className = 'forge-inspector-lineage';
    for (const l of lineageOf(entry.prov)) {
      const li = doc.createElement('li'); li.className = `forge-inspector-${l.kind}`;
      const span = doc.createElement('span'); span.textContent = l.text; li.appendChild(span);
      if (l.kind === 'note' && l.noteId) {
        const b = doc.createElement('button'); b.type = 'button'; b.className = 'forge-inspector-open'; b.textContent = 'Open note';
        const id = l.noteId;
        b.addEventListener('click', () => ports.openNote(id));
        li.appendChild(b);
      }
      list.appendChild(li);
    }
    body.appendChild(list);
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
      detach();
      renderNotes(result);
      quiet.textContent = '';
      if (result.problems.length > 0) {
        showHint(`This score could not be mapped to its note, so it cannot be inspected (${result.problems[0]}).`);
        return;
      }
      if (result.kitProblems.length > 0) quiet.textContent = 'Kit view: not mapped for this bar (use the multi-staff view to inspect).';
      showHint(INSPECTOR_HINT);
      const map = result.map;
      const layer = attachArtifactInspector({
        root: host,
        map,
        order: orderByStepThenChannel(map, CANONICAL_CHANNELS),
        enlargeTargets: { x: 0.35, y: 0.15 },
        onHover: (e) => {
          const p = e?.prov.params;
          ports.postHighlight(p && typeof p.channel === 'string' && typeof p.step === 'number' ? { channel: p.channel, step: p.step } : null);
        },
        onPin: renderPinned,
      });
      current = { host, layer, result };
    },
    onHidden(host) {
      if (current && current.host === host) detach();
    },
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
