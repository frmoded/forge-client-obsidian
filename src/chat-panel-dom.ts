// 2026-11-13-1214 - the chat-style panel of a score tab (phrase, arrangement, composition): ONE shared mount. The tab's own content (the Score, the strips, the controls, the notebook) goes into a body that scrolls on its own; the
// panel (a DIALOG above, the prompt box below it) is its FLEX SIBLING, never over it. Plain DOM, no obsidian import (a happy-dom test mounts the very code the tab runs). Messages are text only (links `[[bar_007]]` stay plain text).
//
// 2026-11-17-2001: the chat-style composer. The dialog above is collapsed while empty (a fresh note shows only the Score and the card); there is no dock button, no resize bar and no "Current:" line any more.
//
//   <div class="… forge-chat-host forge-chat-dock-bottom|right">                 the tab's content element, now a flex container (the right dock is a setting only)
//     <div class="forge-chat-body">…everything the tab drew…</div>              scrolls on its own
//     <div class="forge-chat-panel" role="group" aria-label="Composer and dialog">
//       <div class="forge-chat-log [is-empty]" role="log" aria-live="polite">…<div class="forge-chat-msg is-you|is-forge">…</div></div>     your sentence: a soft right-aligned bubble; the reply: plain text on the left
//       <div class="forge-prompt-box forge-composer">…</div>                     the card (prompt-box-dom.ts)
//       <div class="forge-composer-error">…</div>                                one muted line
//     </div>
//   </div>
import { DESCRIPTION_BAR_CLASS } from './description-bar-dom.ts';
import { mountPromptBox, type PromptBoxHandle, type PromptBoxPorts } from './prompt-box-dom.ts';
import { type DialogDock, type DialogEntry, type DialogStore } from './dialog-core.ts';
import { PREVIEW_HINT } from './composer-core.ts';

export const CHAT_HOST_CLASS = 'forge-chat-host';
const CHOSEN = { applied: 'Applied.', cancelled: 'Discarded.', expired: 'No longer current.' } as const;

export interface ChatPanelPorts {
  box: PromptBoxPorts;
  store: DialogStore;
  now?: () => Date;
}
export interface ChatPanelHandle {
  readonly el: HTMLElement;
  readonly box: PromptBoxHandle;
  /** Draw the history (newest at the bottom, scrolled to). The dialog is collapsed (no height at all) while it is empty. */
  render(entries: readonly DialogEntry[], current: string): void;
  /** Is the panel still where it was mounted (a tab that emptied its content took it away)? */
  attached(): boolean;
  dock(): DialogDock;
  dispose(): void;
}

const LABEL: Record<DialogEntry['kind'], string> = { you: 'You', applied: 'Forge', rejected: 'Forge', asking: 'Forge', suggestion: 'Forge', refused: 'Forge', dropped: 'Forge', control: 'Controls', notice: 'Forge', failed: 'Forge' };

export function mountChatPanel(host: HTMLElement, ports: ChatPanelPorts, initial: string): ChatPanelHandle {
  const doc = host.ownerDocument;
  const body = doc.createElement('div'); body.className = 'forge-chat-body';
  while (host.firstChild) body.appendChild(host.firstChild);                      // everything the tab drew goes into the body that scrolls
  const panel = doc.createElement('div'); panel.className = 'forge-chat-panel'; panel.setAttribute('role', 'group'); panel.setAttribute('aria-label', 'Composer and dialog');
  const log = doc.createElement('div'); log.className = 'forge-chat-log is-empty'; log.setAttribute('role', 'log'); log.setAttribute('aria-live', 'polite'); log.setAttribute('aria-label', 'What happened to this Description');
  panel.append(log);
  host.append(body, panel);
  host.classList.add(CHAT_HOST_CLASS);

  // 2026-11-17-2001: no dock button and no resize bar any more; the right-hand layout is the setting `dialogDock` (read when the tab mounts), the bottom is the default.
  const dock: DialogDock = ports.store.dock();
  host.classList.add(dock === 'right' ? 'forge-chat-dock-right' : 'forge-chat-dock-bottom');
  let disposed = false;

  const stamp = (at: number): string => { const d = new Date(at); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const render = (entries: readonly DialogEntry[], _cur: string): void => {
    if (disposed) return;
    const atEnd = log.scrollHeight - log.scrollTop - (log.clientHeight || 0) < 40 || log.childElementCount === 0;
    while (log.firstChild) log.removeChild(log.firstChild);
    log.classList.toggle('is-empty', entries.length === 0);
    for (const e of entries) {
      const m = doc.createElement('div'); m.className = `forge-chat-msg is-${e.kind}${e.kind === 'you' ? ' is-you' : ' is-forge'}`; m.setAttribute('data-id', String(e.id)); m.setAttribute('data-kind', e.kind);
      const meta = doc.createElement('div'); meta.className = 'forge-chat-meta';
      const who = doc.createElement('span'); who.className = 'forge-chat-who'; who.textContent = LABEL[e.kind];
      const when = doc.createElement('span'); when.className = 'forge-chat-time'; when.textContent = stamp(e.at);
      meta.append(who, when);
      const text = doc.createElement('div'); text.className = 'forge-chat-text';
      if (e.kind === 'applied') { const check = doc.createElement('span'); check.className = 'forge-chat-check'; check.setAttribute('aria-hidden', 'true'); check.textContent = '✓'; text.append(check, doc.createTextNode(` ${e.text}`)); }
      else text.textContent = e.text;
      m.append(meta, text);
      if (e.suggestion) {
        const s = e.suggestion;
        const d = doc.createElement('div'); d.className = 'forge-chat-suggestion-description'; d.textContent = s.description;
        m.append(d);
        if (s.recipe !== '') { const r = doc.createElement('pre'); r.className = 'forge-chat-suggestion-recipe'; r.textContent = s.recipe; m.append(r); }
        const status = doc.createElement('div'); status.className = 'forge-chat-chosen';
        status.textContent = s.state === 'open' ? PREVIEW_HINT : CHOSEN[s.state];
        m.append(status);
      }
      log.appendChild(m);
    }
    if (atEnd) log.scrollTop = log.scrollHeight;
  };

  const box = mountPromptBox(panel, ports.box, initial);                          // the card: the LAST thing in the panel (its own observer keeps it last)

  // Cmd/Ctrl+K from anywhere in the tab (the Score, the strips) focuses the composer
  const onKey = (e: Event): void => {
    const k = e as KeyboardEvent;
    if ((k.metaKey || k.ctrlKey) && !k.shiftKey && !k.altKey && k.key.toLowerCase() === 'k') { e.preventDefault(); e.stopPropagation(); box.focus(); }
  };
  host.addEventListener('keydown', onKey);

  // anything the tab appends to its content element after this (a strip for a note's new kind, a rebuilt notebook) goes into the BODY, in its place (before the body = first), never beside or under the panel
  const Observer = (doc.defaultView as unknown as { MutationObserver?: typeof MutationObserver } | null)?.MutationObserver;
  const watch = Observer ? new Observer(() => {
    if (disposed) return;
    for (const n of Array.from(host.childNodes)) {
      if (n === body || n === panel) continue;
      const kids = Array.from(host.childNodes);
      if (kids.indexOf(n as ChildNode) < kids.indexOf(body)) {                                  // put at the FRONT of the content: the description banner goes first; anything else goes after the banner
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
      disposed = true; watch?.disconnect(); host.removeEventListener('keydown', onKey); box.dispose();
      if (body.parentElement === host) while (body.firstChild) host.insertBefore(body.firstChild, body);                // the tab's content goes back where it was
      body.remove(); panel.remove();
      host.classList.remove(CHAT_HOST_CLASS, 'forge-chat-dock-bottom', 'forge-chat-dock-right');
    },
  };
}
