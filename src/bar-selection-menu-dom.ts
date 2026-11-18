// 2026-11-16-1000 - the small floating menu on a selection of bars (plain DOM, no obsidian import): a count ("3 bars selected: bars 3 to 5"), the five actions and a close button. It sits in the Score's area, ABOVE the first selected bar
// (below it when there is no room), and never inside the engraving's own element, so its clicks are not pin gestures. The pure part is bar-selection-core.ts; what an action DOES is the caller's (`onAction`).
//
//   <div class="forge-bar-selection" role="toolbar" aria-labelledby=(hidden name: Selected bars)>
//     <span class="forge-bar-selection-count" aria-live="polite">3 bars selected: bars 3 to 5</span>
//     <button class="forge-bar-selection-action" data-action="new-phrase" aria-description="...">New phrase from these bars</button> ... (Copy, Delete, Move left, Move right)
//     <button class="forge-bar-selection-clear" aria-labelledby=(hidden name: Clear the selection) aria-description="Clear the selection (Esc)">×</button>
//     <div class="forge-bar-selection-note" role="status">…</div>            (only when there is something to say: a refusal, "the sentence is in the prompt box")
//   </div>
import { SELECTION_MENU, type SelectionAction } from './bar-selection-core.ts';
import { setSrLabel } from './sr-label-core.ts';

export const SELECTION_MENU_CLASS = 'forge-bar-selection';
export interface SelectionMenuPorts { onAction(action: SelectionAction): void; onClear(): void }
export interface SelectionMenuView {
  /** The count line. */
  text: string;
  /** A line of its own under the entries (a refusal, "the sentence is in the prompt box"): absent or null = none. */
  note?: string | null;
  /** Per action: why it cannot be done now (the entry is greyed and says so in its tooltip), or null = it can. */
  disabled: Record<SelectionAction, string | null>;
  /** The selected bars' box in the menu's host coordinates; absent = pinned at the host's top left. */
  anchor?: { left: number; top: number; right: number; bottom: number };
}
export interface SelectionMenuHandle {
  readonly el: HTMLElement;
  show(view: SelectionMenuView): void;
  hide(): void;
  visible(): boolean;
  dispose(): void;
}

export function mountSelectionMenu(host: HTMLElement, ports: SelectionMenuPorts): SelectionMenuHandle {
  const doc = host.ownerDocument;
  const el = doc.createElement('div');
  el.className = SELECTION_MENU_CLASS;
  el.setAttribute('role', 'toolbar'); setSrLabel(el, 'Selected bars');
  el.style.display = 'none';
  const count = doc.createElement('span');
  count.className = 'forge-bar-selection-count'; count.setAttribute('aria-live', 'polite');
  el.appendChild(count);
  const buttons = new Map<SelectionAction, HTMLButtonElement>();
  for (const m of SELECTION_MENU) {
    const b = doc.createElement('button');
    b.type = 'button'; b.className = 'forge-bar-selection-action'; b.setAttribute('data-action', m.id); b.textContent = m.label; b.setAttribute('aria-description', m.title);
    b.addEventListener('click', (e) => { e.stopPropagation(); if (!b.disabled) ports.onAction(m.id); });
    buttons.set(m.id, b); el.appendChild(b);
  }
  const clear = doc.createElement('button');
  clear.type = 'button'; clear.className = 'forge-bar-selection-clear'; clear.textContent = '×'; setSrLabel(clear, 'Clear the selection'); clear.setAttribute('aria-description', 'Clear the selection (Esc)');
  clear.addEventListener('click', (e) => { e.stopPropagation(); ports.onClear(); });
  el.appendChild(clear);
  const noteEl = doc.createElement('div');
  noteEl.className = 'forge-bar-selection-note'; noteEl.setAttribute('role', 'status'); noteEl.style.display = 'none';
  el.appendChild(noteEl);
  // a press on the menu is not the start of a drag across bars, a click on it is not a click on the Score
  for (const type of ['mousedown', 'mouseup', 'click']) el.addEventListener(type, (e) => { e.stopPropagation(); });
  host.appendChild(el);
  let shown = false;
  const place = (anchor: SelectionMenuView['anchor']): void => {
    const w = el.offsetWidth || 0, h = el.offsetHeight || 0;
    const hostW = host.clientWidth || 0;
    const left = anchor ? Math.max(0, hostW > 0 && w > 0 ? Math.min(anchor.left, hostW - w) : anchor.left) : 0;
    const above = anchor ? anchor.top - h - 6 : 0;
    const top = anchor ? (above >= 0 ? above : anchor.bottom + 6) : 0;
    el.style.left = `${Math.round(left)}px`; el.style.top = `${Math.round(top)}px`;
  };
  return {
    el,
    show(view) {
      count.textContent = view.text;
      noteEl.textContent = view.note ?? ''; noteEl.style.display = view.note ? '' : 'none';
      for (const [id, b] of buttons) {
        const why = view.disabled[id];
        b.disabled = why !== null;
        b.setAttribute('aria-description', why ?? SELECTION_MENU.find((m) => m.id === id)!.title);
        b.classList.toggle('is-disabled', why !== null);
      }
      el.style.display = ''; shown = true;
      place(view.anchor);
    },
    hide() { el.style.display = 'none'; shown = false; },
    visible: () => shown,
    dispose() { el.remove(); shown = false; },
  };
}
