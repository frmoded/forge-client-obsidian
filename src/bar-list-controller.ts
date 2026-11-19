// 2026-11-19-0993 (THE LIST MODEL, stage 3: BARS; 11d.6 and 11d.7) - the BAR half of the description controller (description-apply.ts builds it and routes to it; it is the same controller, the same `appendLine`, the same dialog, the same composer and the same undo
// stack as the phrase, the arrangement and the composition). No `obsidian`: the vault, the dialog and the box are the controller's, given as `deps`.
//
//   appendLine(path, sentence, opts)   ONE gesture of the Beat Box (or one typed sentence): planned and written inside ONE `process` of the note, recorded for undo. `opts.gesture` makes the lines of one pointer gesture (press, drag, release) one line and one undo.
//   previewBar / applyBar              the composer's two Enters: the typed sentences in the bar grammar (no service: it knows no bar sentences; an unreadable one is refused in words), appended through the same plan.
//   stepBar / canStepBar               undo and redo (Cmd/Ctrl+Z in the empty composer, the "+" menu items, the Beat Box's own message).
//   evaluateBar                        a hand edit of `lines:` (heard from the vault's `modify`): the fence follows the list; an unreadable line is kept and named in plain words, the replay stops before it; no readable line at all = nothing is written.
// OPENING WRITES NOTHING: nothing here runs `process` unless a gesture, a typed sentence, an undo or a heard hand edit asks it to; an unlisted bar is given its `lines:` by its FIRST write only.
import { barSentencesOf, canonicalBarLine, headSentence } from './bar-grammar-core.ts';
import { barUndoStack, mergeGestureSentences, planBarAppend } from './bar-list-core.ts';
import { barLinesBlock, inspectBarNote, withoutBarLines, writeBarNote, type BarInspection } from './bar-list-note-core.ts';
import { stopNotice, type Replaced, type UndoStack } from './sentence-list-core.ts';
import type { DialogEvent } from './dialog-core.ts';
/** What the composer's first Enter gets back (the shape prompt-box-dom.ts's PreviewResult has; written here so this file does not import the card). */
type PreviewResult = { ok: true; proposal: { description: string; via: 'grammar' | 'service'; replaces?: string } } | { ok: false; message: string };
import { parseBarSentence } from './bar-grammar-core.ts';
import { formatRhythmJson, type RhythmData } from './rhythm-edit-core.ts';

export interface BarListDeps {
  /** The vault's atomic read-modify-write of one note, as the controller tracks it (`fn` gets the CURRENT text; returning it unchanged writes nothing). */
  proc(path: string, fn: (cur: string) => string): Promise<void>;
  say(path: string, ev: DialogEvent): void;
  pb(line: string): void;
  pbWarn(line: string): void;
  trace(line: string): void;
  setBoxNote(path: string, message: string | null): void;
  endSuggestion(path: string, state: 'applied' | 'cancelled' | 'expired'): void;
  basename(path: string): string;
}

export interface BarAppendOpts {
  /** The pointer gesture this line belongs to (press, drag across cells, release): lines with the same key, one after the other, are ONE line and ONE undo. */
  gesture?: string;
  /** The line is said in the dialog ("Applied ...") when it came from the composer; a Beat Box gesture is quiet (the grid is its own feedback). */
  loud?: boolean;
}
export interface BarAppendResult {
  ok: boolean;
  message: string;
  /** The bar the note says now (the replay of its list): the Beat Box redraws from it when it is not what the widget holds. */
  data?: RhythmData;
  /** Why not, for a caller that has a fallback: `unlistable` = the bar cannot be said as a head (the Beat Box keeps its old save for it). */
  reason?: 'unlistable' | 'unreadable' | 'refused' | 'blocked' | 'empty' | 'unreadable-note';
  added?: string[];
  replaced?: Replaced[];
  unchanged?: boolean;
}

const same = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);
const MAX_GESTURE_LINES = 64;
const REBASED_NOTICE = 'The bar was edited outside its list (the JSON view, a sync, an older tab). Its data stays as you see it; the list starts again from it, and Undo goes no further back.';

export function createBarList(deps: BarListDeps) {
  const stacks = new Map<string, UndoStack>();
  const stackOf = (path: string): UndoStack => { let s = stacks.get(path); if (!s) { s = barUndoStack(); stacks.set(path, s); } return s; };
  const gestures = new Map<string, { key: string; before: string[]; sentences: string[]; after: string[] }>();
  const told = new Map<string, string>();
  /** What the list and the fence said the last time this controller looked at the note (or wrote it): a change heard later is told apart by which of the two moved. */
  const seen = new Map<string, { block: string | null; fence: string | null }>();
  const mark = (path: string, text: string): void => { const i = inspectBarNote(text); seen.set(path, { block: barLinesBlock(text), fence: i.fence === null ? null : formatRhythmJson(i.fence) }); };

  type Done = { ok: true; before: string[]; plan: Extract<ReturnType<typeof planBarAppend>, { ok: true }>; wrote: boolean; continued: boolean; rebased: boolean } | { ok: false; result: BarAppendResult };

  /** The list a gesture or a typed sentence is planned against. WHAT YOU SEE IS WHAT YOU EDIT: the Beat Box and the Score show the FENCE, so when the list and the fence disagree (an empty list over another bar, a json edited outside the list, a bar saved by an older tab) the list starts again
   *  from the bar as it is (its head) and the sentence goes on top of that. A list edited by hand while the plugin runs is followed when it is HEARD (evaluateBar), not here. `list: null` = the bar cannot be said as a head. */
  const basis = (insp: BarInspection): { list: string[] | null; rebased: boolean } => {
    if (insp.hasLines && !insp.inSync && insp.fence !== null) { const head = headSentence(insp.fence); return { list: head === null ? null : [head], rebased: true }; }
    return { list: insp.list, rebased: false };
  };

  /** The plan of `typed` against the bar as it is NOW (decided on the text `process` hands over), written in the same call. */
  async function commit(path: string, typed: readonly string[], opts: BarAppendOpts): Promise<Done> {
    let done: Done | null = null;
    const fail = (result: BarAppendResult): Done => ({ ok: false, result });
    try {
      await deps.proc(path, (cur) => {
        const insp = inspectBarNote(cur);
        if (insp.fence === null) { done = fail({ ok: false, reason: 'unreadable-note', message: 'This note is not a bar the Beat Box can read, so nothing was written.' }); return cur; }
        const start = basis(insp);
        if (start.list === null || (!insp.hasLines && headSentence(insp.fence) === null)) { done = fail({ ok: false, reason: 'unlistable', message: 'This bar cannot be put in a list (its signature or numbers are ones the sentences cannot say); nothing was written.' }); return cur; }
        const g = opts.gesture === undefined || start.rebased ? undefined : gestures.get(path);
        const continued = g !== undefined && g.key === opts.gesture && same(g.after, insp.list) && g.sentences.length < MAX_GESTURE_LINES;
        const base = continued ? g!.before : start.list;
        const sentences = opts.gesture === undefined ? [...typed] : mergeGestureSentences([...(continued ? g!.sentences : []), ...typed.flatMap((t) => barSentencesOf(t))]);
        const plan = planBarAppend(base, sentences);
        if (plan.ok === false) { done = fail({ ok: false, reason: plan.reason, message: plan.message }); return cur; }
        if (same(plan.list, insp.list) && insp.inSync) { done = { ok: true, before: insp.list, plan, wrote: false, continued, rebased: false }; return cur; }
        const w = writeBarNote(cur, plan.list);
        if (w.ok === false) { done = fail({ ok: false, reason: 'refused', message: w.message }); return cur; }
        done = { ok: true, before: base, plan, wrote: true, continued, rebased: start.rebased };
        mark(path, w.text);
        if (opts.gesture !== undefined) gestures.set(path, { key: opts.gesture, before: base, sentences, after: plan.list }); else gestures.delete(path);
        return w.text;
      });
    } catch (e) {
      console.error('[forge-promptbox] could not write the bar', e); deps.pbWarn(`could not write the bar: ${(e as Error)?.message ?? e}`);
      return fail({ ok: false, reason: 'refused', message: `Could not write the bar: ${(e as Error)?.message ?? e}` });
    }
    const out = done as Done | null;
    return out ?? fail({ ok: false, reason: 'refused', message: 'The bar was not written.' });
  }

  const record = (path: string, d: Extract<Done, { ok: true }>): void => {
    if (!d.wrote || same(d.before, d.plan.list)) return;
    const entry = { before: d.before, after: d.plan.list, added: d.plan.added, replaced: d.plan.replaced };
    if (d.continued) stackOf(path).replaceTop(entry); else stackOf(path).push(entry);
  };

  /** ONE gesture or typed sentence APPENDED now: one `process`, one write, undoable. */
  async function appendBar(path: string, sentence: string, opts: BarAppendOpts = {}): Promise<BarAppendResult> {
    const typed = barSentencesOf(sentence);
    const d = await commit(path, typed, opts);
    if (d.ok === false) {
      deps.pb(`bar append refused: ${d.result.message}`);
      if (d.result.reason !== 'unlistable') deps.say(path, { type: 'notice', message: d.result.message });
      return d.result;
    }
    if (d.rebased) { stacks.delete(path); gestures.delete(path); deps.say(path, { type: 'notice', message: REBASED_NOTICE }); }
    record(path, d);
    if (!d.wrote) return { ok: true, message: 'Nothing changed: the bar already says this.', data: d.plan.replay.data, unchanged: true, added: [], replaced: [] };
    deps.trace(`[forge-description] applied ${deps.basename(path)} (${d.plan.added.length} line${d.plan.added.length === 1 ? '' : 's'}: ${d.plan.added.join(' ')})`);
    if (opts.loud === true) deps.say(path, { type: 'applied', change: `${d.plan.added.length} line${d.plan.added.length === 1 ? '' : 's'}`, description: d.plan.added.join(' ') });
    return { ok: true, message: d.plan.added.length === 0 ? `Took back: ${d.plan.replaced.map((r) => r.sentence).join(' ')}` : `Added: ${d.plan.added.join(' ')}`, data: d.plan.replay.data, added: d.plan.added, replaced: d.plan.replaced };
  }

  // ---- the composer ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

  const refusedWords = (reason: string, message: string, line: number, column: number): string =>
    reason === 'unreadable' ? `The grammar did not accept this sentence (line ${line}, column ${column}: ${message.replace(/^./, (c) => c.toLowerCase())}).` : message;

  /** The first Enter: what the typed sentences would do (nothing is written). A sentence the grammar cannot read is refused in words; the sentence service knows no bar sentences, so it is not asked. */
  async function previewBar(path: string, text: string, cur: string): Promise<PreviewResult> {
    const insp = inspectBarNote(cur);
    if (insp.fence === null) { const m = 'This note is not a bar the Beat Box can read.'; deps.say(path, { type: 'notice', message: m }); return { ok: false, message: m }; }
    const plan = planBarAppend(insp.list, barSentencesOf(text));
    if (plan.ok === false) {
      if (plan.reason === 'unreadable') { deps.say(path, { type: 'rejected', line: plan.line, column: plan.column, message: plan.message }); deps.setBoxNote(path, refusedWords(plan.reason, plan.message, plan.line, plan.column)); return { ok: false, message: refusedWords(plan.reason, plan.message, plan.line, plan.column) }; }
      deps.say(path, { type: 'notice', message: plan.message }); deps.setBoxNote(path, plan.message);
      return { ok: false, message: plan.message };
    }
    if (plan.unchanged) { const m = 'Nothing changed: the bar already says this.'; deps.say(path, { type: 'notice', message: m }); return { ok: false, message: m }; }
    const description = plan.added.length > 0 ? plan.added.join(' ') : `Takes back: ${plan.replaced.map((r) => r.sentence).join(' ')}`;
    const replaces = plan.replaced.map((r) => r.sentence).join(' ');
    deps.pb('grammar verdict: accepted (preview, nothing written)');
    deps.say(path, { type: 'suggestion', description, recipe: '', via: 'grammar', ...(replaces !== '' ? { replaces } : {}) });
    return { ok: true, proposal: { description, via: 'grammar', ...(replaces !== '' ? { replaces } : {}) } };
  }

  /** The second Enter (or an apply with no preview): the same plan against the bar as it is now, written in one go and recorded for undo. */
  async function applyBar(path: string, text: string): Promise<{ ok: boolean; disk?: string; message?: string }> {
    const r = await appendBar(path, text, { loud: true });
    if (!r.ok) {
      const m = r.reason === 'unreadable' ? refusedWords('unreadable', r.message, 1, 1) : r.message;
      deps.pb(`apply failed: ${m}`); deps.setBoxNote(path, m);
      return { ok: false, message: m };
    }
    if (r.unchanged === true) { deps.setBoxNote(path, 'Nothing changed: the bar already says this.'); deps.say(path, { type: 'applied', change: 'unchanged', description: 'the bar already says this' }); return { ok: true, disk: '' }; }
    deps.setBoxNote(path, 'Applied.');
    return { ok: true, disk: '' };
  }

  // ---- undo and redo ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

  async function stepBar(path: string, which: 'undo' | 'redo'): Promise<{ ok: boolean; message: string }> {
    const stack = stackOf(path);
    let result: { ok: boolean; message: string } | null = null;
    let wrote = false;
    try {
      await deps.proc(path, (cur) => {
        const insp = inspectBarNote(cur);
        if (insp.fence === null) { result = { ok: false, message: 'This note is not a bar the Beat Box can read.' }; return cur; }
        const r = which === 'undo' ? stack.undo(basis(insp).list ?? []) : stack.redo(basis(insp).list ?? []);
        if (r === null) { result = { ok: false, message: which === 'undo' ? 'There is nothing to take back.' : 'There is nothing to put back.' }; return cur; }
        const w = writeBarNote(cur, r.list);
        if (w.ok === false) { stack.clear(); result = { ok: false, message: w.message }; return cur; }
        wrote = true; gestures.delete(path); mark(path, w.text);
        result = { ok: true, message: 'removed' in r ? `Removed: ${r.removed.join(' ')}${r.restored.length > 0 ? ` Put back: ${r.restored.join(' ')}` : ''}`.trim() : `Added again: ${r.added.join(' ')}` };
        return w.text;
      });
    } catch (e) { stack.clear(); const message = `Could not write the bar: ${(e as Error)?.message ?? e}`; console.error('[forge-promptbox] stepBar', e); deps.say(path, { type: 'failed', message }); return { ok: false, message }; }
    const out = result as { ok: boolean; message: string } | null;
    if (out === null) return { ok: false, message: 'The bar was not written.' };
    if (wrote) { deps.trace(`[forge-description] applied ${deps.basename(path)} (${which})`); deps.say(path, { type: 'notice', message: out.message }); }
    else deps.say(path, { type: 'notice', message: out.message });
    return out;
  }

  const canStepBar = (path: string, which: 'undo' | 'redo', lastText: string | undefined): boolean => {
    if (lastText === undefined) return false;
    const insp: BarInspection = inspectBarNote(lastText);
    if (insp.fence === null) return false;
    return which === 'undo' ? stackOf(path).canUndo(insp.list) : stackOf(path).canRedo(insp.list);
  };

  // ---- a hand edit of `lines:` ----------------------------------------------------------------------------------------------------------------------------------------------------------------------

  /** The note changed and the vault says so (or the note was opened: `auto` false only LOOKS). Two things can have moved: the LIST was edited by hand (the fence follows it, ONE write, the lines before the first unreadable one apply, every line is kept), or the
   *  FENCE was edited outside the list (the JSON view, a sync): the person's data wins, the list starts again from the bar as it is (its head). A list of which no line can be read is never written over the fence (a typo in line 1 never empties the Score). */
  async function evaluateBar(path: string, cur: string, auto: boolean): Promise<void> {
    const insp = inspectBarNote(cur);
    const prev = seen.get(path);
    mark(path, cur);
    if (!insp.hasLines || insp.fence === null) { told.delete(path); return; }
    if (insp.replay.stop !== null) {
      const message = stopNotice(insp.replay.stop, insp.replay.applied);
      if (auto && told.get(path) !== `cut:${message}`) { told.set(path, `cut:${message}`); deps.say(path, { type: 'notice', message }); }
    } else told.delete(path);
    if (insp.inSync || !auto) return;
    const listEdited = prev === undefined || prev.block !== barLinesBlock(cur);
    if (listEdited && insp.replay.applied === 0 && insp.list.length > 0) return;                  // no line can be read: the note keeps what it shows
    let wrote = false;
    try {
      await deps.proc(path, (text) => {
        const now = inspectBarNote(text);
        if (!now.hasLines || now.inSync || now.fence === null || !same(now.list, insp.list)) return text;      // it moved on: the newer text has its own turn
        if (listEdited) { const w = writeBarNote(text, now.list); if (w.ok === false) return text; wrote = true; mark(path, w.text); return w.text; }
        const head = headSentence(now.fence);
        const w = head === null ? null : writeBarNote(text, [head]);
        const next = w !== null && w.ok === true ? w.text : withoutBarLines(text);
        wrote = true; mark(path, next); return next;
      });
    } catch (e) { console.error('[forge-promptbox] evaluateBar', e); deps.pbWarn(`could not follow the edit of the bar: ${(e as Error)?.message ?? e}`); return; }
    if (wrote) {
      gestures.delete(path);
      if (!listEdited) { stacks.delete(path); deps.trace(`[forge-description] rebased ${deps.basename(path)} (the data was edited outside the list)`); deps.say(path, { type: 'notice', message: REBASED_NOTICE }); return; }
      deps.trace(`[forge-description] applied ${deps.basename(path)} (hand edit of lines: ${insp.replay.applied} line${insp.replay.applied === 1 ? '' : 's'})`);
      deps.say(path, { type: 'notice', message: `The bar follows the list you edited (${insp.replay.applied} line${insp.replay.applied === 1 ? '' : 's'}).` });
    }
  }

  /** The canonical words of a typed sentence in the bar it will be said in (for a caller that wants to show it); null when it cannot be read. */
  const canonicalOf = (sentence: string, cur: string): string | null => {
    const insp = inspectBarNote(cur); const p = parseBarSentence(sentence);
    return insp.fence === null || p.ok === false ? null : canonicalBarLine(p.line, insp.replay.data);
  };

  return {
    appendBar, previewBar, applyBar, stepBar, canStepBar, evaluateBar, canonicalOf,
    reset(path: string): void { stacks.delete(path); gestures.delete(path); told.delete(path); },
    dispose(): void { stacks.clear(); gestures.clear(); told.clear(); },
  };
}
