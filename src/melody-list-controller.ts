// 2026-11-23-1030 (pitch in bars, Stage 1a) - the MELODY half of the bar controller: the twin of bar-list-controller.ts for a melody bar (a `bars/bar_NNN.md` whose json has `notes`), and the thin DISPATCHER that makes the seam's `createBarList` serve both kinds.
// The description controller (description-apply.ts) routes a bar by its PATH to ONE `bar` object; this module gives it an object that sends each call to the rhythm controller or to the melody one by what the note IS (learned from the text every
// call that has one is given: previewBar, evaluateBar, canonicalOf, canStepBar; `applyBar` and `stepBar` follow what was learned). The rhythm controller itself is not changed: a bar it is asked about that is not a melody bar goes to it as it always did.
// What a melody bar does not have: a Beat Box (no gestures, no pointer, `appendLine` from the grid), the sentence service (it knows no melody sentences) and "did you mean" repairs. A typed sentence is read by the melody grammar or refused in words.
//   appendBar / previewBar / applyBar / stepBar / canStepBar / evaluateBar / canonicalOf   as the bar controller's, on the melody grammar and the melody note.
// OPENING WRITES NOTHING: nothing here runs `process` unless a typed sentence, an undo or a heard hand edit asks it to; an unlisted melody bar is given its `lines:` by its FIRST write only.
import { createBarList, type BarAppendOpts, type BarAppendResult, type BarListDeps } from './bar-list-controller.ts';
import { parseBarSentence } from './bar-grammar-core.ts';
import { formatMelodyJson, isMelodyNote } from './melody-bar-core.ts';
import { headSentence, melodySentencesOf, parseMelodySentence, renderMelodyLine } from './melody-grammar-core.ts';
import { melodyUndoStack, inspectMelodyNote, planMelodyAppend, writeMelodyNote, type MelodyInspection } from './melody-list-core.ts';
import { barLinesBlock, withoutBarLines } from './bar-list-note-core.ts';
import { stopNotice, type UndoStack } from './sentence-list-core.ts';
/** 2026-11-23-1030: this core is the LIST MODEL's (music-composer code, reached only through src/list-model-selected.ts); the music edition's list-model.full.ts lists this string in `cores`, scripts/build-main.test.mjs greps the lean bundle for it. */
export const LIST_MODEL_SENTINEL_MELODY_LIST_CONTROLLER = 'forge-list-model-core:melody-list-controller';

type PreviewResult = { ok: true; proposal: { description: string; via: 'grammar' | 'service'; replaces?: string; instant?: boolean; instead?: string } } | { ok: false; message: string };
const same = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);
const REBASED_NOTICE = 'The bar was edited outside its list (the JSON view, a sync, an older tab). Its data stays as you see it; the list starts again from it, and Undo goes no further back.';
const NOT_MELODY = 'This note is not a melody bar I can read, so nothing was written.';
/** What a melody bar says to a sentence of a rhythm bar (and the rhythm bar to a melody sentence: see `createBarListWithMelody`). */
/** The words only a melody bar has (the rhythm grammar reads none of them): a rhythm bar's own refusals of every other sentence are left exactly as they were. */
const MELODY_ONLY = /^\s*(note|rest)\b|^\s*start with a melody bar/i;
export const rhythmWordInMelody = (sentence: string): string => `This is a melody bar; "${sentence.trim()}" is a sentence of a rhythm bar (a bar is a rhythm bar or a melody bar, never both). A melody bar's sentences are like: Note G3 on step 1 for 1 step.`;
export const melodyWordInRhythm = (sentence: string): string => `This is a rhythm bar; "${sentence.trim()}" is a sentence of a melody bar (a bar is a rhythm bar or a melody bar, never both). A melody bar is made with New melody bar.`;

export function createMelodyList(deps: BarListDeps) {
  const stacks = new Map<string, UndoStack>();
  const stackOf = (path: string): UndoStack => { let s = stacks.get(path); if (!s) { s = melodyUndoStack(); stacks.set(path, s); } return s; };
  const told = new Map<string, string>();
  /** What the list and the fence said the last time this controller looked at the note (or wrote it): a change heard later is told apart by which of the two moved. */
  const seen = new Map<string, { block: string | null; fence: string | null }>();
  const mark = (path: string, text: string): void => { const i = inspectMelodyNote(text); seen.set(path, { block: barLinesBlock(text), fence: i.fence === null ? null : formatMelodyJson(i.fence) }); };

  type Done = { ok: true; before: string[]; plan: Extract<ReturnType<typeof planMelodyAppend>, { ok: true }>; wrote: boolean; rebased: boolean } | { ok: false; result: BarAppendResult };

  /** WHAT YOU SEE IS WHAT YOU EDIT: when the list and the fence disagree the list starts again from the bar as it is (its head). `list: null` = the bar cannot be said as a head. */
  const basis = (insp: MelodyInspection): { list: string[] | null; rebased: boolean } => {
    if (insp.hasLines && !insp.inSync && insp.fence !== null) { const head = headSentence(insp.fence); return { list: head === null ? null : [head], rebased: true }; }
    return { list: insp.list, rebased: false };
  };

  async function commit(path: string, typed: readonly string[]): Promise<Done> {
    let done: Done | null = null;
    const fail = (result: BarAppendResult): Done => ({ ok: false, result });
    try {
      await deps.proc(path, (cur) => {
        const insp = inspectMelodyNote(cur);
        if (insp.fence === null) { done = fail({ ok: false, reason: 'unreadable-note', message: NOT_MELODY }); return cur; }
        const start = basis(insp);
        if (start.list === null || (!insp.hasLines && headSentence(insp.fence) === null)) { done = fail({ ok: false, reason: 'unlistable', message: 'This melody bar cannot be put in a list (its tempo or grid is one the sentences cannot say); nothing was written.' }); return cur; }
        const plan = planMelodyAppend(start.list, typed);
        if (plan.ok === false) { done = fail({ ok: false, reason: plan.reason, message: plan.message }); return cur; }
        if (same(plan.list, insp.list) && insp.inSync) { done = { ok: true, before: insp.list, plan, wrote: false, rebased: false }; return cur; }
        const w = writeMelodyNote(cur, plan.list);
        if (w.ok === false) { done = fail({ ok: false, reason: 'refused', message: w.message }); return cur; }
        done = { ok: true, before: start.list, plan, wrote: true, rebased: start.rebased };
        mark(path, w.text);
        return w.text;
      });
    } catch (e) {
      console.error('[forge-promptbox] could not write the melody bar', e); deps.pbWarn(`could not write the melody bar: ${(e as Error)?.message ?? e}`);
      return fail({ ok: false, reason: 'refused', message: `Could not write the bar: ${(e as Error)?.message ?? e}` });
    }
    const out = done as Done | null;
    return out ?? fail({ ok: false, reason: 'refused', message: 'The bar was not written.' });
  }

  async function appendBar(path: string, sentence: string, opts: BarAppendOpts = {}): Promise<BarAppendResult> {
    const d = await commit(path, melodySentencesOf(sentence));
    if (d.ok === false) {
      deps.pb(`melody bar append refused: ${d.result.message}`);
      if (d.result.reason !== 'unlistable') deps.say(path, { type: 'notice', message: d.result.message });
      return d.result;
    }
    if (d.rebased) { stacks.delete(path); deps.say(path, { type: 'notice', message: REBASED_NOTICE }); }
    if (d.wrote && !same(d.before, d.plan.list)) stackOf(path).push({ before: d.before, after: d.plan.list, added: d.plan.added, replaced: d.plan.replaced });
    if (!d.wrote) return { ok: true, message: 'Nothing changed: the bar already says this.', unchanged: true, added: [], replaced: [] };
    deps.trace(`[forge-description] applied ${deps.basename(path)} (${d.plan.added.length} line${d.plan.added.length === 1 ? '' : 's'}: ${d.plan.added.join(' ')})`);
    if (opts.loud === true) {
      const change = `${d.plan.added.length} line${d.plan.added.length === 1 ? '' : 's'}`;
      if (opts.instant === true) { const old = d.plan.replaced.map((r) => r.sentence).join(' '); deps.say(path, { type: 'applied', change, description: d.plan.added.length > 0 ? d.plan.added.join(' ') : `Takes back: ${old}`, instant: { replaces: d.plan.added.length > 0 ? old : '' } }); }
      else deps.say(path, { type: 'applied', change, description: d.plan.added.join(' ') });
    }
    return { ok: true, message: d.plan.added.length === 0 ? `Took back: ${d.plan.replaced.map((r) => r.sentence).join(' ')}` : `Added: ${d.plan.added.join(' ')}`, added: d.plan.added, replaced: d.plan.replaced };
  }

  const refusedWords = (reason: string, message: string, line: number, column: number): string =>
    reason === 'unreadable' ? `The grammar did not accept this sentence (line ${line}, column ${column}: ${message.replace(/^./, (c) => c.toLowerCase())}).` : message;

  /** The first Enter: what the typed sentences would do (nothing is written). A sentence the grammar cannot read is refused in words (a rhythm bar's sentence says so by name). */
  async function previewBar(path: string, text: string, cur: string, instant = false): Promise<PreviewResult> {
    const insp = inspectMelodyNote(cur);
    if (insp.fence === null) { deps.say(path, { type: 'notice', message: NOT_MELODY }); return { ok: false, message: NOT_MELODY }; }
    const sentences = melodySentencesOf(text);
    const plan = planMelodyAppend(insp.list, sentences);
    if (plan.ok === false) {
      if (plan.reason === 'unreadable') {
        const wrong = sentences[plan.line - 1] ?? text;
        const rhythmWord = parseBarSentence(wrong).ok;
        const m = rhythmWord ? rhythmWordInMelody(wrong) : refusedWords(plan.reason, plan.message, plan.line, plan.column);
        deps.say(path, { type: 'rejected', line: plan.line, column: plan.column, message: rhythmWord ? m : plan.message }); deps.setBoxNote(path, m); return { ok: false, message: m };
      }
      deps.say(path, { type: 'notice', message: plan.message }); deps.setBoxNote(path, plan.message);
      return { ok: false, message: plan.message };
    }
    if (plan.unchanged) { const m = 'Nothing changed: the bar already says this.'; deps.say(path, { type: 'notice', message: m }); return { ok: false, message: m }; }
    const description = plan.added.length > 0 ? plan.added.join(' ') : `Takes back: ${plan.replaced.map((r) => r.sentence).join(' ')}`;
    const replaces = plan.replaced.map((r) => r.sentence).join(' ');
    deps.pb('grammar verdict: accepted (preview, nothing written)');
    if (!instant) deps.say(path, { type: 'suggestion', description, recipe: '', via: 'grammar', ...(replaces !== '' ? { replaces } : {}) });
    return { ok: true, proposal: { description, via: 'grammar', ...(replaces !== '' ? { replaces } : {}), ...(instant ? { instant: true } : {}) } };
  }

  /** The second Enter (or an apply with no preview): the same plan against the bar as it is now, written in one go and recorded for undo. */
  async function applyBar(path: string, text: string, instant = false): Promise<{ ok: boolean; disk?: string; message?: string }> {
    const r = await appendBar(path, text, { loud: true, ...(instant ? { instant: true } : {}) });
    if (!r.ok) {
      const m = r.reason === 'unreadable' ? refusedWords('unreadable', r.message, 1, 1) : r.message;
      deps.pb(`apply failed: ${m}`); deps.setBoxNote(path, m);
      return { ok: false, message: m };
    }
    if (r.unchanged === true) { deps.setBoxNote(path, 'Nothing changed: the bar already says this.'); deps.say(path, { type: 'applied', change: 'unchanged', description: 'the bar already says this' }); return { ok: true, disk: '' }; }
    deps.setBoxNote(path, 'Applied.');
    return { ok: true, disk: '' };
  }

  async function stepBar(path: string, which: 'undo' | 'redo'): Promise<{ ok: boolean; message: string }> {
    const stack = stackOf(path);
    let result: { ok: boolean; message: string } | null = null;
    try {
      await deps.proc(path, (cur) => {
        const insp = inspectMelodyNote(cur);
        if (insp.fence === null) { result = { ok: false, message: 'This note is not a melody bar I can read.' }; return cur; }
        const r = which === 'undo' ? stack.undo(basis(insp).list ?? []) : stack.redo(basis(insp).list ?? []);
        if (r === null) { result = { ok: false, message: which === 'undo' ? 'There is nothing to take back.' : 'There is nothing to put back.' }; return cur; }
        const w = writeMelodyNote(cur, r.list);
        if (w.ok === false) { stack.clear(); result = { ok: false, message: w.message }; return cur; }
        mark(path, w.text);
        result = { ok: true, message: 'removed' in r ? `Removed: ${r.removed.join(' ')}${r.restored.length > 0 ? ` Put back: ${r.restored.join(' ')}` : ''}`.trim() : `Added again: ${r.added.join(' ')}` };
        deps.trace(`[forge-description] applied ${deps.basename(path)} (${which})`);
        return w.text;
      });
    } catch (e) { stack.clear(); const message = `Could not write the bar: ${(e as Error)?.message ?? e}`; console.error('[forge-promptbox] stepBar', e); deps.say(path, { type: 'failed', message }); return { ok: false, message }; }
    const out = result as { ok: boolean; message: string } | null;
    if (out === null) return { ok: false, message: 'The bar was not written.' };
    deps.say(path, { type: 'notice', message: out.message });
    return out;
  }

  const canStepBar = (path: string, which: 'undo' | 'redo', lastText: string | undefined): boolean => {
    if (lastText === undefined) return false;
    const insp = inspectMelodyNote(lastText);
    return insp.fence === null ? false : which === 'undo' ? stackOf(path).canUndo(insp.list) : stackOf(path).canRedo(insp.list);
  };

  /** The note changed and the vault says so (or the note was opened: `auto` false only LOOKS). The LIST edited by hand: the fence follows it (ONE write, the lines before the first unreadable one apply, every line is kept); the FENCE edited outside the list:
   *  the person's data wins and the list starts again from the bar as it is (its head). A list of which no line can be read is never written over the fence. */
  async function evaluateBar(path: string, cur: string, auto: boolean): Promise<void> {
    const insp = inspectMelodyNote(cur);
    const prev = seen.get(path);
    mark(path, cur);
    if (!insp.hasLines || insp.fence === null) { told.delete(path); return; }
    if (insp.replay.stop !== null) {
      const message = stopNotice(insp.replay.stop, insp.replay.applied);
      if (auto && told.get(path) !== `cut:${message}`) { told.set(path, `cut:${message}`); deps.say(path, { type: 'notice', message }); }
    } else told.delete(path);
    if (insp.inSync || !auto) return;
    const listEdited = prev === undefined || prev.block !== barLinesBlock(cur);
    if (listEdited && insp.replay.applied === 0 && insp.list.length > 0) return;
    let wrote = false;
    try {
      await deps.proc(path, (text) => {
        const now = inspectMelodyNote(text);
        if (!now.hasLines || now.inSync || now.fence === null || !same(now.list, insp.list)) return text;
        if (listEdited) { const w = writeMelodyNote(text, now.list); if (w.ok === false) return text; wrote = true; mark(path, w.text); return w.text; }
        const head = headSentence(now.fence);
        const w = head === null ? null : writeMelodyNote(text, [head]);
        const next = w !== null && w.ok === true ? w.text : withoutBarLines(text);
        wrote = true; mark(path, next); return next;
      });
    } catch (e) { console.error('[forge-promptbox] evaluateBar', e); deps.pbWarn(`could not follow the edit of the melody bar: ${(e as Error)?.message ?? e}`); return; }
    if (wrote) {
      if (!listEdited) { stacks.delete(path); deps.trace(`[forge-description] rebased ${deps.basename(path)} (the data was edited outside the list)`); deps.say(path, { type: 'notice', message: REBASED_NOTICE }); return; }
      deps.trace(`[forge-description] applied ${deps.basename(path)} (hand edit of lines: ${insp.replay.applied} line${insp.replay.applied === 1 ? '' : 's'})`);
      deps.say(path, { type: 'notice', message: `The bar follows the list you edited (${insp.replay.applied} line${insp.replay.applied === 1 ? '' : 's'}).` });
    }
  }

  const canonicalOf = (sentence: string, cur: string): string | null => {
    const p = parseMelodySentence(sentence);
    return inspectMelodyNote(cur).fence === null || p.ok === false ? null : renderMelodyLine(p.line);
  };

  return {
    appendBar, previewBar, applyBar, stepBar, canStepBar, evaluateBar, canonicalOf,
    discard(_path: string): void { /* no service plan to cancel */ },
    reset(path: string): void { stacks.delete(path); told.delete(path); },
    dispose(): void { stacks.clear(); told.clear(); },
  };
}

/** The seam's `createBarList`: the rhythm bar's controller, untouched, plus the melody one, each call sent to the kind the note IS. A kind is learned from every text a call is given (the composer reads the note when it mounts: `evaluateBar`, then `previewBar`); a path never seen
 *  goes to the rhythm controller, as every bar always did. A melody sentence typed into a RHYTHM bar is refused in plain words naming both kinds (the rhythm grammar would have said "I do not know how to read it"; the sentence service is not asked about a melody sentence). */
export function createBarListWithMelody(deps: BarListDeps): ReturnType<typeof createBarList> {
  const rhythm = createBarList(deps), melody = createMelodyList(deps);
  const kinds = new Map<string, boolean>();
  const learn = (path: string, text: string | undefined): void => { if (text !== undefined) kinds.set(path, isMelodyNote(text)); };
  const pick = (path: string): ReturnType<typeof createBarList> | ReturnType<typeof createMelodyList> => (kinds.get(path) === true ? melody : rhythm);
  return {
    appendBar: (path, sentence, opts) => pick(path).appendBar(path, sentence, opts),
    previewBar: (path, text, cur, instant) => {
      learn(path, cur);
      if (kinds.get(path) !== true) {
        const first = melodySentencesOf(text)[0];
        if (first !== undefined && MELODY_ONLY.test(first) && parseMelodySentence(first).ok === true) { const m = melodyWordInRhythm(first); deps.say(path, { type: 'notice', message: m }); deps.setBoxNote(path, m); return Promise.resolve({ ok: false as const, message: m }); }
      }
      return pick(path).previewBar(path, text, cur, instant);
    },
    applyBar: (path, text, instant) => pick(path).applyBar(path, text, instant),
    stepBar: (path, which) => pick(path).stepBar(path, which),
    canStepBar: (path, which, lastText) => { learn(path, lastText); return pick(path).canStepBar(path, which, lastText); },
    evaluateBar: (path, cur, auto) => { learn(path, cur); return pick(path).evaluateBar(path, cur, auto); },
    canonicalOf: (sentence, cur) => (isMelodyNote(cur) ? melody.canonicalOf(sentence, cur) : rhythm.canonicalOf(sentence, cur)),
    discard: (path) => { rhythm.discard(path); },
    reset: (path) => { rhythm.reset(path); melody.reset(path); },
    dispose: () => { rhythm.dispose(); melody.dispose(); kinds.clear(); },
  };
}
