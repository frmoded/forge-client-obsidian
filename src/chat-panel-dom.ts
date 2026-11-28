// 2026-11-13-1214 - the chat-style panel of a score tab (phrase, arrangement, composition): ONE shared mount. The tab's own content (the Score, the strips, the controls, the notebook) goes into a body that scrolls on its own; the
// panel (a DIALOG above, the prompt box below it) is its FLEX SIBLING, never over it. Plain DOM, no obsidian import (a happy-dom test mounts the very code the tab runs). Messages are text only (links `[[bar_007]]` stay plain text), except an entry that names the notes it made (`links`, 2026-11-19-0992): its `[[name]]`s are quiet link buttons.
//
// 2026-11-17-2001: the chat-style composer. The dialog above is collapsed while empty (a fresh note shows only the Score and the card); there is no dock button, no resize bar and no "Current:" line any more.
//
// 2026-11-18 (R1): the layout follows the TAB's width (chat-layout-core.ts): from 900 px up the host is TWO COLUMNS (`forge-chat-wide`: the dialog and the card on the LEFT, the Score on the RIGHT, each scrolling on its own),
// narrower it is the stacked layout (the Score above, the dialog and the card below). The old bottom | right position switch and its setting are gone. Each entry shows a small muted "minutes ago" (relative-time-core.ts)
// that ONE timer per tab recounts every 30 s (cleared on dispose); the refusal lines are plain text with a neutral "!" glyph, never red.
//
//   <div class="… forge-chat-host forge-chat-wide|forge-chat-stacked">           the tab's content element, a flex container
//     <div class="forge-chat-body">…everything the tab drew…</div>              scrolls on its own
//     <div class="forge-chat-panel" role="group" aria-labelledby=(hidden name: Composer and dialog)>
//       <div class="forge-chat-log [is-empty]" role="log" aria-live="polite">…<div class="forge-chat-msg is-you|is-forge"><div class="forge-chat-line">[<span class="forge-chat-bang">!</span>]<div class="forge-chat-text">…</div></div>…<div class="forge-chat-meta"><span class="forge-chat-time">7 minutes ago</span></div></div></div>     your sentence: a soft right-aligned gray bubble; the reply: plain text on the left
//       <div class="forge-prompt-box forge-composer">…</div>                     the card (prompt-box-dom.ts)
//       <div class="forge-composer-error">…</div>                                one muted line
//     </div>
//   </div>
import { setSrLabel } from './sr-label-core.ts';
import { DESCRIPTION_BAR_CLASS } from './description-bar-dom.ts';
import { mountPromptBox, type PromptBoxHandle, type PromptBoxPorts } from './prompt-box-dom.ts';
import { type DialogEntry, type DialogStore } from './dialog-core.ts';
import { PREVIEW_HINT } from './composer-core.ts';
import { CHAT_WIDE_CLASS, layoutFor, type ChatLayout } from './chat-layout-core.ts';
import { TICK_MS, relativeTime } from './relative-time-core.ts';
import { mountDivider } from './chat-divider-dom.ts';

export const CHAT_HOST_CLASS = 'forge-chat-host';
const CHOSEN = { applied: 'Applied.', cancelled: 'Discarded.', expired: 'No longer current.' } as const;

export interface ChatPanelPorts {
  box: PromptBoxPorts;
  store: DialogStore;
  /** The clock of the "minutes ago" labels (ms since the epoch; default `Date.now`). */
  now?: () => number;
  /** The ONE recount timer of this tab (default `window.setTimeout` / `clearTimeout`); tests pass the host clock's. */
  setTimer?(fn: () => void, ms: number): unknown;
  clearTimer?(handle: unknown): void;
  /** 2026-11-19-0992: open a note named by a link in the dialog (a copy that was just made): the plugin's own opener, by lineage id (`bars/bar_010`). Absent = the words are drawn and there are no buttons that would do nothing. */
  openNote?(id: string): void;
  /** 2026-11-23-1018 (Part C): write a link into the composer at the caret. Present only for a music list note. With it, a click on a link of the dialog while the composer HAD FOCUS AND HOLDS TEXT (at the mouse-down: the click itself takes the focus away) writes `[[name]]` into the composer, keeps the focus there and opens nothing; with an empty composer, or the focus elsewhere, the click opens the note as ever. */
  insertLink?(name: string): void;
}
export interface ChatPanelHandle {
  readonly el: HTMLElement;
  readonly box: PromptBoxHandle;
  /** Draw the history (newest at the bottom, scrolled to). The dialog is collapsed (no height at all) while it is empty. */
  render(entries: readonly DialogEntry[], current: string): void;
  /** Is the panel still where it was mounted (a tab that emptied its content took it away)? */
  attached(): boolean;
  /** 'wide' = two columns (the tab is 900 px or wider), 'narrow' = stacked. Follows the tab's width live (no reload). */
  layout(): ChatLayout;
  /** Recount every "minutes ago" label now (the timer does it every 30 s). */
  refreshTimes(): void;
  dispose(): void;
}

/** The lines that are errors: they get a small neutral "!" (muted colour) in front of their wording; no red anywhere in the dialog (src/no-red-music-tabs.test.ts). */
const NEUTRAL_ERROR_KINDS: ReadonlySet<DialogEntry['kind']> = new Set(['rejected', 'refused', 'failed']);
const LABEL: Record<DialogEntry['kind'], string> = { you: 'You', applied: 'Forge', rejected: 'Forge', asking: 'Forge', suggestion: 'Forge', refused: 'Forge', dropped: 'Forge', control: 'Controls', notice: 'Forge', failed: 'Forge' };

export function mountChatPanel(host: HTMLElement, ports: ChatPanelPorts, initial: string): ChatPanelHandle {
  const doc = host.ownerDocument;
  const body = doc.createElement('div'); body.className = 'forge-chat-body';
  while (host.firstChild) body.appendChild(host.firstChild);                      // everything the tab drew goes into the body that scrolls
  const panel = doc.createElement('div'); panel.className = 'forge-chat-panel'; panel.setAttribute('role', 'group'); setSrLabel(panel, 'Composer and dialog');
  const log = doc.createElement('div'); log.className = 'forge-chat-log is-empty'; log.setAttribute('role', 'log'); log.setAttribute('aria-live', 'polite'); setSrLabel(log, 'What happened to this Description', { host: panel, key: 'log' });   // the name sits in the panel, not in the log: the log is redrawn and its children are the entries
  // 2026-11-24-1039: ONE `Copy` for the whole dialog (the driver could not select the grammar's long refusal to paste it): the dialog's lines, in order, and the line under the card when the dialog holds only a cut of it. Hidden while the dialog is empty.
  const copy = doc.createElement('button'); copy.type = 'button'; copy.className = 'forge-chat-copy'; copy.textContent = 'Copy'; copy.hidden = true;
  panel.append(log, copy);
  host.append(body, panel);
  host.classList.add(CHAT_HOST_CLASS);

  let disposed = false;
  const nowMs = (): number => (ports.now ? ports.now() : Date.now());

  // ---- the layout follows the TAB's width: two columns from 900 px, stacked below; no reload, no setting ---------------------------------------------------------------------------------------------------
  let layout: ChatLayout = 'narrow';
  const divider = mountDivider(host, panel, ports.store);                          // 2026-11-18 (0935): the draggable divider: a handle and a variable in the wide layout only
  const setLayout = (width: number): void => {
    layout = layoutFor(width);
    host.classList.toggle(CHAT_WIDE_CLASS, layout === 'wide'); host.classList.toggle('forge-chat-stacked', layout === 'narrow');
    divider.sync(layout === 'wide', width);
  };
  setLayout(host.clientWidth || host.getBoundingClientRect?.().width || 0);
  const Resize = (doc.defaultView as unknown as { ResizeObserver?: typeof ResizeObserver } | null)?.ResizeObserver;
  const layoutWatch = Resize ? new Resize((entries) => { const w = entries[0]?.contentRect.width ?? host.clientWidth; if (!disposed && w > 0) setLayout(w); }) : null;
  layoutWatch?.observe(host);

  // ---- the "minutes ago" labels: ONE timer for the open tab (a chain of 30 s timeouts), never one per entry; it is cleared when the tab closes ---------------------------------------------------------------
  const refreshTimes = (): void => {
    const now = nowMs();
    for (const t of Array.from(log.querySelectorAll('.forge-chat-time'))) {
      const label = relativeTime(Number(t.getAttribute('data-at')), now);
      if (t.textContent !== label) t.textContent = label;
      (t as HTMLElement).hidden = label === '';
    }
  };
  // a host without a window of its own (a test's) must not be kept alive by the recount: `unref` where the timer has one (node), nothing in a browser
  const arm = ports.setTimer ?? ((fn: () => void, ms: number) => { const h = (doc.defaultView as Window).setTimeout(fn, ms); (h as unknown as { unref?: () => void })?.unref?.(); return h; });
  const disarm = ports.clearTimer ?? ((h: unknown) => { (doc.defaultView as Window).clearTimeout(h as number); });
  let timer: unknown = null;
  const tick = (): void => { timer = null; if (disposed) return; refreshTimes(); timer = arm(tick, TICK_MS); };
  timer = arm(tick, TICK_MS);
  /** An entry's words as nodes: a name the entry LINKS (`links`, 2026-11-19-0992) is a quiet link button that opens that note; everything else is text, as ever. 2026-11-19-0992a: the stored text is the whole PLAIN sentence ("Created bar_010, a copy of bar_007.")
   *  and each name is drawn as a button WITH its name as its text node, so the line reads (and copies, with the stylesheet's `user-select: text`) as exactly that sentence; an entry saved by 0992 says "[[bar_010]]" and still draws its buttons as it did. */
  const pieces = (e: DialogEntry): Node[] => {
    const opener = ports.openNote;
    if (!e.links || e.links.length === 0 || opener === undefined) return [doc.createTextNode(e.text)];
    const byName = new Map(e.links.map((l) => [l.name, l.id]));
    const alt = [...byName.keys()].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const out: Node[] = [];
    for (const part of e.text.split(new RegExp(`(\\[\\[(?:${alt})\\]\\]|(?<![A-Za-z0-9_])(?:${alt})(?![A-Za-z0-9_]))`))) {
      const id = byName.get(part.replace(/^\[\[|\]\]$/g, ''));
      if (id === undefined || part === '') { if (part !== '') out.push(doc.createTextNode(part)); continue; }
      const b = doc.createElement('button'); b.type = 'button'; b.className = 'forge-chat-link'; b.setAttribute('data-note', id); b.textContent = part;
      let typing = false;                                                                                       // 2026-11-23-1018: was the composer being typed in when the button went down?
      b.addEventListener('mousedown', () => { const t = panel.querySelector('.forge-prompt-box-text'); typing = ports.insertLink !== undefined && t !== null && doc.activeElement === t && box.state().text.trim() !== ''; });
      b.addEventListener('click', () => {
        if (typing && ports.insertLink !== undefined) { typing = false; try { ports.insertLink(part.replace(/^\[\[|\]\]$/g, '')); box.focus(); } catch (err) { console.error('[forge-chat] could not write a link into the composer', err); } return; }
        typing = false;
        try { opener(id); } catch (err) { console.error('[forge-chat] could not open a note from the dialog', err); }
      });
      out.push(b);
    }
    return out;
  };
  let shown: readonly DialogEntry[] = [], copyTimer: unknown = null;
  const said = (t: string): void => { if (disposed) return; copy.textContent = t; if (copyTimer !== null) disarm(copyTimer); copyTimer = arm(() => { copyTimer = null; if (!disposed) copy.textContent = 'Copy'; }, 2000); };
  copy.addEventListener('click', () => {
    const under = (panel.querySelector('.forge-composer-error')?.textContent ?? '').trim();
    const lines = shown.flatMap((e) => [`${LABEL[e.kind]}: ${e.text}`, ...(e.suggestion ? [...(e.suggestion.bars ? [e.suggestion.bars] : []), e.suggestion.description, ...(e.suggestion.recipe === '' ? [] : [e.suggestion.recipe])] : [])]);
    if (under !== '' && !shown.some((e) => e.text === under || (e.text.endsWith('…') && under.startsWith(e.text.slice(0, -1))))) lines.push(`Under the box: ${under}`);
    const clip = (doc.defaultView as unknown as { navigator?: { clipboard?: { writeText?(t: string): Promise<void> } } } | null)?.navigator?.clipboard;
    if (clip?.writeText === undefined) { said('Could not copy'); return; }
    void clip.writeText(lines.join('\n')).then(() => said('Copied'), () => said('Could not copy'));
  });
  let drawnNewest = -1;                                                                                         // 2026-11-19-0992b: the id of the newest entry the last draw showed
  const render = (entries: readonly DialogEntry[], _cur: string): void => {
    if (disposed) return;
    const atEnd = log.scrollHeight - log.scrollTop - (log.clientHeight || 0) < 40 || log.childElementCount === 0;
    while (log.firstChild) log.removeChild(log.firstChild);
    log.classList.toggle('is-empty', entries.length === 0);
    shown = entries; copy.hidden = entries.length === 0;
    for (const e of entries) {
      const m = doc.createElement('div'); m.className = `forge-chat-msg is-${e.kind}${e.kind === 'you' ? ' is-you' : ' is-forge'}`; m.setAttribute('data-id', String(e.id)); m.setAttribute('data-kind', e.kind);
      const meta = doc.createElement('div'); meta.className = 'forge-chat-meta';
      const who = doc.createElement('span'); who.className = 'forge-chat-who'; who.textContent = LABEL[e.kind];
      const label = relativeTime(e.at, nowMs());
      const when = doc.createElement('span'); when.className = 'forge-chat-time'; when.setAttribute('data-at', String(e.at)); when.setAttribute('aria-live', 'off'); when.textContent = label; when.hidden = label === '';           // an old entry without a time: no counter
      meta.append(who, when);
      const line = doc.createElement('div'); line.className = 'forge-chat-line';
      if (NEUTRAL_ERROR_KINDS.has(e.kind)) { const bang = doc.createElement('span'); bang.className = 'forge-chat-bang'; bang.setAttribute('aria-hidden', 'true'); bang.textContent = '!'; line.append(bang); }     // an error is told by its wording and a small muted "!", never by colour
      const text = doc.createElement('div'); text.className = 'forge-chat-text';
      if (e.kind === 'applied') { const check = doc.createElement('span'); check.className = 'forge-chat-check'; check.setAttribute('aria-hidden', 'true'); check.textContent = '✓'; text.append(check, doc.createTextNode(' '), ...pieces(e)); }
      else text.textContent = e.text;
      line.append(text);
      m.append(line);
      if (e.suggestion) {
        const s = e.suggestion;
        if (s.bars !== undefined) m.append(Object.assign(doc.createElement('div'), { className: 'forge-chat-suggestion-bars', textContent: s.bars }));          // 2026-11-27-1050: the bar order, above the lines
        const d = doc.createElement('div'); d.className = 'forge-chat-suggestion-description'; d.textContent = s.description;
        m.append(d);
        if (s.recipe !== '') { const r = doc.createElement('pre'); r.className = 'forge-chat-suggestion-recipe'; r.textContent = s.recipe; m.append(r); }
        const status = doc.createElement('div'); status.className = 'forge-chat-chosen';
        status.textContent = s.state === 'open' ? PREVIEW_HINT : CHOSEN[s.state];
        m.append(status);
        if (s.repair === true && s.state === 'open') m.append(Object.assign(doc.createElement('button'), { type: 'button', className: 'forge-chat-link forge-chat-repair', textContent: 'Use this', onclick: () => { box.submit(); } }));          // 2026-11-20-1002: a "did you mean": the button does what Enter does (the sentence is applied only when the person says so)
      }
      m.append(meta);
      log.appendChild(m);
    }
    const newest = entries.length === 0 ? -1 : entries[entries.length - 1]!.id;
    if (atEnd || newest !== drawnNewest) log.scrollTop = log.scrollHeight;                                   // 2026-11-19-0992b: a NEW line is always scrolled into view (it used to stay below the fold when the log was not at its end); a redraw with nothing new keeps the place
    drawnNewest = newest;
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
    // 2026-11-19-0992c (P1: a bar's Beat Box tab showed the composer and NOTHING else): a tab that REBUILDS its content does `contentEl.empty()` (RhythmEditView.mount: when it opens, and again when it is asked to build a second time). With the panel already mounted
    // that took the BODY and the PANEL out of the host, and everything the tab then drew (the Score, the Beat Box iframe) was moved by the loop below into the DETACHED body: the tab showed nothing, and the controller's next sync mounted a fresh, empty panel.
    // So: when the body or the panel is no longer in the host, the tab has emptied its content. What the body still holds is the OLD render (the tab tore it down before it emptied: its iframe's blob is revoked, its Score disposed): it is dropped, the (now
    // empty) body and the panel, with the composer's text and history, go back into the host, and the loop below adopts what the tab drew after the empty.
    if (body.parentElement !== host || panel.parentElement !== host) {
      while (body.firstChild) body.removeChild(body.firstChild);
      host.insertBefore(body, host.firstChild);
      host.appendChild(panel);
    }
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
    layout: () => layout,
    refreshTimes,
    dispose() {
      if (disposed) return;
      disposed = true; if (timer !== null) disarm(timer); timer = null; if (copyTimer !== null) disarm(copyTimer); copyTimer = null; layoutWatch?.disconnect(); divider.dispose(); watch?.disconnect(); host.removeEventListener('keydown', onKey); box.dispose();
      if (body.parentElement === host) while (body.firstChild) host.insertBefore(body.firstChild, body);                // the tab's content goes back where it was
      body.remove(); panel.remove();
      host.classList.remove(CHAT_HOST_CLASS, CHAT_WIDE_CLASS, 'forge-chat-stacked');
    },
  };
}
