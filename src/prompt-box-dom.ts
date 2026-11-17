// 2026-11-17-2001 - the music tab's chat-style composer (design doc checklists/music_tabs_chat_ui_design.md sections 3 and 7). Plain DOM, no obsidian import (a happy-dom test mounts the very code the tab runs). It replaces
// the docked prompt box of 2026-11-12-1203 (same file, same handle surface: the controller's calls did not change) - a soft rounded card: the text area on top (it grows), a quiet "+" at the bottom left (the New actions
// and "Insert a link to a note"), a muted return glyph at the bottom right that is the Enter hint AND a button. NO Apply button. The submit state machine is composer-core.ts:
//   Enter = a PREVIEW (the reply shows in the dialog above: "Press Enter to apply, Esc to discard"), a second Enter applies, Esc discards or cancels, typing replaces the preview, Shift+Enter is a new line, Enter in an
//   IME composition only confirms it, Up in an empty composer recalls the previous sentence (per note), Cmd/Ctrl+K focuses the composer (the tab's own handler: `focusComposer`). Nothing is written before the second Enter.
//
//   <div class="forge-prompt-box forge-composer [is-edited] [is-previewing] [is-busy] [has-conflict]" role="group" aria-label="Composer">
//     <textarea class="forge-prompt-box-text" aria-label="Describe what you want, in a sentence">…</textarea>
//     <div class="forge-composer-bar">
//       <button class="forge-composer-plus" aria-haspopup="menu">+</button><div class="forge-composer-menu" role="menu" hidden>…</div>
//       <span class="forge-prompt-box-state" aria-live="polite">Working... Esc cancels</span>
//       <button class="forge-composer-send" aria-label="Send, Enter">↵</button>
//     </div>
//     <div class="forge-prompt-box-conflict">The controls changed the Description. <button data-choice="keep">Keep my text</button> <button data-choice="use">Use the new one</button></div>
//   </div>
//   <div class="forge-composer-error" role="status">one muted line: an error, said once</div>
import { applied, diskChanged, initBox, isEdited, keepMine, typed, useNew, type BoxState } from './prompt-box-core.ts';
import {
  COMPOSER_LABELS, WORKING_TEXT, announcement, canSubmit, errorLine, initComposer, isWorking, pushHistory, recallNewer, recallOlder, step, upRecalls, type ComposerEffect, type ComposerEvent, type ComposerState, type Proposal,
} from './composer-core.ts';
import { parseSvgMarkup } from './svg-markup-core.ts';

export const PROMPT_BOX_CLASS = 'forge-prompt-box';
export const COMPOSER_ERROR_CLASS = 'forge-composer-error';

/** The answer to "what would this sentence do?": a proposal (nothing written yet) or why not. */
export type PreviewResult = { ok: true; proposal: Proposal } | { ok: false; message: string };
export interface ComposerMenuItem { id: string; label: string }
export interface PromptBoxPorts {
  /** Ask what the sentence would do WITHOUT writing: the grammar first, the sentence service when the grammar cannot read it (the caller's rules, unchanged). */
  preview(text: string): Promise<PreviewResult>;
  /** Write it: the proposal the person saw, for `text`. `ok: false` = it did not go through (the line under the card says why). `ok: true` carries the Description the note says now. */
  apply(text: string, proposal: Proposal): Promise<{ ok: boolean; disk?: string; message?: string }>;
  /** The person pressed Esc while a request ran: drop it (its answer is ignored in any case). */
  cancel?(): void;
  /** Esc on a preview, or typing over it: the proposal is dropped (nothing was written). */
  discard?(): void;
  placeholder: string;
  /** MUSIC_COMPOSER_AUTO_APPLY: a sentence the grammar reads exactly skips the preview. Default off. */
  autoApply?(): boolean;
  /** The "+" menu: the four New actions and "Insert a link to a note" (the tab says what is in it). */
  menu?: { items: readonly ComposerMenuItem[]; run(id: string): void; pickNote?(): Promise<string | null> };
  /** The sentences sent from this note (per note, kept in memory by the controller), oldest first. */
  history?: { get(): readonly string[]; set(next: readonly string[]): void };
}
export interface PromptBoxHandle {
  readonly el: HTMLElement;
  /** The Description on disk is now this (a control wrote it, a hand edit, an apply). Never overwrites unapplied typing: it offers the choice. */
  setDisk(disk: string): void;
  focus(): void;
  /** A request is running for this text (somebody else's: the sentence service asked from a bar): the card says so and Enter waits; `null` = done. */
  setBusy(message: string | null): void;
  /** A plain line under the card (an answer that was dropped, and why). Typing, a new request or a reset clears it. `null` = clear. */
  setNote(message: string | null): void;
  /** Show this text in the field as if it had been typed (a suggestion from elsewhere). Nothing is written. */
  suggest(text: string): void;
  /** The note was updated: the field shows what the note says now and drops the unapplied typing. */
  reset(disk: string): void;
  state(): BoxState;
  composer(): ComposerState;
  dispose(): void;
}

const ICON_RETURN = '<path d="M80 24 L80 54 L26 54" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M42 38 L26 54 L42 70" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>';
const ICON_PLUS = '<line x1="50" y1="24" x2="50" y2="76" stroke="currentColor" stroke-width="6" stroke-linecap="round" fill="none"/><line x1="24" y1="50" x2="76" y2="50" stroke="currentColor" stroke-width="6" stroke-linecap="round" fill="none"/>';
const LINK_ID = '__link__';
const MAX_LINES = 8;

function icon(doc: Document, inner: string): Node {
  const Parser = (doc.defaultView as unknown as { DOMParser?: typeof DOMParser } | null)?.DOMParser ?? DOMParser;
  const nodes = parseSvgMarkup(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="16" height="16" aria-hidden="true" focusable="false">${inner}</svg>`, new Parser());
  return doc.importNode(nodes[0], true);
}

export function mountPromptBox(parent: HTMLElement, ports: PromptBoxPorts, initial: string): PromptBoxHandle {
  const doc = parent.ownerDocument;
  const el = doc.createElement('div');
  el.className = `${PROMPT_BOX_CLASS} forge-composer`;
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', COMPOSER_LABELS.region);
  const text = doc.createElement('textarea');
  text.className = 'forge-prompt-box-text'; text.rows = 1; text.spellcheck = false;
  text.setAttribute('aria-label', COMPOSER_LABELS.field);
  text.placeholder = ports.placeholder;
  const bar = doc.createElement('div'); bar.className = 'forge-composer-bar';
  const plus = doc.createElement('button'); plus.type = 'button'; plus.className = 'forge-composer-plus'; plus.setAttribute('aria-label', COMPOSER_LABELS.plus); plus.setAttribute('title', COMPOSER_LABELS.plus);
  plus.setAttribute('aria-haspopup', 'menu'); plus.setAttribute('aria-expanded', 'false'); plus.appendChild(icon(doc, ICON_PLUS));
  const menu = doc.createElement('div'); menu.className = 'forge-composer-menu'; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', COMPOSER_LABELS.menu); menu.hidden = true;
  const state = doc.createElement('span'); state.className = 'forge-prompt-box-state'; state.setAttribute('aria-live', 'polite');
  const send = doc.createElement('button'); send.type = 'button'; send.className = 'forge-composer-send'; send.setAttribute('aria-label', COMPOSER_LABELS.send); send.setAttribute('title', COMPOSER_LABELS.send); send.appendChild(icon(doc, ICON_RETURN));
  bar.append(plus, menu, state, send);
  const conflict = doc.createElement('div');
  conflict.className = 'forge-prompt-box-conflict'; conflict.setAttribute('role', 'status');
  const msg = doc.createElement('span'); msg.textContent = 'The controls changed the Description while you were typing. ';
  const keep = doc.createElement('button'); keep.type = 'button'; keep.setAttribute('data-choice', 'keep'); keep.textContent = 'Keep my text';
  const use = doc.createElement('button'); use.type = 'button'; use.setAttribute('data-choice', 'use'); use.textContent = 'Use the new one';
  conflict.append(msg, keep, use);
  const live = doc.createElement('span'); live.className = 'forge-composer-sr'; live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-label', COMPOSER_LABELS.sr);
  el.append(text, bar, conflict, live);
  const errorEl = doc.createElement('div'); errorEl.className = COMPOSER_ERROR_CLASS; errorEl.setAttribute('role', 'status');
  parent.append(el, errorEl);

  let s: BoxState = initBox(initial);
  let c: ComposerState = initComposer(initial);
  let remote: string | null = null;                              // the busy message of a request somebody else is running (setBusy)
  let note: string | null = null;                                // a plain line under the card (setNote): not busy, typing clears it
  let disposed = false;
  let walking = -1;                                              // where the Up recall stopped (-1: not walking the history)
  const history = (): readonly string[] => ports.history?.get() ?? [];

  const grow = (): void => {                                      // the field grows with its text up to MAX_LINES, then scrolls inside
    text.style.height = 'auto';
    const sh = text.scrollHeight; if (sh > 0) { const line = parseFloat((doc.defaultView as any)?.getComputedStyle?.(text)?.lineHeight) || 22; text.style.height = `${Math.min(sh, line * MAX_LINES + 8)}px`; }
  };
  const paint = (): void => {
    if (text.value !== s.text) text.value = s.text;
    grow();
    const edited = isEdited(s);
    const working = isWorking(c) || remote !== null;
    el.classList.toggle('is-edited', edited); el.classList.toggle('has-conflict', s.conflict); el.classList.toggle('is-previewing', c.phase === 'previewing');
    el.classList.toggle('is-busy', working); el.classList.toggle('can-send', edited && canSubmit(c) && remote === null);
    text.readOnly = working;
    state.textContent = remote ?? (c.phase === 'working' ? WORKING_TEXT : '');
    send.disabled = false; send.setAttribute('aria-disabled', edited && canSubmit(c) && remote === null ? 'false' : 'true');
    conflict.style.display = s.conflict ? '' : 'none';
    const line = errorLine(c) || note || '';
    errorEl.textContent = line; errorEl.classList.toggle('is-empty', line === '');
    live.textContent = announcement(c) || (note ?? '');
  };

  // ---- the state machine and its effects -------------------------------------------------------------------------------------------------------------------------------------------
  const dispatch = (ev: ComposerEvent): void => {
    const r = step(c, ev); c = r.state; runEffect(r.effect); paint();
  };
  function runEffect(effect: ComposerEffect): void {
    switch (effect.do) {
      case 'preview': {
        note = null;
        const { seq } = effect; const sent = effect.text;
        void (async () => {
          let res: PreviewResult;
          try { res = await ports.preview(sent); } catch (e) { res = { ok: false, message: `Could not ask: ${(e as Error)?.message ?? e}` }; console.error('[forge-composer] preview threw', e); }
          if (disposed) return;
          if (res.ok === true) dispatch({ type: 'resolved', seq, proposal: res.proposal, autoApply: ports.autoApply?.() === true });
          else dispatch({ type: 'failed', seq, message: res.message });
        })();
        break;
      }
      case 'apply': {
        note = null;
        const { seq } = effect; const sent = effect.text; const proposal = effect.proposal;
        if (ports.history) ports.history.set(pushHistory(ports.history.get(), sent));
        walking = -1;
        void (async () => {
          let res: { ok: boolean; disk?: string; message?: string } = { ok: false };
          try { res = await ports.apply(sent, proposal); } catch (e) { res = { ok: false, message: `Apply failed: ${(e as Error)?.message ?? e}` }; console.error('[forge-composer] apply threw', e); }
          if (disposed) return;
          if (res.ok) { s = applied(res.disk ?? sent); dispatch({ type: 'applied', seq, disk: res.disk ?? sent }); }
          else dispatch({ type: 'applyFailed', seq, message: res.message ?? 'It did not go through.' });
        })();
        break;
      }
      case 'cancel': ports.cancel?.(); break;
      case 'discard': ports.discard?.(); break;
      case 'none': break;
    }
  }
  const submit = (): void => {
    if (remote !== null) return;
    if (c.phase === 'idle' && !isEdited(s)) return;                       // nothing typed that differs from the note: nothing to ask
    dispatch({ type: 'enter' });
  };

  // ---- the field -------------------------------------------------------------------------------------------------------------------------------------------------------------------
  text.addEventListener('input', () => { note = null; walking = -1; s = typed(s, text.value); dispatch({ type: 'type', text: text.value }); });
  text.addEventListener('keydown', (e) => {
    const k = e as KeyboardEvent;
    if (k.key === 'Enter') {
      if (k.shiftKey || k.isComposing || k.keyCode === 229) return;       // Shift+Enter: the browser's own new line; an IME composition: Enter only confirms it
      if (k.altKey || k.ctrlKey || k.metaKey) return;
      e.preventDefault(); submit(); return;
    }
    if (k.key === 'Escape') { if (c.phase !== 'idle' || menuOpen) { e.preventDefault(); e.stopPropagation(); if (menuOpen) setMenu(false); else dispatch({ type: 'escape' }); } return; }
    if ((k.key === 'ArrowUp' || k.key === 'ArrowDown') && !k.shiftKey && !k.altKey && !k.ctrlKey && !k.metaKey && !isWorking(c)) {
      const h = history();
      if (k.key === 'ArrowUp' && upRecalls(text.value, walking >= 0)) {
        const r = recallOlder(h, walking); if (r === null) return;
        e.preventDefault(); walking = r.index; s = typed(s, r.text); dispatch({ type: 'externalText', text: r.text }); try { text.setSelectionRange(r.text.length, r.text.length); } catch { /* not focusable */ }
      } else if (k.key === 'ArrowDown' && walking >= 0) {
        e.preventDefault(); const r = recallNewer(h, walking); walking = r.index; s = typed(s, r.text); dispatch({ type: 'externalText', text: r.text });
      }
    }
  });
  send.addEventListener('click', () => { submit(); try { text.focus(); } catch { /* hidden */ } });
  keep.addEventListener('click', () => { s = keepMine(s); paint(); });
  use.addEventListener('click', () => { s = useNew(s); dispatch({ type: 'externalText', text: s.text }); });

  // ---- the "+" menu -------------------------------------------------------------------------------------------------------------------------------------------------------------------
  let menuOpen = false;
  const items: HTMLButtonElement[] = [];
  const setMenu = (open: boolean): void => { menuOpen = open; menu.hidden = !open; plus.setAttribute('aria-expanded', open ? 'true' : 'false'); };
  const spec = ports.menu;
  if (spec) {
    const all: ComposerMenuItem[] = [...spec.items, ...(spec.pickNote ? [{ id: LINK_ID, label: 'Insert a link to a note' }] : [])];
    for (const it of all) {
      const b = doc.createElement('button'); b.type = 'button'; b.className = 'forge-composer-menuitem'; b.setAttribute('role', 'menuitem'); b.textContent = it.label; b.setAttribute('data-id', it.id);
      b.addEventListener('click', (e) => {
        e.stopPropagation(); setMenu(false);
        if (it.id === LINK_ID) { void (async () => { const link = await spec.pickNote?.(); if (link) insertAtCaret(`[[${link}]]`); try { text.focus(); } catch { /* hidden */ } })(); return; }
        spec.run(it.id);
      });
      b.addEventListener('keydown', (e) => {
        const i = items.indexOf(b);
        if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setMenu(false); plus.focus(); }
        else if (e.key === 'Tab') setMenu(false);
      });
      menu.appendChild(b); items.push(b);
    }
    plus.addEventListener('click', (e) => { e.stopPropagation(); setMenu(!menuOpen); if (menuOpen) items[0]?.focus(); });
    doc.body?.addEventListener('click', onBodyClick);
  } else { plus.hidden = true; }
  function onBodyClick(): void { if (menuOpen) setMenu(false); }
  function insertAtCaret(insert: string): void {
    const a = text.selectionStart ?? text.value.length, b = text.selectionEnd ?? a;
    const next = text.value.slice(0, a) + insert + text.value.slice(b);
    text.value = next; try { text.setSelectionRange(a + insert.length, a + insert.length); } catch { /* not focusable */ }
    s = typed(s, next); dispatch({ type: 'type', text: next });
  }

  paint();
  // the pane can change width after the card was drawn (a split, the sidebar): the field grows again for its new width, so wrapped text is never cut off
  const Resize = (doc.defaultView as unknown as { ResizeObserver?: typeof ResizeObserver } | null)?.ResizeObserver;
  let lastWidth = -1;
  const sizeWatch = Resize ? new Resize((entries) => { const w = Math.round(entries[0]?.contentRect.width ?? 0); if (!disposed && w > 0 && w !== lastWidth) { lastWidth = w; grow(); } }) : null;
  sizeWatch?.observe(text);
  // the tab appends the strip it builds for a note's new kind at the END of the pane: the card goes back to being last, so it stays the bottom of the tab
  const Observer = (doc.defaultView as unknown as { MutationObserver?: typeof MutationObserver } | null)?.MutationObserver;
  const watch = Observer ? new Observer(() => { if (!disposed && el.parentElement === parent && parent.lastElementChild !== errorEl) { parent.appendChild(el); parent.appendChild(errorEl); } }) : null;
  watch?.observe(parent, { childList: true });
  return {
    el,
    setDisk(disk) { s = diskChanged(s, disk); if (!isEdited(s) && c.phase !== 'working' && c.phase !== 'applying') c = { ...initComposer(s.text), seq: c.seq }; paint(); },
    focus() { try { text.focus(); } catch { /* not focusable (a hidden pane) */ } },
    setBusy(message) { remote = message; if (message !== null) note = null; paint(); },
    setNote(message) { note = message; paint(); },
    suggest(next) { note = null; walking = -1; s = typed(s, next); dispatch({ type: 'externalText', text: next }); try { text.focus(); } catch { /* a hidden pane */ } },
    reset(disk) { note = null; walking = -1; s = applied(disk); c = { ...initComposer(disk), seq: c.seq }; paint(); },
    state: () => s,
    composer: () => c,
    dispose() { disposed = true; watch?.disconnect(); sizeWatch?.disconnect(); doc.body?.removeEventListener('click', onBodyClick); el.remove(); errorEl.remove(); },
  };
}
