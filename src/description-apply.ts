// 2026-11-19-0970 (THE LIST MODEL, stage 1; checklists/music_tabs_chat_ui_design.md section 11): for an ARRANGEMENT and a COMPOSITION the Description is an ordered list of canonical sentences (sentence-list-core.ts): a sentence typed in the composer is
// APPENDED (the preview says what it replaces), the note is rewritten from the whole list in ONE write (commitList), a hand edit of the list is re-read on save (an unreadable line is kept and named in the dialog, the replay stops before it),
// and Cmd/Ctrl+Z (in an empty composer) and the "+" menu undo and redo the last sentence.
// 2026-11-19-0980 (stage 2): a PHRASE is a list too - line 1 is its HEAD (Extend, Mix, Morph or Take), later lines are modifier lines, structure steps, transforms and forks (sentence-list-core.ts, kind 'phrase'); a head replaces line 1; a random line
// draws its seed once (at the preview, the apply writes the SAME one); the composer shows nothing of the list; the bar-selection menu APPENDS its sentence (`appendLine`). Every other note is untouched (P3).
// 2026-11-19-0993 (stage 3: BARS): a bar note (`bars/bar_NNN.md`) is a list too, in its front matter (`lines:`); the Beat Box's gestures and the composer's typed sentences go through `appendLine` (one `process`, one write, undoable); see bar-list-controller.ts.
// 2026-10-31-1140 (M16a): the same controller also hears a hand-edited RECIPE (the Recipe is a source too): it parses (applied by ONE `process`, the Description, Python, json cache and stamps made again from it), it does not parse (nothing is
// written; the bar says the line and the column; Revert), or the Description was edited too (nothing is applied; the bar offers Update from Description / Update from Recipe). One controller and one bar per pane, so a note with two
// things to say is said once. The service is NOT offered for a Recipe (no LLM): a Recipe that does not parse is the person's to fix.
// 2026-10-31-1120 (M15c) - "Update from Description": the controller. It hears the vault's `modify` of a phrase, arrangement or composition note, waits for the person to stop typing (DESCRIPTION_DEBOUNCE_MS), reads the CURRENT text,
// and asks description-apply-core what the Description means: it parses (applied by ONE `process`, the same writers the controls use), it does not parse (nothing is written; the sentence says where; Revert; and, for a phrase, "Ask the
// sentence service", which only ever PREVIEWS), or the derived Recipe / Python was edited (said, not applied). No `obsidian` import: the vault, the clock, the service and the panes are ports (score-first.ts wires them, only in a
// score-first vault: P3).
import { mountDescriptionBar, type BarAction, type BarHandle, type BarView } from './description-bar-dom.ts';
import {
  DESCRIPTION_DEBOUNCE_MS, REVERT_GENERATED_CONFIRM, appliedLine, applyDescriptionText, applyPythonText, applyRecipeText, askedServiceLine, askingServiceLine, cacheParams, changeSummary, descriptionState, familyOfPath, rejectedLine, rejectionMessage, revertDescriptionText, revertToGeneratedText, revertedLine, pythonCustomBarMessage,
  type DescriptionState, type Family,
} from './description-apply-core.ts';
import { bothEditedLine, descriptionHeldLine, recipeAppliedLine, recipeHeldLine, recipeRejectedLine, recipeRevertedLine } from './recipe-apply-core.ts';
import { COMMENTS_NOT_KEPT_BAR, bothEditedLineOf, pythonAppliedLine, pythonCustomLine, pythonRevertedLine } from './python-apply-core.ts';
import { CUSTOM_BANNER } from './phrase-notes-core.ts';
import type { GrammarParams, GrammarVault } from './phrase-grammar-core.ts';
import { buildPlanRequest, interpretPlanResponse, type PlanPayload } from './sentence-plan-core.ts';
import type { FailedPromptsPort } from './failed-prompt-setup-core.ts';
import type { UndoVia } from './undo-trace-core.ts';
import { FAMILY_SERVICE_VERSION, OLD_FAMILY_SERVICE, buildFamilyPlanRequest, compositionLoopRefusal, familyRecipeSteps, interpretFamilyResponse } from './sentence-plan-families-core.ts';
import { versionAtLeast } from './notebook-request-core.ts';
import { readCompositionNote } from './composition-core.ts';
import { phraseDescription, phraseRecipeSteps } from './phrase-notes-core.ts';
import { describe } from './phrase-describe-core.ts';
import { extractDescription } from './v2-note-core.ts';
import { isBarPath, type PhraseParams } from './phrase-core.ts';
import type { BarAppendOpts, BarAppendResult } from './bar-list-controller.ts';
import { listModel } from './list-model-selected.ts';       // 2026-11-19-0997: the bar list and Duplicate come through the list-model seam (music-edition.ts `ListModel`), not by import: the lean bundle carries none of their cores
import type { PromptBoxHandle } from './prompt-box-dom.ts';
import { mountChatPanel, type ChatPanelHandle } from './chat-panel-dom.ts';
import { append, expireOpen, fromOutcome, memoryStore, openSuggestion, resolveSuggestion, type DialogEntry, type DialogEvent, type DialogStore } from './dialog-core.ts';
import { createUndoStack, defaultSeed, drawSeeds, isHeadLine, linesOfParams, planAppend, replayGrammar, splitSaid, withSaid, replay, sentencesOfText, stopNotice, type ListStop, type Plan, type ReplayCtx, type UndoStack } from './sentence-list-core.ts';
import { listOfNote, writeListNote } from './sentence-list-note-core.ts';
import { REDO_ID, REDO_LABEL, UNDO_ID, UNDO_LABEL } from './composer-core.ts';
const TRANSLATE_ID = '__translate__', TRANSLATE_LABEL = 'Translate the waiting line';          // 2026-11-21-1015 (Part C)
import { isEmptyNote } from './empty-note-core.ts';
import { FAMILY_KINDS } from './note-family-core.ts';
import type { ComposerMenuItem, PreviewResult, PromptBoxPorts } from './prompt-box-dom.ts';
import type { ActionRead, ResolvedDuplicate } from './duplicate-sentence-core.ts';
import type { StepPorts } from './typed-step-core.ts';
import type { DuplicateResult } from './duplicate-note-core.ts';
import type { CopyMark, UndoCopyResult } from './duplicate-undo-core.ts';
import type { Proposal } from './composer-core.ts';

export interface DescriptionPorts {
  read(path: string): Promise<string>;
  /** ONE atomic read-modify-write of the note (vault.process): `fn` gets the CURRENT text and returns the new one (the same text = nothing written). */
  process(path: string, fn: (current: string) => string): Promise<void>;
  vault(): GrammarVault;
  barNames(): string[];
  phraseNames(): string[];
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  trace(line: string): void;
  /** 2026-11-13-1211: console.warn for a `[forge-promptbox]` line of a path that gives up (absent = trace). */
  warn?(line: string): void;
  /** Every pane that shows a note right now: its path and the element its content is drawn in (a tab, the notes pane, the text view). */
  panes(): Array<{ path: string; contentEl: HTMLElement; /** 2026-11-12-1203: this pane is a score tab (the phrase, arrangement or composition Score), where the docked prompt box lives; the notes pane and the text view are not. */ tab?: boolean }>;
  /** POST /plan, as the sentence dialog sends it. Absent, or `configured()` false = the service is not offered. */
  askPlan?(payload: PlanPayload): Promise<{ status: number; json: unknown }>;
  /** 2026-11-20-1004: the failed-prompt review queue (the setting `Keep unprocessed sentences for review`, default OFF): a sentence that ends unprocessed is handed to `record`; `known` is the personal table (a resolved sentence typed again is offered through "did you mean"). Absent = nothing is kept (lean, a vault with the setting off). */
  failedPrompts?: FailedPromptsPort;
  configured?(): boolean;
  ownKey?(): string | undefined;
  /** 2026-11-12-1206: the service's /health version, or null. Asked only when an answer to an arrangement or composition sentence carried no version and was a refusal (a service before 0.2.42): to tell an old service from a sentence it cannot plan. */
  serviceVersion?(): Promise<string | null>;
  /** 2026-11-15-1217: is the one status line under the box (2026-11-13-1211) shown? The dialog says every outcome in words, so the default view drops the duplicate; `false` = never drawn (the busy state and the dialog are untouched). Absent = shown, as before. Asked at every outcome (the setting is read live). */
  showBoxStatus?(): boolean;
  /** 2026-11-13-1214: where the dialog's history is kept per note (the plugin's data.json); absent = the session's own memory. */
  dialogStore?: DialogStore;
  /** 2026-11-21-1011: the creation time of the note at this path, or undefined when it cannot be told: the history is kept with it, and a list kept for another creation time (a note re-created at the path) is not shown. */
  noteCtime?(path: string): number | undefined;
  /** The clock of the dialog's time stamps (tests). */
  now?(): number;
  /** Ask the person to confirm a step that loses something ("Revert to generated"); absent = it goes ahead. */
  confirm?(message: string): Promise<boolean>;
  /** 2026-11-17-2001: MUSIC_COMPOSER_AUTO_APPLY (default off): a sentence the grammar reads exactly skips the preview. */
  composerAutoApply?(): boolean;
  /** 2026-11-23-1018: the setting `Forge Description edits at once`. `false` = a hand-edited Description of a music list note WAITS for the Forge button (the strip says so); `true`, or no port (the unit rigs, lean): applied by itself after the debounce, as before. */
  descriptionAtOnce?(): boolean;
  /** 2026-11-19-0980: the seed a random line of a phrase draws, ONCE, when the sentence is typed (a whole number; absent = a random one from 0 to 999). Tests give it a fixed one. */
  drawSeed?(): number;
  /** 2026-11-17-2001: the composer's "+" menu (the New actions; `pickNote` gives "Insert a link to a note"); absent = no "+". */
  composerMenu?(): { items: readonly ComposerMenuItem[]; run(id: string): void; pickNote?(): Promise<string | null> } | undefined;
  /** 2026-11-19-0992: make the copy `Duplicate [[bar_007]].` asks for (a new note under the next free name; nothing that exists is written). Absent = this build cannot copy notes: the sentence is refused in words. */
  duplicate?(of: ResolvedDuplicate): Promise<DuplicateResult>;
  /** 2026-11-19-0992a: take a copy back (Cmd/Ctrl+Z): move it to the trash when its bytes are still what the duplicate wrote (duplicate-undo-core.ts; the plugin's port closes the tabs that show it first). Absent = a copy is never an undo entry and nothing is ever removed. */
  undoCopy?(mark: CopyMark): Promise<UndoCopyResult>;
  /** 2026-11-19-0992: open a note named by a link in the dialog (the copy that was just made), by lineage id (`bars/bar_010`): the plugin's own opener. Absent = the dialog draws no link buttons. */
  openNote?(id: string): void;
}

interface Ui { state: DescriptionState; message?: string; /** 2026-11-22-1016: the driver chose `Keep my script edits`: the list edit is held, the question is not asked again for this text */ kept?: boolean; preview?: { params: GrammarParams; description: string; recipe: string; forSentence: string; /** 2026-11-21-1015: `Translate line N`: the plan REPLACES line N (1-based) of the list instead of being appended */ replaceAt?: number; /** the driver's words the line keeps beside it when the plan is applied (a translate: the box holds `Translate line N.`, the words are the waiting line's) */ said?: string; /** 2026-11-19-0970: for an arrangement or composition the sentence service's answer as canonical LINES to append (and the sentence they replace) */ lines?: string[]; replaces?: string }; busy?: boolean; /** the sentence was typed in the prompt box (nothing was written to the note: there is no Revert to offer) */ fromBox?: boolean; /** from the box: the Description ON DISK when the sentence was sent (a preview is applied only over that) */ base?: string }
const basename = (path: string): string => path.replace(/^.*\//, '').replace(/\.md$/, '');
/** 2026-11-19-0970 and 2026-11-19-0980: the three kinds whose Description is a list of canonical sentences (a phrase, an arrangement, a composition). 2026-11-19-0993 (stage 3): a BAR is a list too (front matter `lines:`), but it is not a `Family` (no grammar of the three, no Recipe, no Python, no stamps): it is routed by its PATH (`isBarPath`) to bar-list-controller.ts, which shares this controller's dialog, tracked write and box. */
type ListFamily = Family;
const isList = (f: Family | null): f is ListFamily => f !== null;

export interface DescriptionController {
  /** The vault says this note changed: evaluate it once the person stops typing. */
  modified(path: string): void;
  /** Look at this note now without applying it (a note opened, a pane moved): the bar shows what is wrong, if anything. */
  inspect(path: string): Promise<void>;
  update(path: string): Promise<void>;
  revert(path: string): Promise<void>;
  ask(path: string): Promise<void>;
  /** Look at every pane that shows one of our notes and has not been looked at yet (a tab opened, a layout restored after a reload): the bar is computed from the note, not only heard from a `modify`. Reads, never writes. */
  inspectOpen(): Promise<void>;
  /** Draw (or take away) the bar in every pane that shows a note with something to say. */
  syncBars(): void;
  /** Is this a custom note the person can revert to the grammar's Python (the palette command's availability; false until the note has been looked at)? */
  canRevertGenerated(path: string): boolean;
  /** "Revert to generated" as a command: asks first, as the button does. */
  revertGenerated(path: string): Promise<void>;
  /** 2026-11-12-1203: put the cursor in the docked prompt box of this note's tab (the first box when no path is given); false = there is none. */
  focusBox(path?: string): boolean;
  /** Apply this text as the note's Description, as the prompt box's Apply does (the existing "Update from Description" writers; a sentence that does not parse writes nothing and the strip says where). */
  applyFromBox(path: string, text: string): Promise<{ ok: boolean; disk?: string }>;
  /** 2026-11-17-2001: what would this sentence do? The grammar first, the sentence service when it cannot read it; NOTHING is written. */
  previewFromBox(path: string, text: string): Promise<PreviewResult>;
  /** 2026-11-17-2001: write what the person saw (the second Enter). */
  applyProposal(path: string, text: string, proposal: Proposal): Promise<{ ok: boolean; disk?: string; message?: string }>;
  /** 2026-11-19-0980: APPEND one canonical sentence to the note's list now (the bar-selection menu's Keep, Delete, Copy and Move; stage 3's grid clicks): one write, undoable, the composer's text left alone. `message` says what was added, or why not (in words). */
  appendLine(path: string, sentence: string, opts?: BarAppendOpts): Promise<{ ok: boolean; message: string } & Partial<Pick<BarAppendResult, 'data' | 'reason' | 'unchanged'>>>;
  /** 2026-11-19-0992a (R1; it was "the text is Duplicate" in 0992): is the NEXT click on a bar of this note's Score a link click? True in a PHRASE tab whose composer has ANY text (trimmed). */
  duplicateArmed(path: string): boolean;
  /** The click on a bar while the phrase composer has text. 2026-11-19-0996b: with a bar word FIRST in the text (Duplicate, Copy, Move, Delete, Remove, Keep, Morph, Mix, Extend) it inserts ` bar 3` (then ` and bar 5`) at the caret (`bar` = the bar's number in the Score now); 2026-11-19-0992a: with any other text the link ` [[name]]` of the note `noteId` (a lineage id like `bars/bar_007`) goes in at the caret. Focus back, no preview, no pin. */
  duplicateClick(path: string, noteId: string | null, bar?: number | null): Promise<{ ok: boolean; message: string }>;
  /** 2026-11-19-0970 (the list model): take back the last sentence of an arrangement's or composition's list (Cmd/Ctrl+Z in an empty composer, the "+" menu), and put it back. One write each; the dialog says what was removed or added again. */
  undoLast(path: string, via?: UndoVia): Promise<{ ok: boolean; message: string }>;
  redoLast(path: string, via?: UndoVia): Promise<{ ok: boolean; message: string }>;
  /** Is there a sentence to take back / to put back (the menu items are shown disabled when not)? Answered from the last text this controller saw of the note. */
  canUndo(path: string): boolean;
  canRedo(path: string): boolean;
  /** Is there something for "Update from Description" to do on this note (the command's availability)? */
  canUpdate(path: string): boolean;
  /** "Restore to last commit" is about to replace this note's text: whatever was pending (a hand edit waiting out its 600 ms) is DROPPED, never applied to the restored text. */
  drop(path: string): void;
  /** ... and it has: forget every bar, sentence and told line for the note, then look at the text now on disk (reads, never writes). */
  reset(path: string): Promise<void>;
  dispose(): void;
}

export function createDescriptionController(ports: DescriptionPorts): DescriptionController {
  const ui = new Map<string, Ui>();
  const timers = new Map<string, unknown>();
  const told = new Map<string, string>();                         // path -> the sentence an evidence line was last written for (a rejected sentence is said once, not at every unrelated modify)
  const bars = new Map<HTMLElement, BarHandle>();
  const notices = new Map<string, { message: string; text: string; /** 2026-11-13-1214: it came from the box: said in the dialog, never in the strip */ fromBox?: boolean }>();     // path -> a sentence that stays on the note's bar after a successful apply (D4: comments dropped), until the note's text changes
  const sentHistory = new Map<string, string[]>();                // 2026-11-17-2001: the sentences sent from each note (Up recalls them), in memory
  const askMessage = new Map<string, string>();                   // 2026-11-17-2001: why the last service request ended without a preview (a drop, a refusal): the preview's answer to the composer
  const asked = new Map<string, { sentence: string; question: string }>();                       // 2026-11-20-1003: the clarifying question the service last asked of this note: the NEXT sentence that needs the service goes back with it, once
  const undoTrace = listModel.trace.create({ now: Date.now, expose: globalThis });          // 2026-11-20-1004z (4a): music edition only (lean: a stub that keeps nothing)
  const fpReal = listModel.review.track(ports, familyOfPath);          // 2026-11-20-1004: the failed-prompt review queue's bookkeeping (null: no queue)
  let fpHold = 0;          // 2026-11-21-1015: while the service is asked FIRST for a place-word sentence a refusal is not yet a failure (the repair may mend it): the record is made after, only when nothing did
  const fp = fpReal === null ? null : { ...fpReal, fail: (...a: Parameters<typeof fpReal.fail>): void => { if (fpHold === 0) fpReal.fail(...a); }, ended: (...a: Parameters<typeof fpReal.ended>): void => { if (fpHold === 0) fpReal.ended(...a); } };
  const cancelledAsk = new Set<string>();                         // 2026-11-17-2001: Esc while the service thinks: its answer is dropped
  const looked = new WeakMap<HTMLElement, string>();              // pane element -> the note path it was last looked at for (a pane is read once per note it shows)
  let disposed = false;
  // ---- 2026-11-13-1214: the dialog. The history of what happened to a note's Description (per note, newest last, capped), the last note text we saw (to tell a control's change from a hand edit), the pinned "Current:" line.
  const store: DialogStore = ports.dialogStore ?? memoryStore();
  const dialogs = new Map<string, DialogEntry[]>();
  const dialogCtime = new Map<string, number | undefined>();          // 2026-11-21-1011: the creation time each cached list was loaded for
  const lastText = new Map<string, string>();
  const nowMs = (): number => (ports.now ? ports.now() : Date.now());
  const ctimeOf = (path: string): number | undefined => ports.noteCtime?.(path);
  const historyOf = (path: string): DialogEntry[] => { const c = ctimeOf(path); let l = dialogs.get(path); if (l && dialogCtime.get(path) !== c) l = undefined; if (!l) { l = store.entries(path, c); dialogs.set(path, l); dialogCtime.set(path, c); } return l; };          // a cached list is not trusted when the note under the path is another one
  const currentOf = (path: string): string => { const t = lastText.get(path); return t === undefined ? '' : extractDescription(t).replace(/\s+/g, ' ').trim(); };
  const drawDialog = (path: string): void => { const h = historyOf(path), c = currentOf(path); for (const b of boxes.values()) if (b.path === path) b.chat.render(h, c); };
  /** ONE event stream: what the controller says happened to the Description. Only a box-origin outcome is drawn here (the strip keeps the text view's and the hand edits'). */
  const say = (path: string, ev: DialogEvent): void => {
    let l = historyOf(path);
    if (ev.type === 'suggestion' || ev.type === 'you') l = expireOpen(l);                                  // a new sentence or a newer suggestion ends the older one
    l = append(l, fromOutcome(ev), nowMs());
    dialogs.set(path, l); store.setEntries(path, l, ctimeOf(path)); drawDialog(path);
  };
  const endSuggestion = (path: string, state: 'applied' | 'cancelled' | 'expired'): void => {
    const l = historyOf(path), open = openSuggestion(l); if (!open) return;
    const next = resolveSuggestion(l, open.id, state); dialogs.set(path, next); store.setEntries(path, next, ctimeOf(path)); drawDialog(path);
  };
  // 2026-11-13-1214: every write of the controller goes through here: the text it wrote is the last text seen, so the vault's own `modify` for it is never taken for a control's change.
  const proc = async (path: string, fn: (cur: string) => string): Promise<void> => {
    let out: string | undefined;
    await ports.process(path, (cur) => { const next = fn(cur); out = next; return next; });
    if (out !== undefined) lastText.set(path, out);
  };
  // 2026-11-13-1211: every decision of the prompt box's Apply is ONE line at console.info with this prefix; a path that GIVES UP says so at console.warn too. No token or URL value is ever in a line.
  const pb = (line: string): void => { ports.trace(`[forge-promptbox] ${line}`); };
  const pbWarn = (line: string): void => { ports.trace(`[forge-promptbox] ${line}`); (ports.warn ?? (() => {}))(`[forge-promptbox] ${line}`); };

  const waitsForForge = (): boolean => listModel.script.on && ports.descriptionAtOnce?.() === false;          // 2026-11-23-1018: a hand edit of the Description is applied by the Forge button, not by itself
  const keptList = new Map<string, string>();                    // 2026-11-22-1016: path -> the list text the driver chose to hold (Keep my script edits): not asked again for that text
  const scriptAndList = (facets: readonly string[]): boolean => facets.length === 2 && facets.includes('description') && facets.includes('recipe');
  const viewOf = (path: string, u: Ui): BarView => {
    const family = familyOfPath(path);
    const st = u.state;
    if (u.preview) return { message: u.message ?? 'The sentence service suggests this. Nothing is written until you press Apply.', actions: ['apply-preview', 'cancel-preview'], preview: { description: u.preview.description, recipe: u.preview.recipe }, busy: u.busy };
    if (st.kind === 'rejected') {
      const offer = ports.askPlan !== undefined && ports.configured?.() !== false;               // 2026-11-12-1206: a phrase, an arrangement or a composition (forge-transpile 0.2.48 plans all three)
      return { message: u.message ?? st.message, actions: [...(u.fromBox ? [] : ['revert' as const]), ...(offer ? ['ask' as const] : [])], busy: u.busy };
    }
    if (st.kind === 'apply' && waitsForForge()) return { message: u.message ?? 'The Description was edited. Click Forge to apply it.', actions: ['update', 'revert'], labels: { update: 'Forge' }, busy: u.busy };          // 2026-11-23-1018: pending, muted; the button is `Forge`
    if (st.kind === 'apply') return { message: u.message ?? `The Description changed (${st.change}); update the note from it.`, actions: ['update', 'revert'], busy: u.busy };
    if (st.kind === 'recipe-rejected') return { message: u.message ?? st.message, actions: ['revert'], busy: u.busy };               // no "Ask the sentence service" for a Recipe: no LLM, the person fixes it
    if (st.kind === 'recipe-apply' && listModel.script.on) return { message: u.message ?? listModel.script.stale(st.unchanged ? 'edited, the same music' : st.change), actions: ['update-recipe', 'revert'], labels: { 'update-recipe': listModel.script.labels.rewrite, revert: listModel.script.labels.discard }, busy: u.busy };          // 2026-11-22-1016 (11i): the list is marked, never rewritten at once
    if (st.kind === 'recipe-apply') return { message: u.message ?? `The Recipe changed (${st.change}); update the note from it.`, actions: ['update-recipe', 'revert'], busy: u.busy };
    if (st.kind === 'python-apply') return { message: u.message ?? `The Python changed (${st.change}); update the note from it.`, actions: ['update-python', 'revert'], busy: u.busy };
    if (st.kind === 'python-custom') return { message: u.message ?? pythonCustomBarMessage(st.already), actions: ['update-python', 'revert'], busy: u.busy };
    if (st.kind === 'custom-note') return { message: u.message ?? CUSTOM_BANNER, actions: st.canRevert ? ['revert-generated'] : [], busy: u.busy, tone: 'custom' };
    if (st.kind === 'both-edited' && listModel.script.on && scriptAndList(st.facets)) {                                       // 2026-11-22-1016 (11i): a list edit meets a Recipe that holds edits: asked ONCE
      const L = listModel.script.labels;
      return u.kept ? { message: u.message ?? listModel.script.held(), actions: ['update-recipe', 'update'], labels: { 'update-recipe': L.rewrite, update: L.discard }, busy: u.busy }
        : { message: u.message ?? listModel.script.askOnce, actions: ['keep-script', 'update'], labels: { 'keep-script': L.keep, update: L.replace }, busy: u.busy };
    }
    if (st.kind === 'both-edited') return { message: u.message ?? st.message, actions: st.facets.map((f) => (f === 'description' ? 'update' : f === 'recipe' ? 'update-recipe' : 'update-python') as BarAction), busy: u.busy };
    return { message: '', actions: [] };
  };

  const syncBars = (): void => {
    if (disposed) return;
    const live = new Set<HTMLElement>();
    for (const { path, contentEl } of ports.panes()) {
      const u0 = ui.get(path);
      const u = u0 && !u0.fromBox ? u0 : undefined;                                                          // 2026-11-13-1214: what came from the BOX is said in the dialog; the strip keeps the text view's and the hand edits'
      const n0 = notices.get(path);
      const n = n0 && !n0.fromBox ? n0 : undefined;
      if ((!u || u.state.kind === 'synced') && !n) continue;
      live.add(contentEl);
      let h = bars.get(contentEl);
      if (h && !contentEl.contains(h.el)) { h.dispose(); h = undefined; bars.delete(contentEl); }                // 2026-11-13-1214: a tab with the chat panel keeps its bar inside the body that scrolls, so `contains`, not `parentElement`                  // the pane emptied itself (a reload): draw again
      if (!h) { h = mountDescriptionBar(contentEl, (a) => { void act(path, a); }); bars.set(contentEl, h); }
      h.show(u ? viewOf(path, u) : { message: n!.message, actions: [] });
    }
    for (const [el, h] of [...bars]) if (!live.has(el)) { h.dispose(); bars.delete(el); }
    syncBoxes();
  };

  // ---- 2026-11-12-1203: the docked prompt box. An EDITOR VIEW of the Description facet on a score tab (the note on disk stays the only source of truth); the controls' writes reach it through the vault's `modify`.
  const boxes = new Map<HTMLElement, { path: string; handle: PromptBoxHandle; chat: ChatPanelHandle }>();
  const mounting = new Map<HTMLElement, string>();          // 2026-11-21-1012 (N2): pane element -> the note whose composer is being mounted there (a mount reads the note first): only the NEWEST request for a pane may finish
  /** 2026-11-21-1012 (N2): a composer acts on ITS note only while its pane still shows that note; otherwise nothing is undone ("Nothing to undo in this note." in the dialog of the note the pane shows) and the pane gets its own composer. */
  const guarded = (contentEl: HTMLElement, path: string, run: () => void): void => {
    const now = ports.panes().find((p) => p.contentEl === contentEl);
    if (now !== undefined && now.path === path) { run(); return; }
    pb(`undo refused: this composer belongs to ${basename(path)} but its tab shows ${now ? basename(now.path) : 'no note'}`);
    if (now !== undefined) say(now.path, { type: 'notice', message: 'Nothing to undo in this note.' });
    syncBoxes();
  };
  const descriptionOf = async (path: string): Promise<string | null> => { try { return extractDescription(await ports.read(path)); } catch { return null; } };
  /** 2026-11-19-0970 and 2026-11-19-0980: what the composer's text area shows of the note: NOTHING of a phrase's, an arrangement's or a composition's list (the list is in the note and the dialog, the prompt line is for the next sentence). */
  const boxDisk = (family: Family | null, text: string): string => (isList(family) ? '' : extractDescription(text));
  const boxDescriptionOf = async (path: string): Promise<string | null> => { if (isBarPath(path)) return ''; try { return boxDisk(familyOfPath(path), await ports.read(path)); } catch { return null; } };        // 2026-11-19-0993: a bar's composer shows nothing of its list either
  const syncBoxes = (): void => {
    if (disposed) return;
    const live = new Set<HTMLElement>();
    for (const { path, contentEl, tab } of ports.panes()) {
      const barPane = isBarPath(path);                                                                       // 2026-11-19-0993: the Beat Box tab of a bar carries the composer too (its sentences are the bar grammar's)
      if (tab !== true || (familyOfPath(path) === null && !barPane)) continue;
      if (ui.get(path)?.state.kind === 'custom-note') continue;                                              // a custom note: its Python is the source, the Description is not applied: no box
      live.add(contentEl);
      const have = boxes.get(contentEl);
      if (have && have.path === path && have.chat.attached()) continue;
      if (have) { have.chat.dispose(); boxes.delete(contentEl); }
      mounting.set(contentEl, path);
      void (async () => {
        let note = ''; try { note = await ports.read(path); } catch { return; }
        if (disposed || mounting.get(contentEl) !== path || !ports.panes().some((p) => p.contentEl === contentEl && p.path === path)) return;          // a newer request, or the tab moved to another note while the note was read: this composer is not wanted
        mounting.delete(contentEl);                                                                          // (a newer request would have changed `mounting`: there is no older box here to take down)
        const family = barPane ? null : familyOfPath(path)!;
        if (!lastText.has(path)) lastText.set(path, note);                                                // 2026-11-13-1214: the text the first control change is compared with
        const chat = mountChatPanel(contentEl, {
          box: {
            preview: (text, o) => previewFromBox(path, text, o?.instant === true),
            apply: (text, proposal) => applyProposal(path, text, proposal),
            cancel: () => { cancelledAsk.add(path); },
            discard: () => { discardPreview(path); },
            autoApply: () => ports.composerAutoApply?.() === true,
            menu: barPane || isList(family) ? withListMenu(path, ports.composerMenu?.(), contentEl) : ports.composerMenu?.(),
            history: { get: () => sentHistory.get(path) ?? [], set: (next) => { sentHistory.set(path, [...next]); } },
            ...(barPane || isList(family) ? { undo: (via) => { guarded(contentEl, path, () => { void undoLast(path, via); }); }, redo: (via) => { guarded(contentEl, path, () => { void redoLast(path, via); }); } } : {}),         // 2026-11-19-0970: Cmd/Ctrl+Z in an EMPTY composer
          },
          store,
          ...(ports.openNote ? { openNote: ports.openNote } : {}),
          ...(listModel.script.on && (barPane || isList(family)) ? { insertLink: (name: string) => { boxes.get(contentEl)?.handle.insertAtCaret((before) => listModel.duplicate.linkInsertion(before, name)); } } : {}),          // 2026-11-23-1018 (Part C): a click on a link of the dialog while the composer is being typed in writes the link there
        }, barPane ? '' : boxDisk(family, note));
        const handle = chat.box;
        boxes.set(contentEl, { path, handle, chat });
        drawDialog(path);
        if (!barPane && isEmptyNote(note)) handle.focus();                                                                // 2026-11-19-0960: a NEW note is empty: the tab opens with the composer focused and nothing else to do
        pb(`box mounted: ${basename(path)} family=${family ?? 'bar'} askPlan=${ports.askPlan === undefined ? 'absent' : 'present'} configured=${ports.configured === undefined ? 'unset' : String(ports.configured())}`);       // 2026-11-13-1211: the first line the driver sees on opening a tab: this build is live and the service gate says what it will do before Apply is pressed
      })();
    }
    for (const [el, b] of [...boxes]) if (!live.has(el)) { b.chat.dispose(); boxes.delete(el); }
  };
  const boxText = (path: string): string | undefined => { for (const b of boxes.values()) if (b.path === path) return b.handle.state().text; return undefined; };
  const setBoxBusy = (path: string, message: string | null): void => { for (const b of boxes.values()) if (b.path === path) b.handle.setBusy(message); };
  const setBoxNote = (path: string, message: string | null): void => { if (message !== null && ports.showBoxStatus && !ports.showBoxStatus()) return; for (const b of boxes.values()) if (b.path === path) b.handle.setNote(message); };        // 2026-11-15-1217: the status line is the legacy view; a clear (null) always goes through
  /** 2026-11-19-0993 (THE LIST MODEL, stage 3: BARS): a bar note is a list too (`lines:`); its half of this controller (bar-list-controller.ts) shares the dialog, the tracked write, the box and the trace lines. A bar is routed to it by its PATH (`isBarPath`), never by `familyOfPath`. */
  /** 2026-11-20-1003: a BAR sentence the bar grammar cannot read goes to the service (the request, the answer and the older-service words live in service-lines-core, behind the seam; lean: null = not offered). */
  const askBarLines = (path: string, sentence: string, list: readonly string[], check: Parameters<typeof listModel.service.read>[1]) => listModel.service.askBar({
    askPlan: ports.askPlan, configured: ports.configured, barNames: () => ports.barNames(), ownKey: () => ports.ownKey?.(), sentence, list, check, previous: asked.get(path),
    remember: (q) => { if (q === null) asked.delete(path); else asked.set(path, q); }, asking: () => { say(path, { type: 'asking' }); ports.trace(askingServiceLine(basename(path))); }, trace: (o) => ports.trace(askedServiceLine(basename(path), o)),
  });
  const bar = listModel.createBarList({ review: fp, askLines: (path, sentence, list, check) => askBarLines(path, sentence, list, check), proc: (path, fn) => proc(path, fn), say: (path, ev) => say(path, ev), pb: (line) => pb(line), pbWarn: (line) => pbWarn(line), trace: (line) => ports.trace(line), setBoxNote: (path, m) => setBoxNote(path, m), endSuggestion: (path, state) => endSuggestion(path, state), basename });
  /** The Description on disk, again, into every box of this note (a control wrote it, a hand edit, an apply): unapplied typing is never overwritten (the box offers the choice). */
  const refreshBoxes = async (path: string): Promise<void> => {
    if (disposed) return;
    syncBoxes();                                                                                       // a tab that rebuilt itself took its box with it: draw it again
    const targets = [...boxes.values()].filter((b) => b.path === path);
    if (targets.length === 0) return;
    const d = await boxDescriptionOf(path);
    if (d === null) return;
    for (const b of targets) b.handle.setDisk(d);
    await noticeControlChange(path);
    drawDialog(path);
  };
  /** 2026-11-13-1214: a control (not this controller, not a hand edit) changed the note: the Description on disk moved and the note says the same thing in every facet (synced). A hand edit is not synced at the moment it is heard. */
  async function noticeControlChange(path: string): Promise<void> {
    const family = familyOfPath(path); if (family === null) return;
    let text: string; try { text = await ports.read(path); } catch { return; }
    const prev = lastText.get(path); lastText.set(path, text);
    if (prev === undefined || extractDescription(prev) === extractDescription(text)) return;
    if (descriptionState(text, family, ports.vault()).kind !== 'synced') return;
    const before = cacheParams(prev, family), after = cacheParams(text, family);
    const summary = before && after ? changeSummary(before, after) : 'the Description changed';
    pb(`control change: ${basename(path)} (${summary})`);
    say(path, { type: 'control', summary, description: extractDescription(text) });
  }
  /** Apply the box's text: the Description facet is replaced and the note made again from it in ONE `process` (the same writers the controls and "Update from Description" use). A sentence that does not parse, or a note whose Recipe or
   *  Python were edited too, writes NOTHING: the strip at the top says where (line and column), and the box keeps the text. */
  async function applyFromBox(path: string, text: string): Promise<{ ok: boolean; disk?: string }> {
    pb(`apply pressed: ${basename(path)} family=${familyOfPath(path) ?? 'none'} text=${text.length} chars`);
    try { return await applyFromBoxCore(path, text); }
    catch (e) {                                                                                           // 2026-11-13-1211: the box used to swallow a throw here (the text stayed "edited, not applied", the console empty): it is said now, in the console and under the box
      const why = (e as Error)?.message ?? String(e);
      pbWarn(`apply failed: ${why}`); console.error('[forge-promptbox] apply failed', e);
      setBoxNote(path, `Apply failed: ${why}`); say(path, { type: 'failed', message: why });
      return { ok: false };
    }
  }
  async function applyFromBoxCore(path: string, text: string, said = false, instant = false, original?: string): Promise<{ ok: boolean; disk?: string; message?: string }> {
    const typed = listModel.typed.apply(path, text, said, stepPorts); if (typed !== null) return typed;          // 2026-11-20-1002: a typed Undo or Redo (every composer): the stack's own take-back, never a line of a list
    if (isBarPath(path)) { if (!said) say(path, { type: 'you', text }); return bar.applyBar(path, text, instant); }       // 2026-11-19-0993: the typed sentences in the bar grammar, appended to the bar's list
    const family = familyOfPath(path); if (family === null) { pbWarn(`ask skipped: ${path} is not a phrase, arrangement or composition note`); return { ok: false }; }
    if (!said) say(path, { type: 'you', text });                                                          // 2026-11-13-1214: the sentence as typed, when Apply is pressed (2026-11-17-2001: said already when the preview was asked for)
    if (family === 'phrase') { const act = listModel.duplicate.readActionText(text); if (act.kind === 'duplicate' || act.kind === 'refused') return applyAction(path, act); }          // 2026-11-19-0992: an action never touches the list: no process call, no write of this note
    return applyList(path, family, text, instant, original);                                                       // 2026-11-19-0970 / 0980: a sentence is APPENDED to the list of a phrase, an arrangement or a composition
  }
  const set = (path: string, u: Ui | null): void => { if (u === null || u.state.kind === 'synced') ui.delete(path); else { ui.set(path, u); notices.delete(path); } syncBars(); };

  async function evaluate(path: string, auto: boolean): Promise<void> {
    if (disposed) return;
    if (isBarPath(path)) { let t = ''; try { t = await ports.read(path); } catch { return; } await bar.evaluateBar(path, t, auto); syncBoxes(); return; }       // 2026-11-19-0993: a hand edit of a bar's `lines:` (opening only LOOKS)
    const family = familyOfPath(path);
    if (family === null) return;
    let text: string;
    try { text = await ports.read(path); } catch { return; }                                             // the note went away: nothing to say
    // 2026-11-13-1209 (A): a sentence typed in the BOX that the grammar rejected lives ONLY in `ui` (nothing was written for it). While it is waiting for the service (busy) or showing the service's PREVIEW, it is OWNED by the box:
    // the Description on disk being unchanged (a vault `modify`, a file-open, a layout change all re-read it) is no reason to forget it. Without this, evaluate() found the note `synced` and deleted the entry, and the answer
    // that came back 1 to 3 s later found nothing and was dropped without a word. The person releases it: Cancel, applying the preview, editing the box text, or applying the box.
    const held = ui.get(path);
    if (held?.fromBox && (held.busy || held.preview) && held.state.kind === 'rejected' && boxText(path) === held.state.sentence && extractDescription(text) === held.base) return;
    if (notices.get(path)?.text !== text) notices.delete(path);                                          // D4: a sentence about an apply is for the text that apply wrote; any other text has moved on
    const st = descriptionState(text, family, ports.vault());
    if (st.kind === 'synced') { told.delete(path); set(path, null); return; }
    if (st.kind === 'custom-note') { told.delete(path); set(path, { state: st }); return; }
    if (st.kind === 'both-edited') {
      const said = st.facets.join('+');
      if (told.get(path) !== `both:${said}`) { told.set(path, `both:${said}`); ports.trace(said === 'description+recipe' ? bothEditedLine(basename(path)) : bothEditedLineOf(basename(path), st.facets)); }
      set(path, { state: st, ...(listModel.script.on && scriptAndList(st.facets) && keptList.get(path) === extractDescription(text) ? { kept: true } : {}) });
      return;
    }
    if (st.kind === 'python-apply' || st.kind === 'python-custom') { if (auto) await doApplyPython(path, family, st); else set(path, { state: st }); return; }
    if (st.kind === 'recipe-rejected') {
      if (told.get(path) !== `recipe:${st.recipe}`) { told.set(path, `recipe:${st.recipe}`); ports.trace(recipeRejectedLine(basename(path), st.error)); }
      set(path, { state: st });
      return;
    }
    if (st.kind === 'recipe-apply') {
      if (listModel.script.on) { if (told.get(path) !== `held:${st.recipe}`) { told.set(path, `held:${st.recipe}`); ports.trace(recipeHeldLine(basename(path))); } set(path, { state: st }); return; }          // 2026-11-22-1016 (11i): the list is marked, not rewritten; the driver chooses
      if (auto) await doApplyRecipe(path, family, st); else set(path, { state: st }); return;
    }
    if (st.kind === 'rejected') {
      if (told.get(path) !== st.sentence) { told.set(path, st.sentence); ports.trace(rejectedLine(basename(path), st.error)); }
      const keep = ui.get(path);
      set(path, { state: st, preview: keep?.preview?.forSentence === st.sentence ? keep.preview : undefined, message: keep?.preview?.forSentence === st.sentence ? keep.message : undefined });
      return;
    }
    if (auto && !waitsForForge()) await doApply(path, family, st);
    else {
      if (auto && told.get(path) !== `pending:${st.sentence}`) { told.set(path, `pending:${st.sentence}`); ports.trace(descriptionHeldLine(basename(path))); }          // 2026-11-23-1018: said once per edit
      set(path, { state: st });
    }
  }

  /** The Python was edited: a known shape maps back (the same `process` as for a Description or a Recipe, then the note is Python-sourced); anything else makes the note CUSTOM (its Python is kept as typed). */
  async function doApplyPython(path: string, family: Family, st: Extract<DescriptionState, { kind: 'python-apply' | 'python-custom' }>): Promise<void> {
    let change = '', failure: string | null = null, stale = false, custom = false, dropped = false;
    if (st.kind === 'python-apply') { const loop = await loopRefusalOf(noteId(path), st.params); if (loop !== null) { ports.trace(`[forge-description] refused ${basename(path)}: ${loop}`); set(path, { state: st, message: `Not applied: ${loop}` }); return; } }
    try {
      await proc(path, (cur) => {
        const r = applyPythonText(cur, basename(path), family, ports.vault(), st.python);
        if (r.ok === false) { failure = r.message; stale = r.stale; return cur; }
        change = r.change; custom = r.custom; dropped = r.commentsDropped;
        return r.text;
      });
    } catch (e) { failure = `Update from Python: ${(e as Error)?.message ?? e}`; console.error('python-apply: could not write the note', e); }
    if (failure === null) {
      told.delete(path); ports.trace(custom ? pythonCustomLine(basename(path)) : pythonAppliedLine(basename(path), change, dropped)); set(path, null);
      if (dropped) { try { notices.set(path, { message: COMMENTS_NOT_KEPT_BAR, text: await ports.read(path) }); syncBars(); } catch { /* the note went away: nothing to say */ } }       // D4: the person's comments are gone; said on the bar until the note changes again
      if (custom) await evaluate(path, false);
      return;                                                                                                 // a custom note keeps its banner
    }
    if (stale) { await evaluate(path, false); return; }                                                    // the text moved on: what it says now is read afresh (a newer edit has its own timer)
    set(path, { state: st, message: failure });
  }

  /** "Revert to generated": the grammar's Python from the json cache (after the person confirms what is lost). */
  async function revertGenerated(path: string): Promise<void> {
    const family = familyOfPath(path); if (family === null) return;
    { let now = ''; try { now = await ports.read(path); } catch { /* the write below says so */ }                  // 2026-11-19-0945: the tenth path (0910 guarded nine): the json cache's composition may loop NOW (another composition changed since): the same check, BEFORE the confirm and the write
      const prev = now === '' ? null : cacheParams(now, family); const loop = prev !== null ? await loopRefusalOf(noteId(path), prev) : null;
      if (loop !== null) { ports.trace(`[forge-description] refused ${basename(path)}: ${loop}`); const keep = ui.get(path); set(path, { state: keep?.state ?? { kind: 'synced' }, message: `Revert to generated: ${loop}` }); return; } }
    if (ports.confirm && !(await ports.confirm(REVERT_GENERATED_CONFIRM))) return;
    let failure: string | null = null;
    try { await proc(path, (cur) => { const r = revertToGeneratedText(cur, basename(path), family); if (r.ok === false) { failure = r.message; return cur; } return r.text; }); } catch (e) { failure = `Revert to generated: ${(e as Error)?.message ?? e}`; }
    if (failure !== null) { const keep = ui.get(path); set(path, { state: keep?.state ?? { kind: 'synced' }, message: failure }); return; }
    told.delete(path); ports.trace(pythonRevertedLine(basename(path))); set(path, null);
  }

  /** The Recipe parsed: ONE `process` makes every derived part again from it (the plan re-decided on the CURRENT text inside the write, against the Recipe that was planned). */
  async function doApplyRecipe(path: string, family: Family, st: Extract<DescriptionState, { kind: 'recipe-apply' }>): Promise<void> {
    let change = '', failure: string | null = null, stale = false;
    { const loop = await loopRefusalOf(noteId(path), st.params); if (loop !== null) { ports.trace(`[forge-description] refused ${basename(path)}: ${loop}`); set(path, { state: st, message: `Not applied: ${loop}` }); return; } }
    let was = '', now = '';
    try {
      await proc(path, (cur) => {
        const r = listModel.script.on ? listModel.script.rewrite(cur, basename(path), family, ports.vault(), st.recipe) : applyRecipeText(cur, basename(path), family, ports.vault(), st.recipe);         // 2026-11-22-1016: on request, keeping the driver's words and waiting lines; a script the sentences cannot say is refused
        if (r.ok === false) { failure = r.message; stale = r.stale; return cur; }
        change = r.change; was = cur; now = r.text;
        return r.text;
      });
    } catch (e) { failure = `Update from Recipe: ${(e as Error)?.message ?? e}`; console.error('recipe-apply: could not write the note', e); }
    if (failure === null) { told.delete(path); ports.trace(recipeAppliedLine(basename(path), change)); pushScriptUndo(path, family, was, now); set(path, null); return; }
    if (stale) { await evaluate(path, false); return; }                                                    // the text moved on: what it says now is read afresh (a newer edit has its own timer)
    set(path, { state: st, message: failure });
  }

  /** A note whose Description AND Recipe were edited, and the person chose the Description: it is applied as it stands (the Recipe edit is dropped), decided on the CURRENT text inside the write. */
  async function doApplyDescriptionOver(path: string, family: Family): Promise<void> {
    let change = '', failure: string | null = null, cut: Awaited<ReturnType<typeof listCut>> | null = null;
    { let now = ''; try { now = await ports.read(path); } catch { /* the note went away: the write below says so */ }
      const chosen = now === '' ? null : descriptionState(now, family, ports.vault(), 'description');
      cut = chosen !== null && chosen.kind === 'apply' ? await listCut(path, family, chosen) : null;
      const loop = cut?.refuse ?? null;
      if (loop !== null) { ports.trace(`[forge-description] refused ${basename(path)}: ${loop}`); const keep = ui.get(path); set(path, { state: keep?.state ?? { kind: 'synced' }, message: `Not applied: ${loop}` }); return; } }
    let was = '', now = '';
    try {
      await proc(path, (cur) => {
        const r = applyDescriptionText(cur, basename(path), family, ports.vault(), extractDescription(cur), 'description', cut?.limit);
        if (r.ok === false) { failure = r.message; return cur; }
        change = r.change; was = cur; now = r.text;
        return r.text;
      });
    } catch (e) { failure = `Update from Description: ${(e as Error)?.message ?? e}`; console.error('description-apply: could not write the note', e); }
    if (failure === null) { told.delete(path); keptList.delete(path); ports.trace(appliedLine(basename(path), change)); pushScriptUndo(path, family, was, now); set(path, null); if (cut !== null) sayCut(path, cut); return; }
    const keep = ui.get(path); set(path, { state: keep?.state ?? { kind: 'synced' }, message: failure });
  }

  async function doApply(path: string, family: Family, st: Extract<DescriptionState, { kind: 'apply' }>): Promise<void> {
    let change = '', failure: string | null = null, stale = false;
    const cut = await listCut(path, family, st);                                                            // 2026-11-19-0970: a hand-edited LIST applies the lines before the first one that cannot be read or would loop
    { const loop = cut.refuse; if (loop !== null) { ports.trace(`[forge-description] refused ${basename(path)}: ${loop}`); set(path, { state: st, message: `Not applied: ${loop}` }); return; } }
    let was = '', now = '';
    try {
      await proc(path, (cur) => {
        const r = applyDescriptionText(cur, basename(path), family, ports.vault(), st.sentence, undefined, cut.limit);
        if (r.ok === false) { failure = r.message; stale = r.stale; return cur; }
        change = r.change; was = cur; now = r.text;
        return r.text;
      });
    } catch (e) { failure = `Update from Description: ${(e as Error)?.message ?? e}`; console.error('description-apply: could not write the note', e); }
    if (failure === null) { told.delete(path); ports.trace(appliedLine(basename(path), change)); if (waitsForForge()) pushScriptUndo(path, family, was, now); set(path, null); sayCut(path, cut); return; }          // 2026-11-23-1018: the Forge button's write is ONE undo entry carrying the whole note (what the hand edit was and what the replay made)
    if (stale) { await evaluate(path, false); return; }                                                    // the text moved on: what it says now is read afresh (a newer edit has its own timer)
    set(path, { state: st, message: failure });                                                            // the sentence parsed but the note could not be written: the bar says why and still offers Update and Revert
  }

  /** A button inside the dialog's suggestion message: the same two actions the strip's preview had. */
  async function choose(path: string, id: number, choice: 'apply' | 'cancel'): Promise<void> {
    const open = openSuggestion(historyOf(path));
    if (!open || open.id !== id) return;                                                                  // not the one that is open: nothing to use
    await act(path, choice === 'apply' ? 'apply-preview' : 'cancel-preview');
  }

  async function act(path: string, a: BarAction): Promise<void> {
    if (a === 'keep-script') { try { keptList.set(path, extractDescription(await ports.read(path))); } catch { return; } await evaluate(path, false); }          // 2026-11-22-1016: the list save is held, the note stays as it is
    else if (a === 'update') await update(path);
    else if (a === 'update-recipe') await updateRecipe(path);
    else if (a === 'update-python') await updatePython(path);
    else if (a === 'revert-generated') await revertGenerated(path);
    else if (a === 'revert') { if (listModel.script.on && ui.get(path)?.state.kind === 'recipe-apply') await discardScript(path); else await revert(path); }          // 2026-11-22-1016: on a held Recipe edit Revert is `Discard my script edits`: the list is replayed over the Recipe and the Python
    else if (a === 'ask') await ask(path);
    else if (a === 'apply-preview') await applyPreview(path);
    else if (a === 'cancel-preview') { const u = ui.get(path); if (u) { set(path, { state: u.state, ...(u.fromBox ? { fromBox: true, base: u.base } : {}) }); if (u.fromBox) { endSuggestion(path, 'cancelled'); setBoxNote(path, 'Cancelled.'); } } }
  }

  async function update(path: string): Promise<void> {
    const family = familyOfPath(path); if (family === null) return;
    const u = ui.get(path);
    if (u && u.state.kind === 'apply') { await doApply(path, family, u.state); return; }
    if (u && u.state.kind === 'both-edited') { await doApplyDescriptionOver(path, family); return; }           // the person chose the Description
    if (u && u.state.kind === 'recipe-apply') { await doApplyRecipe(path, family, u.state); return; }          // "Update from Description" on a note whose Recipe is what changed: the Recipe is what there is to apply
    if (u && (u.state.kind === 'python-apply' || u.state.kind === 'python-custom')) { await doApplyPython(path, family, u.state); return; }
    await evaluate(path, true);
  }

  /** "Update from Python": the Python as it stands now (a note whose other facets were edited too: the person chose the Python). */
  async function updatePython(path: string): Promise<void> {
    const family = familyOfPath(path); if (family === null) return;
    let text: string;
    try { text = await ports.read(path); } catch { return; }
    const st = descriptionState(text, family, ports.vault(), 'python');
    if (st.kind === 'python-apply' || st.kind === 'python-custom') { await doApplyPython(path, family, st); return; }
    await evaluate(path, false);
  }

  /** "Update from Recipe": the Recipe as it stands now (a note whose Description was edited too: the person chose the Recipe). */
  async function updateRecipe(path: string): Promise<void> {
    const family = familyOfPath(path); if (family === null) return;
    let text: string;
    try { text = await ports.read(path); } catch { return; }
    const st = descriptionState(text, family, ports.vault(), 'recipe');
    if (st.kind === 'recipe-apply') { await doApplyRecipe(path, family, st); return; }
    await evaluate(path, false);                                                                            // nothing to apply (it parsed no more, or it matches): what the note says now is shown
  }

  /** 2026-11-22-1016: a script action wrote the note (`was` -> `now`): ONE undo entry that carries both whole texts (the Recipe and the Python are not in the list). Music edition only. */
  function pushScriptUndo(path: string, family: Family, was: string, now: string): void {
    if (!listModel.script.on || was === '' || was === now) return;
    stackOf(path).push({ before: listOf(was, family), after: listOf(now, family), added: [], replaced: [], snapshot: { before: was, after: now } });
  }

  /** "Discard my script edits": the LIST as it stands is replayed over the Recipe and the Python (the same replay and writer as every list write); the driver's words and waiting lines stay as they are. ONE write, ONE undo entry. */
  async function discardScript(path: string): Promise<void> {
    const family = familyOfPath(path); if (family === null) return;
    let cur = ''; try { cur = await ports.read(path); } catch { return; }
    const rp = await replay(listOf(cur, family), family, ctxFor(path));
    const keep = ui.get(path);
    if (rp.params === null) { set(path, { state: keep?.state ?? { kind: 'synced' }, message: 'Discard my script edits: no line of the list can be read, so there is nothing to replay. Your script is kept as it is.' }); return; }
    { const loop = await loopRefusalOf(noteId(path), rp.params); if (loop !== null) { ports.trace(`[forge-description] refused ${basename(path)}: ${loop}`); set(path, { state: keep?.state ?? { kind: 'synced' }, message: `Not applied: ${loop}` }); return; } }
    let failure: string | null = null, now = '';
    try { await proc(path, (c) => { if (c !== cur) { failure = 'The note changed while you were looking; ask again.'; return c; } const w = writeListNote(c, basename(path), family, rp); if (w.ok === false) { failure = w.message; return c; } now = w.text; return w.text; }); } catch (e) { failure = `Discard my script edits: ${(e as Error)?.message ?? e}`; console.error('script: could not write the note', e); }
    if (failure !== null) { set(path, { state: keep?.state ?? { kind: 'synced' }, message: failure }); return; }
    told.delete(path); ports.trace(recipeRevertedLine(basename(path))); pushScriptUndo(path, family, cur, now); set(path, null);
  }

  async function revert(path: string): Promise<void> {
    const family = familyOfPath(path); if (family === null) return;
    { let now = ''; try { now = await ports.read(path); } catch { /* the write below says so */ }                  // 2026-11-19-0910: the json cache's composition may loop NOW (another composition changed since): the same check
      const prev = now === '' ? null : cacheParams(now, family); const loop = prev !== null ? await loopRefusalOf(noteId(path), prev) : null;
      if (loop !== null) { const keep = ui.get(path); set(path, { state: keep?.state ?? { kind: 'synced' }, message: `Revert: ${loop}` }); return; } }
    let failure: string | null = null;
    try { await proc(path, (cur) => { const r = revertDescriptionText(cur, basename(path), family); if (r.ok === false) { failure = r.message; return cur; } return r.text; }); } catch (e) { failure = `Revert: ${(e as Error)?.message ?? e}`; }
    if (failure !== null) { const keep = ui.get(path); set(path, { state: keep?.state ?? { kind: 'synced' }, message: failure }); return; }
    const was = ui.get(path)?.state.kind;
    told.delete(path); ports.trace(was === 'python-apply' || was === 'python-custom' ? pythonRevertedLine(basename(path)) : was === 'recipe-rejected' || was === 'recipe-apply' || was === 'both-edited' ? recipeRevertedLine(basename(path)) : revertedLine(basename(path))); set(path, null);
  }

  /** 2026-11-19-0910 - THE loop check: asked ONCE, by every path that is about to write a composition's recipe (the grammar's preview in the box, the box's apply, a Description edited in the note, a Recipe or a Python edited by hand, the service's plan and the apply of its preview, a revert), BEFORE any preview and
   *  before any write. Before this the service's answer was the only path that asked (askNewKind), so `Play [[comp_002]]` typed in comp_001 (comp_002 plays comp_001) was read by the GRAMMAR, previewed and applied, and the Score could not be drawn. The words are compositionLoopRefusal's: both notes and the trail.
   *  The draw-time message of composition-core.ts stays as the second guard. A phrase, an arrangement and a vault without compositions never reach the vault read. `note` is the composition's id (`compositions/<name>`). */
  async function loopRefusalOf(note: string, params: GrammarParams): Promise<string | null> {
    if (params.kind !== 'composition') return null;
    return compositionLoopRefusal(note, params, readSectionsOf);
  }
  const readSectionsOf = async (id: string) => { try { const r = readCompositionNote(await ports.read(`${id}.md`)); return r.ok ? r.value.sections : null; } catch { return null; } };
  const noteId = (path: string): string => path.replace(/\.md$/, '');

  // ================================================================================================================================================================================================================
  // 2026-11-19-0970 - THE LIST MODEL (stage 1: arrangements and compositions). The Description is an ordered list of canonical sentences; the note is a pure function of it (sentence-list-core.ts replays it through the existing grammar, locally).
  // Every write of the list goes through `commitList`: ONE `process`, the Description, derived frontmatter, Recipe, Python, json cache and stamps made again together (sentence-list-note-core.ts), idempotent (the same list writes nothing).
  // ================================================================================================================================================================================================
  const stacks = new Map<string, UndoStack>();                    // path -> the undo / redo of the open note (in memory only: it is gone when Obsidian closes; undo then still removes the last item of the list as it is)
  const stackOf = (path: string): UndoStack => { let st = stacks.get(path); if (!st) { st = createUndoStack(); stacks.set(path, st); } return st; };
  const previewed = new Map<string, { text: string; lines: string[] }>();      // 2026-11-19-0980: path -> the typed text and its sentences as the PREVIEW canonicalized them (a random line's seed drawn once): the second Enter writes these, never a second draw
  const sentencesFor = (path: string, family: ListFamily, text: string): string[] => {
    const saved = previewed.get(path);
    if (saved !== undefined && saved.text === text) return saved.lines;
    return drawSeeds(sentencesOfText(text, family), family, ports.drawSeed ?? defaultSeed);
  };
  const ctxFor = (path: string): ReplayCtx => ({ vault: ports.vault(), self: noteId(path), readSections: readSectionsOf });
  const listOf = (cur: string, family: ListFamily): string[] => listOfNote(cur, family, ports.vault()).list;
  /** 2026-11-20-1003: the open pane of this note (the seam counts the bars its Score DRAWS: only a count is sent to the service, never the music). */
  const paneOf = (path: string): HTMLElement | undefined => ports.panes().find((p) => p.path === path)?.contentEl;

  /** Write `next` as the note's list in ONE `process`, if the Description on disk is still `expectBase` (what the plan was made against). `record` (an apply) goes on the undo stack once it is written. */
  async function commitList(path: string, family: ListFamily, next: readonly string[], expectBase: string, record?: { before: string[]; added: string[]; replaced: Array<{ index: number; sentence: string }> }, allowNone = false): Promise<{ ok: true; change: string; stop: ListStop | null; applied: number } | { ok: false; message: string }> {
    const rp = await replay(next, family, ctxFor(path));
    if (rp.params === null && next.length > 0 && !allowNone) return { ok: false, message: rp.stop !== null ? stopNotice(rp.stop, 0) : 'No line of the list can be read.' };          // (allowNone: a list that is only waiting lines is kept as it is)
    let failure: string | null = null, change = '';
    try {
      await proc(path, (cur) => {
        if (extractDescription(cur) !== expectBase) { failure = 'The Description changed while you were looking; ask again.'; return cur; }
        const w = writeListNote(cur, basename(path), family, rp);
        if (w.ok === false) { failure = w.message; return cur; }
        change = rp.params === null ? 'now empty' : changeSummary(cacheParams(cur, family), rp.params);
        return w.text;
      });
    } catch (e) { failure = `Apply: ${(e as Error)?.message ?? e}`; console.error('[forge-promptbox] could not write the list', e); pbWarn(`could not write the note: ${(e as Error)?.message ?? e}`); }
    if (failure !== null) return { ok: false, message: failure };
    if (record) stackOf(path).push({ before: record.before, after: [...rp.list], added: record.added, replaced: record.replaced });
    asked.delete(path); fp?.forget(path);
    return { ok: true, change, stop: rp.stop, applied: rp.applied };
  }

  /** The grammar could not read the typed sentence in the list (or the line it would follow): the same strip, trace, dialog line and ONE request to the service as ever (the service only ever PREVIEWS). Returns the sentence the dialog said. */
  function saidRejected(path: string, text: string, cur: string, plan: Extract<Plan, { ok: false }>): string {
    const error = { message: plan.message, line: plan.line, column: plan.column };
    fp?.rejected(path, plan, cur);
    const state: DescriptionState = { kind: 'rejected', sentence: text, error, message: rejectionMessage(error) };
    set(path, { state, message: state.message, fromBox: true, base: extractDescription(cur) });
    pb('grammar verdict: rejected');
    const said = `The grammar did not accept this sentence (line ${error.line}, column ${error.column}: ${error.message}).`;
    setBoxNote(path, said); say(path, { type: 'rejected', line: error.line, column: error.column, message: error.message });
    return said;
  }

  // ================================================================================================================================================================================================================
  // 2026-11-19-0992 - DUPLICATE: an ACTION sentence of a phrase's composer. `Duplicate [[bar_007]].` is read here (duplicate-sentence-core.ts: locally, no model call), previewed ("Copy [[bar_007]] to a new bar.": always, even with
  // auto-apply on) and, on the second Enter, made (duplicate-note-core.ts): ONE new note under the next free name. It never enters the list, it writes nothing that exists (not this phrase: no `process` call at all), it is not on the undo stack
  // (the dialog says how to delete a copy), and the dialog's line has links that open the copy.
  // ================================================================================================================================================================================================================
  /** The first Enter on an action text: the proposal ("Copy [[bar_007]] to a new bar."), or why it cannot be done, in plain words (and never to the service). */
  async function previewAction(path: string, act: Extract<ActionRead, { kind: 'duplicate' | 'refused' }>, instant = false): Promise<PreviewResult> {
    previewed.delete(path);
    const refuse = (message: string): PreviewResult => { pb(`action refused: ${message}`); say(path, { type: 'refused', message, by: 'plugin' }); setBoxNote(path, `Refused: ${message}`); return { ok: false, message: `Refused: ${message}` }; };
    if (act.kind === 'refused') return refuse(act.message);
    if (ports.duplicate === undefined) return refuse('Duplicate is not available in this build: it cannot copy notes here.');
    const of = listModel.duplicate.resolveDuplicateTarget(act.target, ports.vault());
    if (of.ok === false) return refuse(of.message);
    let source = ''; try { source = await ports.read(of.path); } catch (e) { console.error('[forge-duplicate] previewAction: could not read the source', e); return refuse(`Could not read [[${of.name}]]: ${(e as Error)?.message ?? e}`); }
    const dry = listModel.duplicate.copyNoteText(source, of, 'copy_preview', ports.vault());                                    // the dry run: a note that cannot be copied is said NOW, not after the second Enter
    if (dry.ok === false) return refuse(dry.message);
    const description = listModel.duplicate.duplicatePreviewLine(of);
    pb('grammar verdict: accepted (action, preview, nothing written)');
    if (!instant) say(path, { type: 'suggestion', description, recipe: '', via: 'grammar' });                  // 2026-11-20-1002: applied at once, the copy's own line ("Created bar_010, a copy of bar_007.") is all that is said
    return { ok: true, proposal: { description, via: 'grammar', action: true, ...(instant ? { instant: true } : {}) } };
  }
  /** The second Enter on an action text: make the copy and say so, with links; nothing else is written. */
  async function applyAction(path: string, act: Extract<ActionRead, { kind: 'duplicate' | 'refused' }>): Promise<{ ok: boolean; disk?: string; message?: string }> {
    const fail = (message: string): { ok: boolean; message: string } => { pb(`action failed: ${message}`); setBoxNote(path, message); say(path, { type: 'failed', message }); return { ok: false, message }; };
    if (act.kind === 'refused') { say(path, { type: 'refused', message: act.message, by: 'plugin' }); setBoxNote(path, `Refused: ${act.message}`); return { ok: false, message: `Refused: ${act.message}` }; }
    if (ports.duplicate === undefined) return fail('Duplicate is not available in this build: it cannot copy notes here.');
    const of = listModel.duplicate.resolveDuplicateTarget(act.target, ports.vault());
    if (of.ok === false) return fail(of.message);
    const done = await ports.duplicate(of);
    if (done.ok === false) return fail(done.message);
    pb(`action done: ${done.id} is a copy of ${done.sourceId}`);
    setBoxNote(path, 'Copied.');
    say(path, { type: 'created', text: listModel.duplicate.createdLine(done), links: [{ name: done.name, id: done.id }, { name: done.sourceName, id: done.sourceId }] });
    pb(`action said: ${listModel.duplicate.createdLine(done)} (drawn in ${[...boxes.values()].filter((b) => b.path === path && b.chat.attached()).length} panel(s) of ${basename(path)})`);       // 2026-11-19-0992b: the console says where the line was drawn (the driver saw nothing twice)
    if (ports.undoCopy !== undefined) {                                                                     // 2026-11-19-0992a: the copy is an UNDO ENTRY (it changes no line of the list): Cmd/Ctrl+Z in the empty composer takes it back while its bytes are what was written
      try { const list = listOf(await ports.read(path), 'phrase'); stackOf(path).push({ before: [...list], after: [...list], added: [], replaced: [], copy: { path: done.path, name: done.name, hash: done.hash } }); }
      catch (e) { console.error('[forge-duplicate] could not make the copy an undo entry', e); }
    }
    return { ok: true, disk: '' };
  }
  const duplicateArmed = (path: string): boolean => familyOfPath(path) === 'phrase' && (boxText(path) ?? '').trim() !== '';       // 2026-11-19-0992a: ANY text (it was armsDuplicate: only the word)
  /** 2026-11-19-0999: does the phrase's list (as the note says it now) have a head line (Extend, Mix, Morph or Take)? A note that cannot be read says yes: the click then does what 0996b did. */
  async function phraseHasHead(path: string): Promise<boolean> {
    try { return listOf(await ports.read(path), 'phrase').some(isHeadLine); } catch (e) { console.error('[forge-duplicate] phraseHasHead: could not read the note', e); return true; }
  }
  async function duplicateClick(path: string, noteId: string | null, bar?: number | null): Promise<{ ok: boolean; message: string }> {
    const box = [...boxes.values()].find((b) => b.path === path);
    if (box === undefined) return { ok: false, message: 'There is no composer open for this note.' };
    if (!duplicateArmed(path)) return { ok: false, message: 'The composer is empty: a click on a bar pins it.' };
    const typed = box.handle.state().text;
    const opensHead = listModel.duplicate.barWordVerb(typed) !== null && listModel.duplicate.barWordVerb(typed, false) === null;          // 2026-11-19-0999 (deliberate): Extend, Mix and Morph are a bar step only once the phrase has a head line; the six other verbs never read the note (this click stays synchronous for them)
    if (listModel.duplicate.barWordVerb(typed, opensHead ? await phraseHasHead(path) : true) !== null) {                          // 2026-11-19-0996b: the text starts with a bar word (Duplicate, Copy, Move, Delete, Remove, Keep, Morph, Mix, Extend): the click says WHICH BAR (its number in the Score now), at the caret, no preview, no pin
      if (typeof bar !== 'number' || !Number.isInteger(bar) || bar < 1) {
        const message = 'I cannot tell which bar that is, so I cannot write its number.';
        say(path, { type: 'notice', message }); box.handle.focus();
        return { ok: false, message };
      }
      pb(`bar click: bar ${bar}`);
      box.handle.insertAtCaret((before) => listModel.duplicate.barInsertion(before, bar));
      return { ok: true, message: `Added bar ${bar} to the composer.` };
    }
    const parts = listModel.duplicate.idParts(noteId);
    if (parts === null) {
      const message = noteId === null ? 'I cannot tell which note made that bar, so I cannot copy it.' : `That bar comes from ${noteId}, which is not a bar, a phrase, an arrangement or a composition I can copy.`;
      say(path, { type: 'notice', message }); box.handle.focus();
      return { ok: false, message };
    }
    pb(`link click: ${noteId}`);                                                                            // 2026-11-19-0992a (R1): any other text: the link goes in at the caret, focus back, no preview, nothing else
    box.handle.insertAtCaret((before) => listModel.duplicate.linkInsertion(before, parts.name));
    return { ok: true, message: `Added [[${parts.name}]] to the composer.` };       // 2026-11-19-0996b: the 0992 branch (a text that ENDS with the word Duplicate got ` [[name]].` and a preview) is gone: a Duplicate sentence starts the text, so it is a bar word now, and the note copy is the typed `Duplicate [[bar_007]].`
  }

  /** 2026-11-21-1015 (Part C): a sentence that neither the grammar nor the service could turn into lines is KEPT as a waiting line (the driver's words), on the undo stack, said in the dialog with why. Not kept: a question is pending, nothing worth keeping, the same words are already waiting, a cancel. */
  const droppedAsk = new Set<string>();          // 2026-11-21-1015: an answer that was DROPPED (the text moved on, the note changed, a cancel) is not a verdict on the sentence: no waiting line for it
  async function keepWaiting(path: string, family: ListFamily, text: string, reason: string): Promise<void> {
    if (droppedAsk.delete(path) || asked.get(path)?.sentence === text || reason === 'Cancelled.') return;
    const line = listModel.waiting.line(text); if (line === null) return;
    let cur = ''; try { cur = await ports.read(path); } catch { return; }
    const before = listOf(cur, family); if (before.includes(line)) return;
    const done = await commitList(path, family, [...before, line], extractDescription(cur), { before, added: [line], replaced: [] }, true);
    if (done.ok === false) { pb(`waiting line not kept: ${done.message}`); return; }
    pb(`kept as a waiting line: line ${before.length + 1}`);
    told.delete(path); set(path, null);
    say(path, { type: 'notice', message: listModel.waiting.kept(before.length + 1, reason.replace(/^The grammar did not accept this sentence[^.]*\.\s*/, '')) });
  }
  /** The first line of the list the replay stops at (a waiting line or one the grammar cannot read after a hand edit), 1-based; null when every line reads. */
  const translatableLine = (path: string): number | null => {
    const family = familyOfPath(path), text = lastText.get(path); if (family === null || text === undefined) return null;
    const rp = replayGrammar(listOf(text, family), family, ctxFor(path)); return rp.stop !== null && rp.stop.reason === 'unreadable' ? rp.stop.index + 1 : null;
  };
  /** 2026-11-21-1015: `Translate line N.` - the service is asked for line N ALONE (its words, in lines mode); the answer is a PLAN (the suggestion in the dialog) that REPLACES the line when the person confirms; a refusal changes nothing; no call on save. */
  async function previewTranslate(path: string, family: ListFamily, n: number, cur: string, typed: string): Promise<PreviewResult> {
    const refuse = (message: string): PreviewResult => { say(path, { type: 'notice', message }); setBoxNote(path, message); return { ok: false, message }; };
    const list = listOf(cur, family), line = list[n - 1];
    if (line === undefined) return refuse(`There is no line ${n}.`);
    const stopped = replayGrammar(list, family, ctxFor(path)).stop;
    const words = listModel.waiting.words(line) ?? (stopped !== null && stopped.index === n - 1 ? splitSaid(line).line : null);
    if (words === null) return refuse(`Line ${n} is already a sentence I can read.`);
    if (ports.askPlan === undefined || ports.configured?.() === false) return refuse('The sentence service is not set up: add its URL and token in Settings → Forge Actions (Beta).');
    const v = ports.vault();
    const req = family === 'phrase' ? buildPlanRequest({ sentence: words, barNames: ports.barNames(), phraseNames: ports.phraseNames(), ownKey: ports.ownKey?.() })
      : buildFamilyPlanRequest({ family, sentence: words, kitNames: v.kits, phraseNames: ports.phraseNames(), arrangementNames: v.arrangements, compositionNames: v.compositions, note: path.replace(/\.md$/, ''), ownKey: ports.ownKey?.() });
    if (req.ok === false) return refuse(req.message);
    setBoxBusy(path, 'Asking the sentence service...'); say(path, { type: 'asking' }); ports.trace(askingServiceLine(basename(path)));
    let outcome: Asked; let question: string | null = null;
    const head = await replay(list.slice(0, n - 1), family, ctxFor(path)), headNote = writeListNote(cur, basename(path), family, head);          // the note as it is BEFORE line n: the service plans (and the grammar checks) against the lines that come first
    try {
      const a = await listModel.service.ask({
        payload: req.payload, askPlan: (x) => ports.askPlan!(x as PlanPayload), fromBox: true, family, previous: asked.get(path), readNote: async () => (headNote.ok ? headNote.text : cur), pane: paneOf(path), vault: ports.vault(), ctx: ctxFor(path), draw: ports.drawSeed ?? defaultSeed,
        legacy: async (res) => (family === 'phrase' ? interpretPlanResponse(res, req.payload.bars) : await askNewKind(res, req.payload)),
      });
      outcome = a; question = 'question' in a && a.question !== undefined ? a.question : null;
    } catch (e) { outcome = { ok: false, message: `Could not reach the transpile service (${(e as Error)?.message ?? e}). Check your connection and Settings → Forge Actions (Beta) → Transpile service URL.` }; }
    setBoxBusy(path, null);
    if (question !== null) { asked.set(path, { sentence: words, question }); return refuse(`The service asks: ${question}`); }
    asked.delete(path);
    if (outcome.ok === false) return refuse(`The service refused: ${outcome.message}`);
    const lines = outcome.lines ?? linesOfParams(outcome.params, family);
    if (lines.length === 0) return refuse('The service gave no sentence for that line.');
    const next = [...list.slice(0, n - 1), withSaid(lines[0], words), ...lines.slice(1), ...list.slice(n)];
    const rp = await replay(next, family, ctxFor(path));
    if (rp.stop !== null && rp.stop.index < n - 1 + lines.length) return refuse(`The suggestion does not fit this note: ${stopNotice(rp.stop, rp.applied)}`);
    const description = lines.join(' ');
    const state: DescriptionState = { kind: 'rejected', sentence: words, error: { message: '', line: n, column: 1 }, message: '' };
    set(path, { state, fromBox: true, base: extractDescription(cur), preview: { params: outcome.params, forSentence: typed, said: words, description, recipe: '', lines, replaceAt: n, replaces: line } });
    ports.trace(askedServiceLine(basename(path), `translate line ${n}`));
    setBoxNote(path, 'The service answered: the suggestion is in the dialog.'); say(path, { type: 'suggestion', description, recipe: '', replaces: line });
    return { ok: true, proposal: { description, via: 'service', replaces: line } };
  }
  /** 2026-11-19-0970 - the composer's FIRST Enter in an arrangement or a composition: the typed sentence(s) APPENDED to the list (or in place of the sentence they replace), nothing written. */
  async function previewList(path: string, family: ListFamily, text: string, cur: string, instant = false): Promise<PreviewResult> {
    previewed.delete(path);
    const typed = sentencesFor(path, family, text);                                                       // a random line draws its seed HERE, once
    const plan = await planAppend(listOf(cur, family), family, typed, ctxFor(path));
    if (plan.ok === true) {
      previewed.set(path, { text, lines: typed });
      if (plan.unchanged) { const m = 'Nothing changed: the note already says this.'; say(path, { type: 'notice', message: m }); return { ok: false, message: m }; }
      const description = plan.added.join(' '), replaces = plan.replaced.map((r) => r.sentence).join(' ');
      pb('grammar verdict: accepted (preview, nothing written)');
      if (!instant) say(path, { type: 'suggestion', description, recipe: '', via: 'grammar', ...(replaces !== '' ? { replaces } : {}) });       // 2026-11-20-1002: applied at once, the dialog says it once, after the fact ("Applied. <the line>")
      if (plan.replay.stop !== null) setBoxNote(path, stopNotice(plan.replay.stop, plan.replay.applied));       // 2026-11-19-0980: a new head left a line it cannot take: said under the card, before the apply
      return { ok: true, proposal: { description, via: 'grammar', ...(replaces !== '' ? { replaces } : {}), ...(instant ? { instant: true } : {}) } };
    }
    if (plan.reason === 'loop') { pb(`grammar verdict: accepted, then refused: ${plan.message}`); say(path, { type: 'refused', message: plan.message, by: 'plugin' }); setBoxNote(path, `Refused: ${plan.message}`); return { ok: false, message: `Refused: ${plan.message}` }; }
    if (plan.reason !== 'unreadable') { say(path, { type: 'notice', message: plan.message }); setBoxNote(path, plan.message); return { ok: false, message: plan.message }; }       // an unreadable line already in the list, or nothing to add: said in plain words
    const serviceUp = ports.askPlan !== undefined && ports.configured?.() !== false;
    const placeWords = serviceUp && listModel.repair.placeWords(text, family);                              // 2026-11-21-1015 (service first, driver "[7]"): place words the grammar cannot read go to the service FIRST; its answer is a plan; the repair below is the fallback
    let viaService: PreviewResult | null = null;
    if (placeWords) { fpHold++; try { viaService = await askTail(path, text, saidRejected(path, text, cur, plan)); } finally { fpHold--; } if (viaService.ok) return viaService; }
    const offered = await listModel.repair.offer(text, family, async (repaired) => (await planAppend(listOf(cur, family), family, sentencesOfText(repaired, family), ctxFor(path))).ok, (ev) => say(path, ev), (t) => fp?.known(t) ?? null);          // 2026-11-20-1002 (DID YOU MEAN): a deterministic repair the grammar reads is offered BEFORE the service is asked; Enter or its button applies the SUGGESTION
    if (offered !== null) return offered;
    if (viaService !== null) fp?.ended(path, text);                                                         // the service refused and no repair mended it: NOW it is a failure (one record)
    const result = viaService ?? await askTail(path, text, saidRejected(path, text, cur, plan));
    if (result.ok === false) await keepWaiting(path, family, text, result.message.replace(/^The grammar did not accept this sentence[^.]*\.\)?\s*/, ''));          // 2026-11-21-1015 (Part C)
    return result;
  }
  /** 2026-11-19-0970 - the second Enter (or an apply with no preview) in an arrangement or a composition: the same plan, made again against the note as it is NOW, written in one go. */
  async function applyList(path: string, family: ListFamily, text: string, instant = false, original?: string): Promise<{ ok: boolean; disk?: string; message?: string }> {
    let cur = ''; try { cur = await ports.read(path); } catch (e) { console.error('[forge-promptbox] applyList: could not read the note', e); const m = `Could not read the note: ${(e as Error)?.message ?? e}`; say(path, { type: 'failed', message: m }); return { ok: false, message: m }; }
    const before = listOf(cur, family);
    const typedLines = sentencesFor(path, family, text);
    if (original !== undefined && typedLines.length > 0) typedLines[0] = withSaid(typedLines[0], original);          // 2026-11-21-1015 (provenance): the first canonical line keeps the driver's own words beside it
    const plan = await planAppend(before, family, typedLines, ctxFor(path));
    if (plan.ok === false) {
      if (plan.reason === 'loop') { pb(`apply refused: ${plan.message}`); say(path, { type: 'refused', message: plan.message, by: 'plugin' }); setBoxNote(path, `Refused: ${plan.message}`); return { ok: false, message: `Refused: ${plan.message}` }; }
      if (plan.reason !== 'unreadable') { say(path, { type: 'notice', message: plan.message }); setBoxNote(path, plan.message); return { ok: false, message: plan.message }; }
      const failed = await askTail(path, text, saidRejected(path, text, cur, plan));
      if (failed.ok === false) await keepWaiting(path, family, text, failed.message);          // 2026-11-21-1015 (Part C)
      return { ok: false };
    }
    pb('grammar verdict: accepted');
    if (plan.unchanged) { told.delete(path); set(path, null); setBoxNote(path, 'Nothing changed: the note already says this.'); say(path, { type: 'applied', change: 'unchanged', description: extractDescription(cur) }); return { ok: true, disk: '' }; }
    const done = await commitList(path, family, plan.list, extractDescription(cur), { before, added: plan.added, replaced: plan.replaced });
    if (done.ok === false) { pb(`apply failed: ${done.message}`); setBoxNote(path, done.message); say(path, { type: 'failed', message: done.message }); return { ok: false, message: done.message }; }
    previewed.delete(path);
    told.delete(path); ports.trace(appliedLine(basename(path), done.change)); set(path, null);
    setBoxNote(path, 'Applied.');
    say(path, { type: 'applied', change: done.change, description: instant ? plan.added.join(' ') : (await descriptionOf(path)) ?? plan.list.join(' '), ...(instant ? { instant: { replaces: plan.replaced.map((r) => r.sentence).join(' ') } } : {}) });       // 2026-11-20-1002: applied at once, in the words the preview would have used
    if (done.stop !== null) sayCut(path, { stop: done.stop, applied: done.applied });                       // 2026-11-19-0980: a head that left a line it cannot take: "Line 3 is not a sentence I can read; the note shows lines 1 and 2."
    return { ok: true, disk: '' };
  }

  /** 2026-11-19-0980 - one canonical sentence APPENDED now (the bar-selection menu's steps; stage 3's grid clicks): the same plan as a typed sentence, written in one go and recorded for undo; the composer's text is not touched. */
  async function appendLine(path: string, sentence: string, opts?: BarAppendOpts): Promise<{ ok: boolean; message: string } & Partial<Pick<BarAppendResult, 'data' | 'reason' | 'unchanged'>>> {
    if (isBarPath(path)) return bar.appendBar(path, sentence, opts);                                         // 2026-11-19-0993: a Beat Box gesture: one `process`, one write, undoable
    const family = familyOfPath(path);
    if (!isList(family)) return { ok: false, message: 'This note is not a phrase, an arrangement or a composition.' };
    let cur = ''; try { cur = await ports.read(path); } catch (e) { console.error('[forge-promptbox] appendLine: could not read the note', e); const message = `Could not read the note: ${(e as Error)?.message ?? e}`; say(path, { type: 'failed', message }); return { ok: false, message }; }
    const before = listOf(cur, family);
    const plan = await planAppend(before, family, sentencesFor(path, family, sentence), ctxFor(path));
    if (plan.ok === false) { pb(`append refused: ${plan.message}`); say(path, { type: 'notice', message: plan.message }); return { ok: false, message: plan.message }; }
    if (plan.unchanged) { const message = 'Nothing changed: the note already says this.'; say(path, { type: 'notice', message }); return { ok: true, message }; }
    const done = await commitList(path, family, plan.list, extractDescription(cur), { before, added: plan.added, replaced: plan.replaced });
    if (done.ok === false) { pb(`append failed: ${done.message}`); say(path, { type: 'failed', message: done.message }); return { ok: false, message: done.message }; }
    told.delete(path); ports.trace(appliedLine(basename(path), done.change)); set(path, null);
    say(path, { type: 'applied', change: done.change, description: (await descriptionOf(path)) ?? plan.list.join(' ') });
    if (done.stop !== null) sayCut(path, { stop: done.stop, applied: done.applied });
    return { ok: true, message: `Added: ${plan.added.join(' ')}` };
  }

  /** The service's answer for an arrangement or a composition, as canonical lines: APPENDED to the list (a sentence typed in the composer), or the whole list (a Description edited by hand that the grammar could not read), written in one go. */
  async function applyListPreview(path: string, family: ListFamily, u: Ui): Promise<{ ok: boolean; disk?: string; message?: string }> {
    const pv = u.preview!;
    const fail = (message: string, by?: 'plugin'): { ok: boolean; message: string } => {
      set(path, { state: u.state, message, ...(u.fromBox ? { fromBox: true, base: u.base } : {}) });
      if (u.fromBox) { endSuggestion(path, 'expired'); say(path, by === 'plugin' ? { type: 'refused', message, by } : { type: 'failed', message }); }
      return { ok: false, message };
    };
    let cur = ''; try { cur = await ports.read(path); } catch (e) { console.error('[forge-promptbox] applyListPreview: could not read the note', e); return fail(`Apply: ${(e as Error)?.message ?? e}`); }
    const base = extractDescription(cur);
    if (base !== (u.fromBox ? u.base : pv.forSentence)) return fail('The Description changed while the service was thinking; its suggestion was dropped.');
    const before = u.fromBox ? listOf(cur, family) : [];
    if (pv.replaceAt !== undefined) {                                                                      // 2026-11-21-1015: `Translate line N`: the waiting line is REPLACED by the canonical lines (the first carries the driver's words)
      const lines = [...(pv.lines ?? [])]; if (lines.length > 0) lines[0] = withSaid(lines[0], pv.said ?? pv.forSentence);
      const old = listOf(cur, family), at = pv.replaceAt - 1;
      if (old[at] === undefined) return fail('That line is not there any more; ask again.');
      const next = [...old.slice(0, at), ...lines, ...old.slice(at + 1)];
      const done = await commitList(path, family, next, base, { before: old, added: lines, replaced: [{ index: at, sentence: old[at] }] });
      if (done.ok === false) return fail(done.message);
      told.delete(path); ports.trace(appliedLine(basename(path), done.change)); set(path, null); endSuggestion(path, 'applied');
      const d = await descriptionOf(path); for (const b of boxes.values()) if (b.path === path) b.handle.reset('');
      say(path, { type: 'applied', change: done.change, description: d ?? next.join(' ') }); setBoxNote(path, 'Applied.');
      if (done.stop !== null) sayCut(path, { stop: done.stop, applied: done.applied });
      return { ok: true, disk: '' };
    }
    const svcLines = [...(pv.lines ?? [])]; if (svcLines.length > 0) svcLines[0] = withSaid(svcLines[0], pv.forSentence);          // 2026-11-21-1015 (provenance): the service's first line keeps the words the person typed
    const plan = await planAppend(before, family, svcLines, ctxFor(path));
    if (plan.ok === false) return fail(plan.message, 'plugin');
    const done = await commitList(path, family, plan.list, base, { before, added: plan.added, replaced: plan.replaced });
    if (done.ok === false) return fail(done.message);
    told.delete(path); ports.trace(appliedLine(basename(path), done.change)); set(path, null);
    if (u.fromBox) { endSuggestion(path, 'applied'); const d = await descriptionOf(path); for (const b of boxes.values()) if (b.path === path) b.handle.reset(''); say(path, { type: 'applied', change: done.change, description: d ?? plan.list.join(' ') }); setBoxNote(path, 'Applied.'); return { ok: true, disk: '' }; }
    return { ok: true };
  }

  /** Where a hand-edited list stops (an unreadable line, a line that would loop) and how many lines apply: asked of the replay WITH the loop check, so the grammar's and the loop's stop are one answer. */
  async function listCut(path: string, family: Family, st: Extract<DescriptionState, { kind: 'apply' }>): Promise<{ refuse: string | null; limit: number | undefined; stop: ListStop | null; applied: number }> {
    if (!isList(family) || st.list === undefined) return { refuse: await loopRefusalOf(noteId(path), st.params), limit: undefined, stop: null, applied: 0 };
    const rp = await replay(st.list, family, ctxFor(path));
    return { refuse: rp.applied === 0 && rp.stop?.reason === 'loop' ? rp.stop.message : null, limit: rp.applied, stop: rp.stop, applied: rp.applied };
  }
  /** What a hand-edited list left out is said in the dialog in plain muted words ("Line 3 is not a sentence I can read; the note shows lines 1 and 2."), once for this text. */
  function sayCut(path: string, cut: { stop: ListStop | null; applied: number }): void {
    if (cut.stop === null) return;
    const message = stopNotice(cut.stop, cut.applied);
    if (told.get(path) === `cut:${message}`) return;
    told.set(path, `cut:${message}`); say(path, { type: 'notice', message });
  }

  /** Undo (Cmd/Ctrl+Z in an empty composer, the "+" menu): the last sentence comes off the list and the note is recomputed, ONE write. */
  async function stepList(path: string, which: 'undo' | 'redo', via: UndoVia = 'other'): Promise<{ ok: boolean; message: string }> {
    undoTrace.record(via, which, path);          // 2026-11-20-1004z (4a): which way in asked (in memory, the note name only)
    if (isBarPath(path)) return bar.stepBar(path, which);
    const family = familyOfPath(path);
    if (!isList(family)) return { ok: false, message: 'Only an arrangement or a composition keeps a list of sentences.' };
    let cur = ''; try { cur = await ports.read(path); } catch (e) { console.error('[forge-promptbox] stepList: could not read the note', e); const message = `Could not read the note: ${(e as Error)?.message ?? e}`; say(path, { type: 'failed', message }); return { ok: false, message }; }
    const before = listOf(cur, family), stack = stackOf(path);
    const r = which === 'undo' ? stack.undo(before) : stack.redo(before);
    if (r === null) return { ok: false, message: which === 'undo' ? 'There is no sentence to take back.' : 'There is no sentence to put back.' };
    if ('snapshot' in r && r.snapshot !== undefined) return stepSnapshot(path, which, r.snapshot, cur);                      // 2026-11-22-1016: a script action: the whole note is written back
    if ('copy' in r && r.copy !== undefined) return takeCopyBack(path, r.copy);                              // 2026-11-19-0992a: the newest thing was a COPY: the list is untouched, the phrase is not written
    const done = await commitList(path, family, r.list, extractDescription(cur));
    if (done.ok === false) { stack.clear(); pb(`${which} failed: ${done.message}`); setBoxNote(path, done.message); say(path, { type: 'failed', message: done.message }); return { ok: false, message: done.message }; }
    const message = 'removed' in r ? `Removed: ${r.removed.join(' ')}${r.restored.length > 0 ? ` Put back: ${r.restored.join(' ')}` : ''}` : `Added again: ${r.added.join(' ')}`;
    told.delete(path); ports.trace(appliedLine(basename(path), `${which}: ${done.change}`)); set(path, null);
    say(path, { type: 'notice', message });
    if (done.stop !== null) say(path, { type: 'notice', message: stopNotice(done.stop, done.applied) });
    return { ok: true, message };
  }
  /** 2026-11-22-1016: Cmd/Ctrl+Z (or Cmd/Ctrl+Shift+Z) reached a script action: its two whole texts are the entry, written back in ONE write when the note is still what that step left (otherwise nothing is written and the entry is spent). */
  async function stepSnapshot(path: string, which: 'undo' | 'redo', snap: { before: string; after: string }, cur: string): Promise<{ ok: boolean; message: string }> {
    const from = which === 'undo' ? snap.after : snap.before, to = which === 'undo' ? snap.before : snap.after;
    if (cur !== from) { stackOf(path).clear(); const message = `The note changed since; there is nothing to ${which === 'undo' ? 'take back' : 'put back'} here.`; say(path, { type: 'failed', message }); return { ok: false, message }; }
    let failure: string | null = null;
    try { await proc(path, (c) => { if (c !== from) { failure = 'The note changed while you were looking; ask again.'; return c; } return to; }); } catch (e) { failure = `${which === 'undo' ? 'Undo' : 'Redo'}: ${(e as Error)?.message ?? e}`; }
    if (failure !== null) { stackOf(path).clear(); say(path, { type: 'failed', message: failure }); return { ok: false, message: failure }; }
    const message = which === 'undo' ? 'Taken back: the note is as it was before the script change.' : 'Done again: the script change is back.';
    told.delete(path); set(path, null); say(path, { type: 'notice', message }); await evaluate(path, false);                // a note with a hand-edited Recipe says so again
    return { ok: true, message };
  }
  /** 2026-11-19-0992a: Cmd/Ctrl+Z reached a copy: it goes to the trash when its bytes are still what the duplicate wrote, and the dialog says what was done in muted words; an edited copy is left (the entry is spent: the next Cmd/Ctrl+Z reaches the phrase's own previous sentence). Nothing is written to the phrase. */
  async function takeCopyBack(path: string, mark: CopyMark): Promise<{ ok: boolean; message: string }> {
    if (ports.undoCopy === undefined) return { ok: false, message: 'This build cannot take a copy back.' };
    const out = await ports.undoCopy(mark);
    pb(`undo of a copy: ${mark.path}: ${out.state}`);
    say(path, { type: 'notice', message: out.message });
    return { ok: out.state === 'removed', message: out.message };
  }
  const undoLast = (path: string, via?: UndoVia) => stepList(path, 'undo', via);
  const redoLast = (path: string, via?: UndoVia) => stepList(path, 'redo', via);
  const canStep = (path: string, which: 'undo' | 'redo'): boolean => {
    if (isBarPath(path)) return bar.canStepBar(path, which, lastText.get(path));
    const family = familyOfPath(path), text = lastText.get(path);
    if (!isList(family) || text === undefined) return false;
    const list = listOf(text, family);
    return which === 'undo' ? stackOf(path).canUndo(list) : stackOf(path).canRedo(list);
  };
  /** 2026-11-20-1002 (A TYPED UNDO AND REDO, typed-step-core): what its runner borrows: the note's own undo stack, its dialog and its box. */
  const stepPorts: StepPorts = { you: (p, text) => say(p, { type: 'you', text }), canStep, step: (p, w) => stepList(p, w, 'typed'), note: setBoxNote, pb, say: (p, kind, message) => say(p, kind === 'refused' ? { type: 'refused', message, by: 'plugin' } : { type: 'notice', message }) };
  /** The composer's "+" menu of a list note: the New actions (as every tab has them), then "Undo last sentence" and "Redo", shown disabled (never hidden) when there is nothing to undo or redo. */
  function withListMenu(path: string, base: ReturnType<NonNullable<DescriptionPorts['composerMenu']>>, contentEl: HTMLElement): NonNullable<PromptBoxPorts['menu']> {
    return {
      items: base?.items ?? [],
      trailing: [{ id: UNDO_ID, label: UNDO_LABEL }, { id: REDO_ID, label: REDO_LABEL }, ...(familyOfPath(path) !== null ? [{ id: TRANSLATE_ID, label: TRANSLATE_LABEL }] : [])],                  // after "Insert a link to a note": the New actions first, the link, then these two
      run: (id) => { if (id === UNDO_ID) guarded(contentEl, path, () => { void undoLast(path, 'menu'); }); else if (id === REDO_ID) guarded(contentEl, path, () => { void redoLast(path, 'menu'); }); else if (id === TRANSLATE_ID) { const n = translatableLine(path); if (n !== null) boxes.get(contentEl)?.handle.suggest(`Translate line ${n}.`); } else base?.run(id); },
      ...(base?.pickNote ? { pickNote: base.pickNote } : {}),
      enabled: (id) => (id === UNDO_ID ? canStep(path, 'undo') : id === REDO_ID ? canStep(path, 'redo') : id === TRANSLATE_ID ? translatableLine(path) !== null : true),
    };
  }

  type Asked = { ok: true; params: GrammarParams; /** 2026-11-20-1003: the service answered in canonical LINES (already checked by the grammar, seeds drawn): they are the plan itself */ lines?: string[]; droppedNotice?: string } | { ok: false; message: string };
  /** 2026-11-12-1206: the service's answer for an ARRANGEMENT or a COMPOSITION sentence, read by the plugin's own validators and the vault's lists, gated on the service version, and (a composition) checked for loops through the vault. */
  async function askNewKind(res: { status: number; json: unknown }, payload: PlanPayload): Promise<Asked> {
    const family = payload.family!;
    const fam = interpretFamilyResponse(res, { family, kits: payload.kits, phrases: payload.phrases, arrangements: payload.arrangements, compositions: payload.compositions, note: payload.note });
    if (fam.ok === false) {
      if (fam.suspectOld && ports.serviceVersion) {                                                      // no version in the answer: ask /health, once; a version that cannot be read is not "old"
        let v: string | null = null; try { v = await ports.serviceVersion(); } catch { v = null; }
        if (versionAtLeast(v, FAMILY_SERVICE_VERSION) === false) return { ok: false, message: OLD_FAMILY_SERVICE(v) };
      }
      return { ok: false, message: fam.message };
    }
    const loop = await loopRefusalOf(payload.note ?? '', fam.params);
    if (loop !== null) return { ok: false, message: loop };
    return { ok: true, params: fam.params };
  }

  async function ask(path: string): Promise<void> {
    const u = ui.get(path);
    const family = familyOfPath(path);
    if (family === null) return;                                                                          // a note that is not ours costs nothing and says nothing
    if (!u || u.state.kind !== 'rejected' || !ports.askPlan) { pb(`ask skipped: ${!u ? 'no pending sentence for this note' : u.state.kind !== 'rejected' ? `the note's state is ${u.state.kind}` : 'no sentence service in this build'}`); return; }
    if (u.busy) { pb('ask skipped: a request is already in flight'); return; }                                                                                    // ONE request in flight: a second ask while the service thinks does nothing
    const sentence = u.state.sentence; fp?.svc(path, null);
    const v = ports.vault();
    const req = family === 'phrase'
      ? buildPlanRequest({ sentence, barNames: ports.barNames(), phraseNames: ports.phraseNames(), ownKey: ports.ownKey?.() })
      : buildFamilyPlanRequest({ family, sentence, kitNames: v.kits, phraseNames: ports.phraseNames(), arrangementNames: v.arrangements, compositionNames: v.compositions, note: path.replace(/\.md$/, ''), ownKey: ports.ownKey?.() });
    const keepBox = (x: Ui): Ui => (x.fromBox ? { ...x, fromBox: true, base: x.base } : x);
    if (req.ok === false) { fp?.svc(path, 'none', req.message); pbWarn(`request not built: ${req.message}`); set(path, keepBox({ state: u.state, message: req.message, fromBox: u.fromBox, base: u.base })); if (u.fromBox) { setBoxNote(path, req.message); say(path, { type: 'notice', message: req.message }); } return; }
    set(path, { ...u, busy: true });
    if (u.fromBox) { setBoxBusy(path, 'Asking the sentence service...'); say(path, { type: 'asking' }); }
    ports.trace(askingServiceLine(basename(path)));                                                         // 2026-11-13-1209 (C): a request LEFT
    let outcome: Asked; let question: string | null = null; let code = 200;
    try {
      // 2026-11-20-1003 (THE SENTENCE SERVICE AS THE FLUENT FRONT END): a sentence typed in the composer goes with the grammar table, the note's own lines and the Score's bar numbers, and may be answered with CANONICAL LINES
      // (each one checked by the grammar before anything is shown) or ONE clarifying question; an answer with neither is the old plan, read as it always was. The work is in service-lines-core (behind the seam); lean asks the old way.
      const a = await listModel.service.ask({
        payload: req.payload, askPlan: (x) => ports.askPlan!(x as PlanPayload), fromBox: u.fromBox, family, previous: asked.get(path), readNote: () => ports.read(path), pane: paneOf(path), vault: ports.vault(), ctx: ctxFor(path), draw: ports.drawSeed ?? defaultSeed,
        legacy: async (res) => (code = res.status, family === 'phrase' ? interpretPlanResponse(res, req.payload.bars) : await askNewKind(res, req.payload)),
      });
      outcome = a; question = 'question' in a && a.question !== undefined ? a.question : null;
      if (question === null) asked.delete(path);
    }
    catch (e) { code = 0; outcome = { ok: false, message: `Could not reach the transpile service (${(e as Error)?.message ?? e}). Check your connection and Settings → Forge Actions (Beta) → Transpile service URL.` }; }
    if (u.fromBox) setBoxBusy(path, null);
    if (cancelledAsk.has(path)) {                                                                        // 2026-11-17-2001: Esc while the service thought: the answer is dropped, said once
      ports.trace(askedServiceLine(basename(path), 'dropped: cancelled'));
      if (!disposed) { say(path, { type: 'dropped', message: 'cancelled' }); set(path, { state: u.state, ...(u.fromBox ? { fromBox: true, base: u.base } : {}) }); }
      return;
    }
    // 2026-11-13-1209 (B): every way out after a request left ends VISIBLE and TRACED (a message under the box and in the strip, a `dropped: <why>` trace line), never silent.
    const dropVisibly = async (why: string, message: string, strip?: Ui): Promise<void> => {
      droppedAsk.add(path);
      ports.trace(askedServiceLine(basename(path), `dropped: ${why}`));
      if (disposed) return;
      askMessage.set(path, message); setBoxNote(path, message); say(path, { type: 'dropped', message: message.replace(/\.$/, '') }); endSuggestion(path, 'expired');
      if (strip) { set(path, strip); return; }
      let disk = ''; try { disk = await ports.read(path); } catch { /* the note went away: the notice keys on text that no longer exists, so it simply never shows */ }
      notices.set(path, { message, text: disk, fromBox: true }); syncBars();
    };
    const now = ui.get(path);
    if (disposed || !now || now.state.kind !== 'rejected' || now.state.sentence !== sentence) { await dropVisibly('the note changed while the service thought', 'The answer came back after the text changed; ask again.'); return; }
    if (now.fromBox && boxText(path) !== sentence) {                                                      // the person typed on in the box while the service thought: the answer is for a sentence that is gone
      const message = 'The Description changed while the service was thinking; its suggestion was dropped.';
      await dropVisibly('the text in the box changed', message, { state: now.state, message, fromBox: true, base: now.base });
      return;
    }
    if (question !== null) {                                                                              // 2026-11-20-1003: one clarifying question: said in the dialog, nothing written; the next sentence that needs the service goes back with it
      asked.set(path, { sentence, question }); ports.trace(askedServiceLine(basename(path), 'question'));
      const m = `The service asks: ${question}`;
      set(path, { state: now.state, message: question, ...(now.fromBox ? { fromBox: true, base: now.base } : {}) });
      if (now.fromBox) { askMessage.set(path, m); setBoxNote(path, question); say(path, { type: 'notice', message: m }); }
      return;
    }
    ports.trace(askedServiceLine(basename(path), outcome.ok === false ? `refused: ${outcome.message}` : `${outcome.params.kind}`));
    if (outcome.ok === false) { fp?.svc(path, code, outcome.message); set(path, { state: now.state, message: outcome.message, ...(now.fromBox ? { fromBox: true, base: now.base } : {}) }); if (now.fromBox) { askMessage.set(path, `The service refused: ${outcome.message}`); setBoxNote(path, `The service refused: ${outcome.message}`); say(path, { type: 'refused', message: outcome.message }); } return; }
    const name = basename(path);
    const recipe = (outcome.params.kind === 'arrangement' || outcome.params.kind === 'composition' ? familyRecipeSteps(outcome.params) : phraseRecipeSteps(outcome.params as PhraseParams)).join('\n');
    // 2026-11-19-0970: for an arrangement or a composition the service's plan is the CANONICAL LINES of what the typed sentence says; they are appended to the note's list (a Description edited by hand that the grammar could not read: the whole list)
    let listed: { description: string; lines: string[]; replaces?: string } | null = null;
    if (FAMILY_KINDS[family].includes(outcome.params.kind)) {
      let cur = ''; try { cur = await ports.read(path); } catch { /* the note went away: the apply says so */ }
      const lines = outcome.lines ?? linesOfParams(outcome.params, family);
      const plan = await planAppend(now.fromBox ? listOf(cur, family) : [], family, lines, ctxFor(path));
      if (plan.ok === false || (plan.unchanged && now.fromBox)) {
        const message = plan.ok === false ? (plan.reason === 'loop' ? plan.message : `The suggestion does not fit this note: ${plan.message}`) : 'Nothing changed: the note already says this.';
        set(path, { state: now.state, message, ...(now.fromBox ? { fromBox: true, base: now.base } : {}) });
        if (now.fromBox) { askMessage.set(path, plan.ok === false ? `Refused: ${message}` : message); setBoxNote(path, message); say(path, plan.ok === false ? { type: 'refused', message, by: 'plugin' } : { type: 'notice', message }); }
        return;
      }
      const replaces = plan.replaced.map((r) => r.sentence).join(' ');
      listed = { description: (now.fromBox ? plan.added : plan.list).join(' '), lines, ...(replaces !== '' ? { replaces } : {}) };
    }
    const shown = listed?.description ?? describe(outcome.params);
    set(path, { state: now.state, ...(now.fromBox ? { fromBox: true, base: now.base } : {}), preview: { params: outcome.params, forSentence: sentence, description: shown, recipe, ...(listed ? { lines: listed.lines, ...(listed.replaces ? { replaces: listed.replaces } : {}) } : {}) } });
    if (now.fromBox && outcome.droppedNotice !== undefined) say(path, { type: 'notice', message: outcome.droppedNotice });
    if (now.fromBox) { setBoxNote(path, 'The service answered: the suggestion is in the dialog.'); say(path, { type: 'suggestion', description: shown, recipe, ...(listed?.replaces ? { replaces: listed.replaces } : {}) }); }
    if (family === 'phrase') void phraseDescription(name, outcome.params as PhraseParams);
  }

  async function applyPreview(path: string): Promise<{ ok: boolean; disk?: string; message?: string }> {
    const family = familyOfPath(path); const u = ui.get(path);
    if (family === null || !u?.preview) return { ok: false, message: 'There is nothing to apply.' };                // never without a preview
    const { params, forSentence } = u.preview;
    { const loop = await loopRefusalOf(noteId(path), params as GrammarParams);                                // the vault may have moved since the preview was made (another composition edited): asked once more, the same words
      if (loop !== null) { set(path, { state: u.state, message: loop, ...(u.fromBox ? { fromBox: true, base: u.base } : {}) }); if (u.fromBox) { endSuggestion(path, 'expired'); say(path, { type: 'refused', message: loop, by: 'plugin' }); } return { ok: false, message: loop }; } }
    // a suggestion for a sentence typed in the BOX: nothing was written for it, so the Description on disk must be what it was when the sentence was sent, and the box must still hold that sentence
    if (u.fromBox && boxText(path) !== undefined && boxText(path) !== forSentence) { set(path, { state: u.state, message: 'The text in the box changed after the suggestion; ask again.', fromBox: true, base: u.base }); endSuggestion(path, 'expired'); say(path, { type: 'notice', message: 'The text in the box changed after the suggestion; ask again.' }); return { ok: false, message: 'The text in the box changed after the suggestion; ask again.' }; }
    if (u.preview.lines !== undefined) return applyListPreview(path, family, u);                            // 2026-11-19-0970 / 0980: the service's lines are appended to the list (a note's Description is always a list now)
    const message = 'The suggestion does not fit this note.';                                                   // a service answer of another kind than the note's: ask() never previews it, so this is a guard, not a path
    set(path, { state: u.state, message, ...(u.fromBox ? { fromBox: true, base: u.base } : {}) }); if (u.fromBox) { endSuggestion(path, 'expired'); say(path, { type: 'failed', message }); }
    return { ok: false, message };
  }

  /** 2026-11-17-2001 - the composer's FIRST Enter: what would this sentence do? Nothing is written. The grammar reads it first (free, instant, exact); when it cannot, the sentence service is asked ONCE (the same gates as
   *  before). The answer is a proposal (its canonical wording) the person sees in the dialog and applies with a second Enter, or a reason it cannot be one (the line under the card says it). */
  async function previewFromBox(path: string, text: string, instant = false): Promise<PreviewResult> {
    try { return await previewFromBoxCore(path, text, instant); }
    catch (e) {                                                                                           // never silent (2026-11-13-1211): the console, the dialog and the line under the card say it
      const why = (e as Error)?.message ?? String(e);
      pbWarn(`preview failed: ${why}`); console.error('[forge-promptbox] preview failed', e);
      say(path, { type: 'failed', message: why });
      return { ok: false, message: `Could not ask: ${why}` };
    }
  }
  async function previewFromBoxCore(path: string, text: string, instant = false): Promise<PreviewResult> {
    if (isBarPath(path)) {                                                                                   // 2026-11-19-0993: a bar's composer reads the bar grammar locally (no model call)
      pb(`preview asked: ${basename(path)} family=bar text=${text.length} chars`);
      say(path, { type: 'you', text });
      const typed = listModel.typed.preview(path, text, stepPorts); if (typed !== null) return typed;         // 2026-11-20-1002: a typed Undo or Redo is read before the bar grammar
      let cur = ''; try { cur = await ports.read(path); } catch (e) { const m = `Could not read the note: ${(e as Error)?.message ?? e}`; say(path, { type: 'failed', message: m }); return { ok: false, message: m }; }
      return bar.previewBar(path, text, cur, instant);
    }
    const family = familyOfPath(path);
    if (family === null) { pbWarn(`preview skipped: ${path} is not a phrase, arrangement or composition note`); return { ok: false, message: 'This note is not a phrase, arrangement or composition.' }; }
    pb(`preview asked: ${basename(path)} family=${family} text=${text.length} chars`);
    say(path, { type: 'you', text });
    cancelledAsk.delete(path);
    let cur = '';
    try { cur = await ports.read(path); } catch (e) { const m = `Could not read the note: ${(e as Error)?.message ?? e}`; say(path, { type: 'failed', message: m }); return { ok: false, message: m }; }
    const typed = listModel.typed.preview(path, text, stepPorts); if (typed !== null) return typed;         // 2026-11-20-1002: `Undo`, `Undo 3`, `Redo` are read here (the reader of Duplicate): never a line, never the service
    if (family === 'phrase') { const act = listModel.duplicate.readActionText(text); if (act.kind === 'duplicate' || act.kind === 'refused') return previewAction(path, act, instant); }          // 2026-11-19-0992: `Duplicate [[bar_007]].` is an ACTION sentence, read here (no model call) and never a line of the list
    const tr = listModel.waiting.translate(text); if (tr !== null) return previewTranslate(path, family, tr.n, cur, text);          // 2026-11-21-1015: `Translate line N.` is read here: never a line, never sent as a sentence
    return previewList(path, family, text, cur, instant);                                                          // 2026-11-19-0970 / 0980: the typed sentence APPENDED to the list (or in place of the line it replaces), nothing written
  }
  /** The service, once, for a sentence the grammar did not accept (the same gates as ever); its answer is the proposal the composer shows, or why there is none. (2026-11-19-0970: the tail of previewFromBoxCore, shared with the list.) */
  async function askTail(path: string, sentence: string, rejectedText: string): Promise<PreviewResult> {
    const gateLine = `service gate: askPlan=${ports.askPlan === undefined ? 'absent' : 'present'} configured=${ports.configured === undefined ? 'unset' : String(ports.configured())}`;
    if (ports.askPlan === undefined) { pbWarn(gateLine); const m = 'The sentence service is not available in this build.'; say(path, { type: 'notice', message: m }); fp?.fail(path, sentence, 'none', m); return { ok: false, message: `${rejectedText} ${m}` }; }
    if (ports.configured?.() === false) { pbWarn(gateLine); const m = 'The sentence service is not set up: add its URL and token in Settings → Forge Actions (Beta).'; say(path, { type: 'notice', message: m }); fp?.fail(path, sentence, 'not-set-up', m); return { ok: false, message: `${rejectedText} ${m}` }; }
    pb(gateLine);
    askMessage.delete(path); droppedAsk.delete(path);
    await ask(path);
    if (cancelledAsk.delete(path)) { fp?.fail(path, sentence, 'cancelled'); return { ok: false, message: 'Cancelled.' }; }
    const after = ui.get(path);
    if (after?.preview && after.preview.forSentence === sentence) return { ok: true, proposal: { description: after.preview.description, via: 'service', ...(after.preview.replaces ? { replaces: after.preview.replaces } : {}) } };
    fp?.ended(path, sentence);
    return { ok: false, message: askMessage.get(path) ?? after?.message ?? 'The service did not suggest anything.' };
  }

  /** 2026-11-17-2001 - Esc on a preview (or typing over it): drop the proposal, nothing was written. */
  function discardPreview(path: string): void {
    previewed.delete(path);
    const u = ui.get(path); if (u?.preview) { if (u.fromBox) fp?.fail(path, u.preview.forSentence, 'cancelled'); const rest = { ...u }; delete rest.preview; set(path, rest); }
    bar.discard(path);
    endSuggestion(path, 'cancelled');
  }

  /** 2026-11-17-2001 - the composer's SECOND Enter: write what the person saw. A service proposal goes through the preview the service made; a grammar proposal through the same writers "Update from Description" uses. */
  async function applyProposal(path: string, text: string, proposal: Proposal): Promise<{ ok: boolean; disk?: string; message?: string }> {
    pb(`apply pressed: ${basename(path)} family=${familyOfPath(path) ?? 'none'} text=${text.length} chars via=${proposal.via}`);
    try {
      if (proposal.via === 'service') return await applyPreview(path);
      const r = await applyFromBoxCore(path, proposal.instead ?? text, true, !!(proposal.instant || proposal.instead), proposal.instead !== undefined ? text : undefined);          // 2026-11-21-1015: the repaired line keeps the words the person typed          // 2026-11-20-1002: a "did you mean" applies the SUGGESTION, in the instant words
      const fail = ui.get(path)?.message;
      if (r.ok) endSuggestion(path, 'applied');
      return r.ok ? r : { ok: false, message: r.message ?? fail ?? 'It did not go through.' };
    } catch (e) {                                                                                         // never silent (2026-11-13-1211): the console, the dialog and the line under the card say it
      const why = (e as Error)?.message ?? String(e);
      pbWarn(`apply failed: ${why}`); console.error('[forge-promptbox] apply failed', e);
      say(path, { type: 'failed', message: why });
      return { ok: false, message: `Apply failed: ${why}` };
    }
  }

  const api = {
    modified(path) {
      if (disposed || (familyOfPath(path) === null && !isBarPath(path))) return;
      void refreshBoxes(path);                                                                         // a control wrote the Description (or a hand edit): the box follows at once, not after the debounce
      const prior = timers.get(path); if (prior !== undefined) ports.clearTimer(prior);
      timers.set(path, ports.setTimer(() => { timers.delete(path); void evaluate(path, true); }, DESCRIPTION_DEBOUNCE_MS));       // a second edit inside the wait replaces the first: the first is never written
    },
    inspect: (path) => evaluate(path, false),
    drop(path) { const t = timers.get(path); if (t !== undefined) { ports.clearTimer(t); timers.delete(path); } },
    async reset(path) { const t = timers.get(path); if (t !== undefined) { ports.clearTimer(t); timers.delete(path); } ui.delete(path); told.delete(path); notices.delete(path); stacks.delete(path); bar.reset(path); previewed.delete(path); syncBars(); await evaluate(path, false); },
    async inspectOpen() {
      if (disposed) return;
      const todo = new Set<string>();
      for (const { path, contentEl } of ports.panes()) { if (looked.get(contentEl) === path) continue; looked.set(contentEl, path); todo.add(path); }
      for (const path of todo) await evaluate(path, false);
    },
    canRevertGenerated: (path) => { const st = ui.get(path)?.state; return st?.kind === 'custom-note' && st.canRevert; },
    revertGenerated,
    focusBox(path) { for (const b of boxes.values()) if (path === undefined || b.path === path) { b.handle.focus(); return true; } return false; },
    applyFromBox, previewFromBox, applyProposal,
    duplicateArmed, duplicateClick,
    appendLine, undoLast, redoLast, canUndo: (path) => canStep(path, 'undo'), canRedo: (path) => canStep(path, 'redo'),
    update, revert, ask, syncBars,
    canUpdate: (path) => { const u = ui.get(path); return u !== undefined && (u.state.kind === 'apply' || u.state.kind === 'recipe-apply' || u.state.kind === 'python-apply' || u.state.kind === 'python-custom'); },
    dispose() { disposed = true; bar.dispose(); notices.clear(); stacks.clear(); previewed.clear(); for (const t of timers.values()) ports.clearTimer(t); timers.clear(); for (const h of bars.values()) h.dispose(); bars.clear(); for (const b of boxes.values()) b.handle.dispose(); boxes.clear(); ui.clear(); },
  };
  ports.failedPrompts?.attach?.(api);          // 2026-11-20-1004: the review tab's "Apply to the open note" goes through this controller's appendLine
  return api;
}
