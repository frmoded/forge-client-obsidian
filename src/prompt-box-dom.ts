// 2026-11-12-1203 - the docked prompt box (plain DOM, no obsidian import: a happy-dom test mounts the very code the tab runs). One multi-line field that is an editor view of the note's Description facet, an Apply button, and a
// visible "edited, not applied" state. Enter applies, Shift+Enter is a new line. The state machine is prompt-box-core.ts; applying is the caller's (`ports.apply`: the existing "Update from Description" path), and so is where the
// result and any parse error appear (the strip at the top of the pane): the box only keeps the text when the apply did not go through.
//
//   <div class="forge-prompt-box [is-edited] [has-conflict]" role="group" aria-label="Description prompt">
//     <textarea class="forge-prompt-box-text" aria-label="Description of this note">…</textarea>
//     <span class="forge-prompt-box-state">edited, not applied</span>
//     <button class="forge-prompt-box-apply">Apply</button>
//     <div class="forge-prompt-box-conflict">The controls changed the Description. <button data-choice="keep">Keep my text</button> <button data-choice="use">Use the new one</button></div>
//   </div>
import { applied, diskChanged, initBox, isEdited, keepMine, typed, useNew, type BoxState } from './prompt-box-core.ts';

export const PROMPT_BOX_CLASS = 'forge-prompt-box';
export interface PromptBoxPorts {
  /** Apply this text as the note's Description (the "Update from Description" path). `ok: false` = it did not go through (the strip says why): the box keeps the text. `ok: true` carries the Description the note says now (the writer's canonical sentence), which the field then shows. */
  apply(text: string): Promise<{ ok: boolean; disk?: string }>;
  placeholder: string;
}
export interface PromptBoxHandle {
  readonly el: HTMLElement;
  /** The Description on disk is now this (a control wrote it, a hand edit, an apply). Never overwrites unapplied typing: it offers the choice. */
  setDisk(disk: string): void;
  focus(): void;
  /** A request is running for this text (the sentence service): the box says so and Apply waits; the text stays editable. `null` = done. */
  setBusy(message: string | null): void;
  /** 2026-11-13-1209: a plain line under the box (an answer that was dropped, and why). Apply is not disabled by it; typing, a new request or a reset clears it. `null` = clear. */
  setNote(message: string | null): void;
  /** The note was updated from the suggestion: the box shows what the note says now (the canonical grammar sentence) and drops the unapplied typing. */
  reset(disk: string): void;
  state(): BoxState;
  dispose(): void;
}

export function mountPromptBox(parent: HTMLElement, ports: PromptBoxPorts, initial: string): PromptBoxHandle {
  const doc = parent.ownerDocument;
  const el = doc.createElement('div');
  el.className = PROMPT_BOX_CLASS;
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'Description prompt');
  const text = doc.createElement('textarea');
  text.className = 'forge-prompt-box-text'; text.rows = 2; text.spellcheck = false;
  text.setAttribute('aria-label', 'Description of this note: edit it and press Enter to apply');
  text.placeholder = ports.placeholder;
  const state = doc.createElement('span');
  state.className = 'forge-prompt-box-state'; state.setAttribute('aria-live', 'polite');
  const apply = doc.createElement('button');
  apply.type = 'button'; apply.className = 'forge-prompt-box-apply'; apply.textContent = 'Apply';
  apply.title = 'Apply: update the note from this Description (Enter)';
  const conflict = doc.createElement('div');
  conflict.className = 'forge-prompt-box-conflict'; conflict.setAttribute('role', 'status');
  const msg = doc.createElement('span'); msg.textContent = 'The controls changed the Description while you were typing. ';
  const keep = doc.createElement('button'); keep.type = 'button'; keep.setAttribute('data-choice', 'keep'); keep.textContent = 'Keep my text';
  const use = doc.createElement('button'); use.type = 'button'; use.setAttribute('data-choice', 'use'); use.textContent = 'Use the new one';
  conflict.append(msg, keep, use);
  el.append(text, state, apply, conflict);
  parent.appendChild(el);

  let s: BoxState = initBox(initial);
  let busy = false;
  let remote: string | null = null;                              // the busy message of a request somebody else is running (setBusy)
  let note: string | null = null;                                // a plain line left by a dropped answer (setNote): not busy, Apply stays available
  let disposed = false;
  const paint = (): void => {
    if (text.value !== s.text) text.value = s.text;
    const edited = isEdited(s);
    el.classList.toggle('is-edited', edited);
    el.classList.toggle('has-conflict', s.conflict);
    state.textContent = remote ?? note ?? (edited ? 'edited, not applied' : '');
    el.classList.toggle('is-busy', remote !== null || busy);
    apply.disabled = !edited || busy || remote !== null;
    conflict.style.display = s.conflict ? '' : 'none';
  };
  const run = async (): Promise<void> => {
    if (busy || remote !== null || !isEdited(s)) return;
    busy = true; paint();
    const sent = s.text;
    let result: { ok: boolean; disk?: string } = { ok: false };
    try { result = await ports.apply(sent); } catch { result = { ok: false }; }
    busy = false;
    if (disposed) return;
    if (result.ok && s.text === sent) s = applied(result.disk ?? sent);          // applied and not typed on since: the field shows what the note says now
    paint();
  };
  text.addEventListener('input', () => { note = null; s = typed(s, text.value); paint(); });
  text.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || (e as KeyboardEvent).isComposing) return;
    e.preventDefault();                                                       // Enter applies; Shift+Enter (the browser's own) is a new line
    void run();
  });
  apply.addEventListener('click', () => { void run(); });
  keep.addEventListener('click', () => { s = keepMine(s); paint(); });
  use.addEventListener('click', () => { s = useNew(s); paint(); });
  paint();
  // the tab (phrase-dom.ts) appends the strip it builds for a note's new kind at the END of the pane: the box goes back to being last, so it stays the bottom of the tab
  const Observer = (doc.defaultView as unknown as { MutationObserver?: typeof MutationObserver } | null)?.MutationObserver;
  const watch = Observer ? new Observer(() => { if (!disposed && el.parentElement === parent && parent.lastElementChild !== el) parent.appendChild(el); }) : null;
  watch?.observe(parent, { childList: true });
  return {
    el,
    setDisk(disk) { s = diskChanged(s, disk); paint(); },
    focus() { try { text.focus(); } catch { /* not focusable (a hidden pane) */ } },
    setBusy(message) { remote = message; if (message !== null) note = null; paint(); },
    setNote(message) { note = message; paint(); },
    reset(disk) { note = null; s = applied(disk); paint(); },
    state: () => s,
    dispose() { disposed = true; watch?.disconnect(); el.remove(); },
  };
}
