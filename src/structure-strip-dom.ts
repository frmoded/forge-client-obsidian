// score_first M13 (drain 2026-10-26-1270, DEMO profile) — the structure strip's DOM: the chips of structure-strip-core.ts as buttons joined by arrows. Plain DOM, no obsidian import (a happy-dom test mounts this very code).
// It tells its owner which chip is hovered or clicked and nothing else; what a click or a hover DOES (navigate the notes pane, light bars) is the owner's.
import { stripTokens, type Chip } from './structure-strip-core.ts';

export const STRIP_CLASS = 'forge-structure-strip';
export const STRIP_CHIP_CLASS = 'forge-structure-chip';
export const STRIP_CHIP_ON_CLASS = 'forge-structure-chip-on';

export interface StripPorts {
  /** The pointer or keyboard focus is on a chip (`null` = it left). */
  onHover(chip: Chip | null): void;
  /** A chip was clicked (or Enter / Space on it). */
  onClick(chip: Chip): void;
}

export interface StripHandle {
  el: HTMLElement;
  /** Draw these chips (none = the strip is hidden). Keeps nothing of the old ones. */
  set(chips: readonly Chip[]): void;
  /** Emphasise the chip of this note (the bar a pin is on came from it); `null` clears. */
  emphasise(noteId: string | null): void;
  dispose(): void;
}

export function mountStructureStrip(parent: HTMLElement, ports: StripPorts, before: Element | null = null): StripHandle {
  const doc = parent.ownerDocument;
  const el = doc.createElement('div');
  el.className = STRIP_CLASS;
  el.setAttribute('role', 'navigation');
  el.setAttribute('aria-label', 'Structure');
  el.style.display = 'none';
  if (before && before.parentNode === parent) parent.insertBefore(el, before); else parent.appendChild(el);

  let emphasised: string | null = null;
  const paint = () => el.querySelectorAll<HTMLElement>(`.${STRIP_CHIP_CLASS}`).forEach((b) => b.classList.toggle(STRIP_CHIP_ON_CLASS, emphasised !== null && b.dataset.note === emphasised));

  return {
    el,
    set(chips) {
      el.textContent = '';
      const tokens = stripTokens(chips);
      el.style.display = tokens.length === 0 ? 'none' : '';
      for (const t of tokens) {
        if (t === '->' || t === 'used by:') {
          const span = doc.createElement('span');
          span.className = t === '->' ? 'forge-structure-arrow' : 'forge-structure-label';
          span.textContent = t === '->' ? '→' : 'used by:';
          span.setAttribute('aria-hidden', t === '->' ? 'true' : 'false');
          el.appendChild(span);
          continue;
        }
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = `${STRIP_CHIP_CLASS} ${STRIP_CHIP_CLASS}-${t.kind}`;
        b.textContent = t.text;
        b.dataset.note = t.noteId;
        b.setAttribute('aria-label', `Open ${t.noteId.split('/').pop()}`);
        const chip = t;
        b.addEventListener('mouseenter', () => ports.onHover(chip));
        b.addEventListener('mouseleave', () => ports.onHover(null));
        b.addEventListener('focus', () => ports.onHover(chip));
        b.addEventListener('blur', () => ports.onHover(null));
        b.addEventListener('click', () => ports.onClick(chip));
        el.appendChild(b);
      }
      paint();
    },
    emphasise(noteId) { emphasised = noteId; paint(); },
    dispose() { el.remove(); },
  };
}
