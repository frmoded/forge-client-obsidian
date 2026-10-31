// 2026-10-31-1100 (M17b, item 4) - the structure strip of a COMPOSITION: the tree of treeRows (composition-strip-core.ts), one row per section, the note it plays as a chip (the same chip the other strips draw), a nested composition's
// sections one level below it. Plain DOM, no obsidian import (a happy-dom test mounts this very code). It tells its owner which chip is hovered or clicked and nothing else: a click sends the notes pane to that note (or opens it when
// there is no pair), a hover lights the bars of that note in the Score; both are the owner's.
import { STRIP_CHIP_CLASS, STRIP_CHIP_ON_CLASS } from './structure-strip-dom.ts';
import type { TreeRow } from './composition-strip-core.ts';

export const COMPOSITION_TREE_CLASS = 'forge-composition-tree';
export const COMPOSITION_ROW_CLASS = 'forge-composition-row';
export const COMPOSITION_INDENT_PX = 22;
/** The width of the number at the start of a row: the same for every row, so the chips line up whatever the number ("1", "10", the arrow of a nested row). */
export const COMPOSITION_INDEX_PX = 20;

export interface CompositionStripPorts {
  /** The pointer or keyboard focus is on a chip (`null` = it left). */
  onHover(row: TreeRow | null): void;
  /** A chip was clicked (or Enter / Space on it). */
  onClick(row: TreeRow): void;
}
export interface CompositionStrip {
  el: HTMLElement;
  /** Draw these rows (none = the strip is hidden). Keeps nothing of the old ones. */
  show(rows: readonly TreeRow[]): void;
  /** Emphasise the chips of these notes (the note a pinned bar came from); `null` clears. */
  emphasise(noteIds: readonly string[] | null): void;
  dispose(): void;
}

export function mountCompositionStrip(parent: HTMLElement, ports: CompositionStripPorts, before: Element | null = null): CompositionStrip {
  const doc = parent.ownerDocument;
  const el = doc.createElement('div');
  el.className = COMPOSITION_TREE_CLASS;
  el.setAttribute('role', 'navigation');
  el.setAttribute('aria-label', 'Sections');
  el.style.display = 'none';
  if (before && before.parentNode === parent) parent.insertBefore(el, before); else parent.appendChild(el);

  let emphasised: ReadonlySet<string> = new Set();
  const paint = (): void => el.querySelectorAll<HTMLElement>(`.${STRIP_CHIP_CLASS}`).forEach((b) => {
    const on = b.dataset.note !== undefined && emphasised.has(b.dataset.note);
    b.classList.toggle(STRIP_CHIP_ON_CLASS, on);
    b.style.fontWeight = on ? '700' : '';
    b.style.outlineWidth = on ? '2px' : '';
    b.style.outlineStyle = on ? 'solid' : '';
    b.style.outlineColor = on ? 'var(--interactive-accent, #7c3aed)' : '';
    b.style.outlineOffset = on ? '1px' : '';
  });

  return {
    el,
    show(rows) {
      el.textContent = '';
      el.style.display = rows.length === 0 ? 'none' : '';
      for (const r of rows) {
        const row = doc.createElement('div');
        row.className = COMPOSITION_ROW_CLASS;
        row.dataset.depth = String(r.depth);
        row.style.paddingLeft = `${r.depth * COMPOSITION_INDENT_PX}px`;
        row.style.display = 'flex';                                    // inline, like the other strips: this plugin has no stylesheet rule for them
        row.style.alignItems = 'center';
        row.style.gap = '8px';
        const index = doc.createElement('span');
        index.className = 'forge-composition-index';
        index.textContent = r.section === null ? '↳' : String(r.section);
        index.setAttribute('aria-hidden', 'true');
        index.style.display = 'inline-block';                          // a fixed width: measured in real Chrome, the "↳" of a nested row was wider than the "1" of a section, so its chip sat 26 px in instead of the indent's 22
        index.style.width = `${COMPOSITION_INDEX_PX}px`;
        index.style.textAlign = 'right';
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = `${STRIP_CHIP_CLASS} ${STRIP_CHIP_CLASS}-${r.kind}`;
        b.textContent = r.label;
        b.dataset.note = r.noteId;
        b.setAttribute('aria-label', `Open ${r.label}`);
        b.addEventListener('mouseenter', () => ports.onHover(r));
        b.addEventListener('mouseleave', () => ports.onHover(null));
        b.addEventListener('focus', () => ports.onHover(r));
        b.addEventListener('blur', () => ports.onHover(null));
        b.addEventListener('click', () => ports.onClick(r));
        const detail = doc.createElement('span');
        detail.className = 'forge-composition-detail';
        detail.textContent = r.detail;
        row.append(index, b, detail);
        el.appendChild(row);
      }
      paint();
    },
    emphasise(noteIds) { emphasised = new Set(noteIds ?? []); paint(); },
    dispose() { el.remove(); },
  };
}
