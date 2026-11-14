// 2026-11-13-1214 - the chat-style panel of a score tab (phrase, arrangement, composition): ONE shared mount. The tab's own content (the Score, the strips, the controls, the notebook) goes into a body that scrolls on its own; the
// panel (a DIALOG above, the prompt box below it) is its FLEX SIBLING, never over it. Plain DOM, no obsidian import (a happy-dom test mounts the very code the tab runs). Messages are text only (links `[[bar_007]]` stay plain text).
//
//   <div class="… forge-chat-host forge-chat-dock-bottom|right">                 the tab's content element, now a flex container
//     <div class="forge-chat-body">…everything the tab drew…</div>              scrolls on its own
//     <div class="forge-chat-panel" role="group" aria-label="Description dialog and prompt">
//       <div class="forge-chat-resize" role="separator" tabindex="0">           drag (or ArrowUp / ArrowDown) to resize; the height is remembered
//       <div class="forge-chat-head"><span>Dialog</span><button class="forge-chat-dock">Dock: bottom</button></div>
//       <div class="forge-chat-current">Current: <the Description></div>        pinned, not part of the history
//       <div class="forge-chat-log" role="log" aria-live="polite">…<div class="forge-chat-msg is-<kind>">…</div></div>
//       <div class="forge-prompt-box">…</div>                                    the existing box (prompt-box-dom.ts), unchanged
//     </div>
//   </div>
import { DESCRIPTION_BAR_CLASS } from './description-bar-dom.ts';
import { mountPromptBox, type PromptBoxHandle, type PromptBoxPorts } from './prompt-box-dom.ts';
import { DIALOG_HEIGHT_MAX, DIALOG_HEIGHT_MIN, clampHeight, type DialogDock, type DialogEntry, type DialogStore } from './dialog-core.ts';

export const CHAT_HOST_CLASS = 'forge-chat-host';
export interface ChatPanelPorts {
  box: PromptBoxPorts;
  store: DialogStore;
  /** A button inside a suggestion message was pressed. */
  choose(entryId: number, choice: 'apply' | 'cancel'): void;
  now?: () => Date;
}
export interface ChatPanelHandle {
  readonly el: HTMLElement;
  readonly box: PromptBoxHandle;
  /** Draw the history (newest at the bottom, scrolled to) and the pinned "Current:" line. */
  render(entries: readonly DialogEntry[], current: string): void;
  /** Is the panel still where it was mounted (a tab that emptied its content took it away)? */
  attached(): boolean;
  dock(): DialogDock;
  dispose(): void;
}

const LABEL: Record<DialogEntry['kind'], string> = { you: 'You', applied: 'Forge', rejected: 'Forge', asking: 'Forge', suggestion: 'Forge', refused: 'Forge', dropped: 'Forge', control: 'Controls', notice: 'Forge', failed: 'Forge' };
const CHOSEN = { applied: 'Applied.', cancelled: 'Cancelled.', expired: 'No longer current.' } as const;

export function mountChatPanel(host: HTMLElement, ports: ChatPanelPorts, initial: string): ChatPanelHandle {
  const doc = host.ownerDocument;
  const body = doc.createElement('div'); body.className = 'forge-chat-body';
  while (host.firstChild) body.appendChild(host.firstChild);                      // everything the tab drew goes into the body that scrolls
  const panel = doc.createElement('div'); panel.className = 'forge-chat-panel'; panel.setAttribute('role', 'group'); panel.setAttribute('aria-label', 'Description dialog and prompt');
  const resize = doc.createElement('div'); resize.className = 'forge-chat-resize'; resize.setAttribute('role', 'separator'); resize.setAttribute('aria-orientation', 'horizontal'); resize.setAttribute('tabindex', '0'); resize.setAttribute('aria-label', 'Resize the dialog (drag, or Arrow Up and Arrow Down)'); resize.title = 'Drag to resize the dialog';
  const head = doc.createElement('div'); head.className = 'forge-chat-head';
  const title = doc.createElement('span'); title.className = 'forge-chat-title'; title.textContent = 'Dialog';
  const dockBtn = doc.createElement('button'); dockBtn.type = 'button'; dockBtn.className = 'forge-chat-dock';
  const current = doc.createElement('div'); current.className = 'forge-chat-current';
  const log = doc.createElement('div'); log.className = 'forge-chat-log'; log.setAttribute('role', 'log'); log.setAttribute('aria-live', 'polite'); log.setAttribute('aria-label', 'What happened to this Description');
  head.append(title, dockBtn);
  panel.append(resize, head, current, log);
  host.append(body, panel);
  host.classList.add(CHAT_HOST_CLASS);

  let dock: DialogDock = ports.store.dock();
  let disposed = false;
  const paintDock = (): void => {
    host.classList.toggle('forge-chat-dock-bottom', dock === 'bottom'); host.classList.toggle('forge-chat-dock-right', dock === 'right');
    dockBtn.textContent = `Dock: ${dock}`;
    dockBtn.title = dock === 'bottom' ? 'Dock the dialog and the input on the right (the Score on the left)' : 'Dock the dialog and the input at the bottom (under the Score)';
    dockBtn.setAttribute('aria-label', `Dock the dialog: now ${dock}; press to move it ${dock === 'bottom' ? 'right' : 'bottom'}`);
    if (dock === 'bottom') log.style.height = `${ports.store.height()}px`; else log.style.removeProperty('height');
    resize.style.display = dock === 'bottom' ? '' : 'none';
  };
  dockBtn.addEventListener('click', () => { dock = dock === 'bottom' ? 'right' : 'bottom'; ports.store.setDock(dock); paintDock(); });
  paintDock();

  // ---- resize: a drag on the top edge (pointer events), or the arrow keys; the height is remembered
  const setHeight = (px: number, remember: boolean): void => { const h = clampHeight(px); log.style.height = `${h}px`; if (remember) ports.store.setHeight(h); };
  let drag: { y: number; h: number } | null = null;
  const heightNow = (): number => { const n = parseFloat(log.style.height); return Number.isFinite(n) ? n : ports.store.height(); };
  resize.addEventListener('pointerdown', (e) => { drag = { y: (e as PointerEvent).clientY, h: heightNow() }; try { (resize as any).setPointerCapture?.((e as PointerEvent).pointerId); } catch { /* not capturable */ } e.preventDefault(); });
  resize.addEventListener('pointermove', (e) => { if (drag) setHeight(drag.h + (drag.y - (e as PointerEvent).clientY), false); });
  const endDrag = (): void => { if (drag) { drag = null; ports.store.setHeight(heightNow()); } };
  resize.addEventListener('pointerup', endDrag); resize.addEventListener('pointercancel', endDrag);
  resize.addEventListener('keydown', (e) => {
    const k = (e as KeyboardEvent).key; if (k !== 'ArrowUp' && k !== 'ArrowDown') return;
    e.preventDefault(); setHeight(heightNow() + (k === 'ArrowUp' ? 24 : -24), true);
  });

  const stamp = (at: number): string => { const d = new Date(at); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const render = (entries: readonly DialogEntry[], cur: string): void => {
    if (disposed) return;
    current.textContent = cur === '' ? '' : `Current: ${cur}`; current.title = cur;
    const atEnd = log.scrollHeight - log.scrollTop - (log.clientHeight || 0) < 40 || log.childElementCount === 0;
    while (log.firstChild) log.removeChild(log.firstChild);
    for (const e of entries) {
      const m = doc.createElement('div'); m.className = `forge-chat-msg is-${e.kind}${e.kind === 'you' ? ' is-you' : ' is-forge'}`; m.setAttribute('data-id', String(e.id)); m.setAttribute('data-kind', e.kind);
      const meta = doc.createElement('div'); meta.className = 'forge-chat-meta';
      const who = doc.createElement('span'); who.className = 'forge-chat-who'; who.textContent = LABEL[e.kind];
      const when = doc.createElement('span'); when.className = 'forge-chat-time'; when.textContent = stamp(e.at);
      meta.append(who, when);
      const text = doc.createElement('div'); text.className = 'forge-chat-text'; text.textContent = e.text;
      m.append(meta, text);
      if (e.suggestion) {
        const s = e.suggestion;
        const d = doc.createElement('pre'); d.className = 'forge-chat-suggestion-description'; d.textContent = s.description;
        const r = doc.createElement('pre'); r.className = 'forge-chat-suggestion-recipe'; r.textContent = s.recipe;
        const row = doc.createElement('div'); row.className = 'forge-chat-actions';
        for (const [choice, label] of [['apply', 'Apply'], ['cancel', 'Cancel']] as const) {
          const b = doc.createElement('button'); b.type = 'button'; b.className = 'forge-chat-action'; b.setAttribute('data-choice', choice); b.textContent = label; b.disabled = s.state !== 'open';
          b.addEventListener('click', () => { if (!b.disabled) { b.disabled = true; ports.choose(e.id, choice); } });
          row.appendChild(b);
        }
        if (s.state !== 'open') { const said = doc.createElement('span'); said.className = 'forge-chat-chosen'; said.textContent = CHOSEN[s.state]; row.appendChild(said); }
        m.append(d, r, row);
      }
      log.appendChild(m);
    }
    if (atEnd) log.scrollTop = log.scrollHeight;
  };

  const box = mountPromptBox(panel, ports.box, initial);                          // the input: the LAST thing in the panel (its own observer keeps it last)

  // anything the tab appends to its content element after this (a strip for a note's new kind, a rebuilt notebook) goes into the BODY, in its place (before the body = first), never beside or under the panel
  const Observer = (doc.defaultView as unknown as { MutationObserver?: typeof MutationObserver } | null)?.MutationObserver;
  const watch = Observer ? new Observer(() => {
    if (disposed) return;
    for (const n of Array.from(host.childNodes)) {
      if (n === body || n === panel) continue;
      const kids = Array.from(host.childNodes);
      if (kids.indexOf(n as ChildNode) < kids.indexOf(body)) {                                  // put at the FRONT of the content: the description banner goes first; anything else goes after the banner (the same rule as scoreSlot: the Score is under it)
        const banner = (n as HTMLElement).classList?.contains(DESCRIPTION_BAR_CLASS);
        body.insertBefore(n, banner ? body.firstChild : Array.from(body.children).find((c) => !c.classList.contains(DESCRIPTION_BAR_CLASS)) ?? null);
      } else body.appendChild(n);
    }
    if (host.lastChild !== panel && host.contains(panel)) host.appendChild(panel);
  }) : null;
  watch?.observe(host, { childList: true });

  return {
    el: panel, box,
    render,
    attached: () => !disposed && panel.parentElement === host && body.parentElement === host,
    dock: () => dock,
    dispose() {
      if (disposed) return;
      disposed = true; watch?.disconnect(); box.dispose();
      if (body.parentElement === host) while (body.firstChild) host.insertBefore(body.firstChild, body);                // the tab's content goes back where it was
      body.remove(); panel.remove();
      host.classList.remove(CHAT_HOST_CLASS, 'forge-chat-dock-bottom', 'forge-chat-dock-right');
    },
  };
}
export const CHAT_LIMITS = { min: DIALOG_HEIGHT_MIN, max: DIALOG_HEIGHT_MAX };
