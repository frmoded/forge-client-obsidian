// 2026-11-27-1050 (prompt stack stage 2) - the controller's side of the prompt stack (music-composer code: the lean edition mounts no composer, so it has no push, no pop and none of this): POP (the typed words, the command, the Prompts block), the
// card `Pop to N` is confirmed on, and the bar-order line of a phrase's card. No `obsidian` import: what it needs of the controller (description-apply.ts) comes in as `PopIo`.
//
// A pop is ONE write (the controller's list write, with the stack as its condition) and ONE undo entry. It writes the list exactly as the stack says it was; a stack that no longer matches the note is shorter (group-core), and what it does not
// describe stays. `Pop to N` is applied only after its card was shown, and only while the note is what the card was made of.
import { describePop, popTo, reconcile, type Group } from './group-core.ts';
import { readGroups, type GroupOp } from './group-note-core.ts';
import { drawPrompts } from './group-prompts-dom.ts';
import { barOrderLine, drawnBarCount } from './bar-order-core.ts';
import { WAITING_LINE, parseList, render, replayGrammar, stopNotice, type ListStop, type ReplayCtx } from './sentence-list-core.ts';
import { CUSTOM_BANNER, descriptionEditedByHand, isCustomNote } from './phrase-notes-core.ts';
import { familyOfPath, type Family } from './note-family-core.ts';
import { extractDescription } from './v2-note-core.ts';
import type { PhraseParams } from './phrase-core.ts';
import type { DialogEvent } from './dialog-core.ts';
import type { Proposal } from './composer-core.ts';

/** 2026-11-19-0997: this core is the LIST MODEL's (reached only through src/list-model-selected.ts); list-model.full.ts lists this string in `cores`, scripts/build-main.test.mjs greps the lean bundle for it. */
export const LIST_MODEL_SENTINEL_GROUP_CONTROLLER = 'forge-list-model-core:group-controller';

export const NOTHING_TO_POP = 'There is no prompt to pop.';
export const POP_CHANGED = 'The note changed while you were looking; ask again.';
export const POP_KINDS = 'Pop is for a phrase, an arrangement or a composition.';
export const POP_FOREIGN = 'This note\'s "groups" property is not one Forge wrote, so it is left as it is and there is no prompt to pop.';
export const POP_BOX_FULL = 'Empty the box first, then click Pop to here.';
export const POP_UNFAITHFUL = 'The lines from before that prompt cannot be written back as they were, so nothing was changed.';
export const POP_UNREADABLE = 'No line from before that prompt can be read now (a note it names may be gone), so nothing was changed.';
export const POP_COMMAND_ID = 'pop-the-last-prompt';
export const POP_COMMAND_NAME = 'Pop the last prompt';

type GrammarVault = ReplayCtx['vault'];
/** What the Prompts block needs of the composer card (a structural part of its handle: the card itself is the panel's and the controller's). */
export interface Card { el: HTMLElement; state(): { text: string }; setNote(message: string): void; focus(): void; suggest(text: string): void; submit(): void }
type Preview = { ok: true; proposal: Proposal } | { ok: false; message: string };
export interface PopRecord { before: string[]; added: string[]; replaced: []; /** the prompts that went, in words: what undo and redo say */ pop: string }
export interface PopIo {
  read(path: string): Promise<string>;
  /** The note's list, as the controller reads it. */
  list(text: string, family: Family): string[];
  vault(): GrammarVault;
  pane(path: string): HTMLElement | undefined;
  /** The controller's ONE list write (over the Description `base`), with the stack operation; it records the undo entry. */
  commit(path: string, family: Family, next: string[], base: string, record: PopRecord, op: GroupOp): Promise<{ ok: true; stop: ListStop | null; applied: number } | { ok: false; message: string }>;
  say(path: string, ev: DialogEvent): void;
  note(path: string, message: string | null): void;
  /** Forget what the composer has pending for the note (a service suggestion, a request still out, the previewed sentences); `expire` also ends the open card. */
  clear(path: string, expire: boolean): void;
}
export interface Groups {
  /** The first Enter on `Pop.` (applied at once) or `Pop to N.` (the card; nothing is written). */
  preview(path: string, to: number | null): Promise<Preview>;
  /** Pop the last prompt (`to` null), or every prompt above `to` (only after its card). */
  apply(path: string, to: number | null): Promise<{ ok: boolean; disk?: string; message?: string }>;
  /** Esc: the card is dropped. */
  discard(path: string): void;
  /** `{ bars }` for a phrase's card when the bar order before and after is known; `{}` otherwise. */
  bars(path: string, text: string, next: readonly string[]): { bars?: string };
  /** Draw the Prompts block of one composer panel from the note's text (reconciled in memory: looking writes nothing). Never throws. */
  draw(path: string, text: string | undefined, panel: HTMLElement, box: Card): void;
}

type Held = { ok: true; family: Family; text: string; list: string[]; stack: Group[]; res: NonNullable<ReturnType<typeof popTo>> } | { ok: false; nothing?: boolean; message: string };

export function createGroups(io: PopIo): Groups {
  const pending = new Map<string, { to: number; base: string; stack: string }>();          // the card each note is showing
  /** What a pop of `path` would do now, or why there is none. */
  async function plan(path: string, to: number | null): Promise<Held> {
    const no = (message: string): Held => ({ ok: false, message });
    const family = familyOfPath(path);
    if (family === null) return no(POP_KINDS);
    let text: string; try { text = await io.read(path); } catch (e) { console.error('[forge-groups] pop: could not read the note', e); return no(`Could not read the note: ${(e as Error)?.message ?? e}`); }
    if (isCustomNote(text)) return no(CUSTOM_BANNER);
    const stored = readGroups(text);
    if (stored.state === 'foreign') return no(POP_FOREIGN);
    const list = io.list(text, family), stack = reconcile(stored.groups, list), n = stack.length;
    if (n === 0) return { ok: false, nothing: true, message: NOTHING_TO_POP };
    if (to !== null && to !== undefined) {
      if (to < 1) return no(`Pop to takes a prompt number from 1 to ${n}.`);
      if (to === n) return no(`Prompt ${n} is the last one: there is nothing above it to pop.`);
      if (to > n) return no(`There is no prompt ${to}: the last one is ${n}.`);
    }
    const res = popTo(stack, list, to ?? n - 1)!;
    if (JSON.stringify(parseList(render(res.list), family, io.vault()).list) !== JSON.stringify(res.list)) return no(POP_UNFAITHFUL);          // (an old paragraph kept as one line, replaced by a new head: written back it would read as other lines)
    if (res.list.length > 0 && !WAITING_LINE.test(res.list[0]) && replayGrammar(res.list, family, { vault: io.vault() }).params === null) return no(POP_UNREADABLE);          // the write would empty the Score
    return { ok: true, family, text, list, stack, res };
  }
  const refuse = (path: string, message: string): { ok: false; message: string } => { io.say(path, { type: 'refused', message, by: 'plugin' }); io.note(path, `Refused: ${message}`); return { ok: false, message }; };
  const tell = (path: string, message: string): void => { io.say(path, { type: 'notice', message }); io.note(path, message); };

  return {
    async preview(path, to) {
      if (to === null) return { ok: true, proposal: { description: 'Pop', via: 'grammar', now: true } };
      pending.delete(path);
      const p = await plan(path, to);
      if (p.ok === false) return refuse(path, p.message);
      pending.set(path, { to, base: extractDescription(p.text), stack: JSON.stringify(p.stack) });
      const description = describePop(p.res.gone, to + 1);
      io.say(path, { type: 'suggestion', via: 'pop', question: `Pop to ${to}. ${p.res.gone.length === 1 ? 'This prompt goes:' : 'These prompts go:'}`, description, recipe: '' });
      return { ok: true, proposal: { description, via: 'grammar', instead: `Pop to ${to}.` } };          // `instead`: never applied without the second Enter
    },
    async apply(path, to) {
      const seen = pending.get(path); pending.delete(path);
      const p = await plan(path, to);
      if (p.ok === false) { if (p.nothing !== true) return refuse(path, p.message); tell(path, p.message); return { ok: true, disk: '' }; }
      if (to !== null) {
        const why = seen === undefined || seen.to !== to ? `Say "Pop to ${to}." again and confirm it.` : seen.base !== extractDescription(p.text) || seen.stack !== JSON.stringify(p.stack) ? POP_CHANGED : null;
        if (why !== null) { io.clear(path, true); tell(path, why); return { ok: false, message: why }; }
      }
      const first = p.res.groups.length + 1, words = describePop(p.res.gone, first);
      const done = await io.commit(path, p.family, p.res.list, extractDescription(p.text), { before: p.list, added: [], replaced: [], pop: words }, { set: p.res.groups, expect: JSON.stringify(p.stack), list: p.res.list });
      if (done.ok === false) { io.say(path, { type: 'failed', message: done.message }); io.note(path, done.message); return { ok: false, message: done.message }; }
      io.clear(path, to === null);          // (a confirmed `Pop to N` leaves its own card to be marked applied)
      io.say(path, { type: 'notice', message: p.res.gone.length === 1 ? `Popped prompt ${words} Cmd/Ctrl+Z gives it back.` : `Popped prompts ${first} to ${p.stack.length}. Cmd/Ctrl+Z gives them back.` });
      io.note(path, 'Popped.');
      if (done.stop !== null) io.say(path, { type: 'notice', message: stopNotice(done.stop, done.applied) });
      return { ok: true, disk: '' };
    },
    discard(path) { pending.delete(path); },
    bars(path, text, next) {
      if (familyOfPath(path) !== 'phrase' || descriptionEditedByHand(text)) return {};          // (a hand edit waiting for Forge: the Score is not the list's)
      const ctx = { vault: io.vault() }, after = replayGrammar(next, 'phrase', ctx);
      if (after.stop !== null) return {};
      const line = barOrderLine(drawnBarCount(io.pane(path)), replayGrammar(io.list(text, 'phrase'), 'phrase', ctx).params as PhraseParams | null, after.params as PhraseParams | null);
      return line === null ? {} : { bars: line };
    },
    draw(path, text, panel, box) {
      const family = familyOfPath(path);
      if (family === null || text === undefined) return;
      try {
        const stored = isCustomNote(text) ? [] : readGroups(text).groups;
        drawPrompts(panel, box.el, stored.length === 0 ? [] : reconcile(stored, io.list(text, family)), (n) => {
          const typed = box.state().text.trim();
          if (typed !== '' && !/^pop to \d+\.$/i.test(typed)) { box.setNote(POP_BOX_FULL); box.focus(); return; }          // an unsent sentence is never overwritten
          box.suggest(`Pop to ${n}.`); box.submit();
        });
      } catch (e) { console.warn('[forge-groups] the Prompts block could not be drawn', e); }          // (a block that cannot be drawn never fails the write it follows)
    },
  };
}

/** `Pop the last prompt`: offered while the active note is a phrase, an arrangement or a composition that is not custom. */
export function popCommand(
  plugin: { addCommand(command: { id: string; name: string; checkCallback(checking: boolean): boolean }): unknown },
  app: { workspace: { getActiveFile?(): { path: string } | null } },
  ctl: { canDetach(path: string): boolean; popLast(path: string): Promise<unknown> },
): void {
  plugin.addCommand({
    id: POP_COMMAND_ID,
    name: POP_COMMAND_NAME,
    checkCallback: (checking) => {
      const file = app.workspace.getActiveFile?.();
      if (!file || !ctl.canDetach(file.path)) return false;
      if (!checking) void ctl.popLast(file.path);
      return true;
    },
  });
}
