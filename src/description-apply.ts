// 2026-10-31-1140 (M16a): the same controller also hears a hand-edited RECIPE (the Recipe is a source too): it parses (applied by ONE `process`, the Description, Python, json cache and stamps made again from it), it does not parse (nothing is
// written; the bar says the line and the column; Revert), or the Description was edited too (nothing is applied; the bar offers Update from Description / Update from Recipe). One controller and one bar per pane, so a note with two
// things to say is said once. The service is NOT offered for a Recipe (no LLM): a Recipe that does not parse is the person's to fix.
// 2026-10-31-1120 (M15c) - "Update from Description": the controller. It hears the vault's `modify` of a phrase, arrangement or composition note, waits for the person to stop typing (DESCRIPTION_DEBOUNCE_MS), reads the CURRENT text,
// and asks description-apply-core what the Description means: it parses (applied by ONE `process`, the same writers the controls use), it does not parse (nothing is written; the sentence says where; Revert; and, for a phrase, "Ask the
// sentence service", which only ever PREVIEWS), or the derived Recipe / Python was edited (said, not applied). No `obsidian` import: the vault, the clock, the service and the panes are ports (score-first.ts wires them, only in a
// score-first vault: P3).
import { mountDescriptionBar, type BarAction, type BarHandle, type BarView } from './description-bar-dom.ts';
import {
  DESCRIPTION_DEBOUNCE_MS, REVERT_GENERATED_CONFIRM, appliedLine, applyDescriptionText, applyPythonText, applyRecipeText, askedServiceLine, askingServiceLine, cacheParams, changeSummary, descriptionState, familyOfPath, rejectedLine, revertDescriptionText, revertToGeneratedText, revertedLine, writeFromParams, pythonCustomBarMessage,
  type DescriptionState, type Family,
} from './description-apply-core.ts';
import { bothEditedLine, recipeAppliedLine, recipeRejectedLine, recipeRevertedLine } from './recipe-apply-core.ts';
import { COMMENTS_NOT_KEPT_BAR, bothEditedLineOf, pythonAppliedLine, pythonCustomLine, pythonRevertedLine } from './python-apply-core.ts';
import { CUSTOM_BANNER } from './phrase-notes-core.ts';
import type { GrammarParams, GrammarVault } from './phrase-grammar-core.ts';
import { buildPlanRequest, interpretPlanResponse, type PlanPayload } from './sentence-plan-core.ts';
import { FAMILY_SERVICE_VERSION, OLD_FAMILY_SERVICE, buildFamilyPlanRequest, compositionLoopRefusal, familyRecipeSteps, interpretFamilyResponse } from './sentence-plan-families-core.ts';
import { versionAtLeast } from './notebook-request-core.ts';
import { readCompositionNote } from './composition-core.ts';
import { phraseDescription, phraseRecipeSteps } from './phrase-notes-core.ts';
import { describe } from './phrase-describe-core.ts';
import { extractDescription } from './v2-note-core.ts';
import type { PhraseParams } from './phrase-core.ts';
import type { PromptBoxHandle } from './prompt-box-dom.ts';
import { mountChatPanel, type ChatPanelHandle } from './chat-panel-dom.ts';
import { append, expireOpen, fromOutcome, memoryStore, openSuggestion, resolveSuggestion, type DialogEntry, type DialogEvent, type DialogStore } from './dialog-core.ts';
import { replaceDescriptionSection } from './prompt-box-core.ts';
import { isEmptyNote } from './empty-note-core.ts';
import type { ComposerMenuItem, PreviewResult } from './prompt-box-dom.ts';
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
  configured?(): boolean;
  ownKey?(): string | undefined;
  /** 2026-11-12-1206: the service's /health version, or null. Asked only when an answer to an arrangement or composition sentence carried no version and was a refusal (a service before 0.2.42): to tell an old service from a sentence it cannot plan. */
  serviceVersion?(): Promise<string | null>;
  /** 2026-11-15-1217: is the one status line under the box (2026-11-13-1211) shown? The dialog says every outcome in words, so the default view drops the duplicate; `false` = never drawn (the busy state and the dialog are untouched). Absent = shown, as before. Asked at every outcome (the setting is read live). */
  showBoxStatus?(): boolean;
  /** 2026-11-13-1214: where the dialog's history is kept per note (the plugin's data.json); absent = the session's own memory. */
  dialogStore?: DialogStore;
  /** The clock of the dialog's time stamps (tests). */
  now?(): number;
  /** Ask the person to confirm a step that loses something ("Revert to generated"); absent = it goes ahead. */
  confirm?(message: string): Promise<boolean>;
  /** 2026-11-17-2001: MUSIC_COMPOSER_AUTO_APPLY (default off): a sentence the grammar reads exactly skips the preview. */
  composerAutoApply?(): boolean;
  /** 2026-11-17-2001: the composer's "+" menu (the New actions; `pickNote` gives "Insert a link to a note"); absent = no "+". */
  composerMenu?(): { items: readonly ComposerMenuItem[]; run(id: string): void; pickNote?(): Promise<string | null> } | undefined;
}

interface Ui { state: DescriptionState; message?: string; preview?: { params: GrammarParams; description: string; recipe: string; forSentence: string }; busy?: boolean; /** the sentence was typed in the prompt box (nothing was written to the note: there is no Revert to offer) */ fromBox?: boolean; /** from the box: the Description ON DISK when the sentence was sent (a preview is applied only over that) */ base?: string }
const basename = (path: string): string => path.replace(/^.*\//, '').replace(/\.md$/, '');

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
  /** 2026-11-16-1000: show `text` in this note's prompt box as a PREVIEW (edited, not applied; nothing is written until Apply). false = the note has no prompt box on screen. */
  suggestInBox(path: string, text: string): boolean;
  /** Apply this text as the note's Description, as the prompt box's Apply does (the existing "Update from Description" writers; a sentence that does not parse writes nothing and the strip says where). */
  applyFromBox(path: string, text: string): Promise<{ ok: boolean; disk?: string }>;
  /** 2026-11-17-2001: what would this sentence do? The grammar first, the sentence service when it cannot read it; NOTHING is written. */
  previewFromBox(path: string, text: string): Promise<PreviewResult>;
  /** 2026-11-17-2001: write what the person saw (the second Enter). */
  applyProposal(path: string, text: string, proposal: Proposal): Promise<{ ok: boolean; disk?: string; message?: string }>;
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
  const cancelledAsk = new Set<string>();                         // 2026-11-17-2001: Esc while the service thinks: its answer is dropped
  const looked = new WeakMap<HTMLElement, string>();              // pane element -> the note path it was last looked at for (a pane is read once per note it shows)
  let disposed = false;
  // ---- 2026-11-13-1214: the dialog. The history of what happened to a note's Description (per note, newest last, capped), the last note text we saw (to tell a control's change from a hand edit), the pinned "Current:" line.
  const store: DialogStore = ports.dialogStore ?? memoryStore();
  const dialogs = new Map<string, DialogEntry[]>();
  const lastText = new Map<string, string>();
  const nowMs = (): number => (ports.now ? ports.now() : Date.now());
  const historyOf = (path: string): DialogEntry[] => { let l = dialogs.get(path); if (!l) { l = store.entries(path); dialogs.set(path, l); } return l; };
  const currentOf = (path: string): string => { const t = lastText.get(path); return t === undefined ? '' : extractDescription(t).replace(/\s+/g, ' ').trim(); };
  const drawDialog = (path: string): void => { const h = historyOf(path), c = currentOf(path); for (const b of boxes.values()) if (b.path === path) b.chat.render(h, c); };
  /** ONE event stream: what the controller says happened to the Description. Only a box-origin outcome is drawn here (the strip keeps the text view's and the hand edits'). */
  const say = (path: string, ev: DialogEvent): void => {
    let l = historyOf(path);
    if (ev.type === 'suggestion' || ev.type === 'you') l = expireOpen(l);                                  // a new sentence or a newer suggestion ends the older one
    l = append(l, fromOutcome(ev), nowMs());
    dialogs.set(path, l); store.setEntries(path, l); drawDialog(path);
  };
  const endSuggestion = (path: string, state: 'applied' | 'cancelled' | 'expired'): void => {
    const l = historyOf(path), open = openSuggestion(l); if (!open) return;
    const next = resolveSuggestion(l, open.id, state); dialogs.set(path, next); store.setEntries(path, next); drawDialog(path);
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

  const viewOf = (path: string, u: Ui): BarView => {
    const family = familyOfPath(path);
    const st = u.state;
    if (u.preview) return { message: u.message ?? 'The sentence service suggests this. Nothing is written until you press Apply.', actions: ['apply-preview', 'cancel-preview'], preview: { description: u.preview.description, recipe: u.preview.recipe }, busy: u.busy };
    if (st.kind === 'rejected') {
      const offer = ports.askPlan !== undefined && ports.configured?.() !== false;               // 2026-11-12-1206: a phrase, an arrangement or a composition (forge-transpile 0.2.48 plans all three)
      return { message: u.message ?? st.message, actions: [...(u.fromBox ? [] : ['revert' as const]), ...(offer ? ['ask' as const] : [])], busy: u.busy };
    }
    if (st.kind === 'apply') return { message: u.message ?? `The Description changed (${st.change}); update the note from it.`, actions: ['update', 'revert'], busy: u.busy };
    if (st.kind === 'recipe-rejected') return { message: u.message ?? st.message, actions: ['revert'], busy: u.busy };               // no "Ask the sentence service" for a Recipe: no LLM, the person fixes it
    if (st.kind === 'recipe-apply') return { message: u.message ?? `The Recipe changed (${st.change}); update the note from it.`, actions: ['update-recipe', 'revert'], busy: u.busy };
    if (st.kind === 'python-apply') return { message: u.message ?? `The Python changed (${st.change}); update the note from it.`, actions: ['update-python', 'revert'], busy: u.busy };
    if (st.kind === 'python-custom') return { message: u.message ?? pythonCustomBarMessage(st.already), actions: ['update-python', 'revert'], busy: u.busy };
    if (st.kind === 'custom-note') return { message: u.message ?? CUSTOM_BANNER, actions: st.canRevert ? ['revert-generated'] : [], busy: u.busy, tone: 'custom' };
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
  const descriptionOf = async (path: string): Promise<string | null> => { try { return extractDescription(await ports.read(path)); } catch { return null; } };
  const syncBoxes = (): void => {
    if (disposed) return;
    const live = new Set<HTMLElement>();
    for (const { path, contentEl, tab } of ports.panes()) {
      if (tab !== true || familyOfPath(path) === null) continue;
      if (ui.get(path)?.state.kind === 'custom-note') continue;                                              // a custom note: its Python is the source, the Description is not applied: no box
      live.add(contentEl);
      const have = boxes.get(contentEl);
      if (have && have.path === path && have.chat.attached()) continue;
      if (have) { have.chat.dispose(); boxes.delete(contentEl); }
      void (async () => {
        let note = ''; try { note = await ports.read(path); } catch { return; }
        if (disposed || boxes.has(contentEl)) return;
        const family = familyOfPath(path)!;
        if (!lastText.has(path)) lastText.set(path, note);                                                // 2026-11-13-1214: the text the first control change is compared with
        const chat = mountChatPanel(contentEl, {
          box: {
            preview: (text) => previewFromBox(path, text),
            apply: (text, proposal) => applyProposal(path, text, proposal),
            cancel: () => { cancelledAsk.add(path); },
            discard: () => { discardPreview(path); },
            autoApply: () => ports.composerAutoApply?.() === true,
            menu: ports.composerMenu?.(),
            history: { get: () => sentHistory.get(path) ?? [], set: (next) => { sentHistory.set(path, [...next]); } },
          },
          store,
        }, extractDescription(note));
        const handle = chat.box;
        boxes.set(contentEl, { path, handle, chat });
        drawDialog(path);
        if (isEmptyNote(note)) handle.focus();                                                                // 2026-11-19-0960: a NEW note is empty: the tab opens with the composer focused and nothing else to do
        pb(`box mounted: ${basename(path)} family=${family} askPlan=${ports.askPlan === undefined ? 'absent' : 'present'} configured=${ports.configured === undefined ? 'unset' : String(ports.configured())}`);       // 2026-11-13-1211: the first line the driver sees on opening a tab: this build is live and the service gate says what it will do before Apply is pressed
      })();
    }
    for (const [el, b] of [...boxes]) if (!live.has(el)) { b.chat.dispose(); boxes.delete(el); }
  };
  const boxText = (path: string): string | undefined => { for (const b of boxes.values()) if (b.path === path) return b.handle.state().text; return undefined; };
  const setBoxBusy = (path: string, message: string | null): void => { for (const b of boxes.values()) if (b.path === path) b.handle.setBusy(message); };
  const setBoxNote = (path: string, message: string | null): void => { if (message !== null && ports.showBoxStatus && !ports.showBoxStatus()) return; for (const b of boxes.values()) if (b.path === path) b.handle.setNote(message); };        // 2026-11-15-1217: the status line is the legacy view; a clear (null) always goes through
  /** The Description on disk, again, into every box of this note (a control wrote it, a hand edit, an apply): unapplied typing is never overwritten (the box offers the choice). */
  const refreshBoxes = async (path: string): Promise<void> => {
    if (disposed) return;
    syncBoxes();                                                                                       // a tab that rebuilt itself took its box with it: draw it again
    const targets = [...boxes.values()].filter((b) => b.path === path);
    if (targets.length === 0) return;
    const d = await descriptionOf(path);
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
  async function applyFromBoxCore(path: string, text: string, said = false): Promise<{ ok: boolean; disk?: string; message?: string }> {
    const family = familyOfPath(path); if (family === null) { pbWarn(`ask skipped: ${path} is not a phrase, arrangement or composition note`); return { ok: false }; }
    if (!said) say(path, { type: 'you', text });                                                          // 2026-11-13-1214: the sentence as typed, when Apply is pressed (2026-11-17-2001: said already when the preview was asked for)
    let failure: string | null = null, change = '', sentence = text;
    {                                                                                                       // 2026-11-19-0910: the box's apply (the second Enter, or an apply with no preview) asks the same loop check before it writes
      let now = ''; try { now = await ports.read(path); } catch { /* the write below says so */ }
      const edited0 = now === '' ? null : replaceDescriptionSection(now, text); const st0 = edited0 === null ? null : descriptionState(edited0, family, ports.vault());
      const loop = st0 !== null && st0.kind === 'apply' ? await loopRefusalOf(noteId(path), st0.params) : null;
      if (loop !== null) { pb(`apply refused: ${loop}`); say(path, { type: 'refused', message: loop, by: 'plugin' }); setBoxNote(path, `Refused: ${loop}`); return { ok: false, message: `Refused: ${loop}` } as { ok: boolean; disk?: string; message?: string }; }
    }
    try {
      await proc(path, (cur) => {
        const edited = replaceDescriptionSection(cur, text);
        if (edited === null) { failure = 'This note has no Description heading to write the sentence under.'; return cur; }
        const st = descriptionState(edited, family, ports.vault());
        if (st.kind === 'rejected' || st.kind === 'both-edited') { failure = st.message; sentence = st.kind === 'rejected' ? st.sentence : text; return cur; }
        if (st.kind !== 'apply') { if (st.kind === 'synced') return cur; failure = 'This note has something else to say first; see the line at the top.'; return cur; }
        const r = applyDescriptionText(edited, basename(path), family, ports.vault(), st.sentence);
        if (r.ok === false) { failure = r.message; return cur; }
        change = r.change;
        return r.text;
      });
    } catch (e) { failure = `Update from Description: ${(e as Error)?.message ?? e}`; console.error('prompt-box: could not write the note', e); pbWarn(`could not write the note: ${(e as Error)?.message ?? e}`); }
    if (failure !== null) {
      const cur = await ports.read(path).catch(() => '');
      const st = descriptionState(replaceDescriptionSection(cur, text) ?? cur, family, ports.vault());
      const state: DescriptionState = st.kind === 'rejected' ? st : { kind: 'rejected', sentence, error: { message: failure, line: 1, column: 1 }, message: failure };
      const base = extractDescription(cur);
      set(path, { state, message: failure, fromBox: true, base });
      pb(`grammar verdict: ${st.kind === 'rejected' || st.kind === 'both-edited' ? st.kind : `other:${st.kind}`}`);
      const gateLine = `service gate: askPlan=${ports.askPlan === undefined ? 'absent' : 'present'} configured=${ports.configured === undefined ? 'unset' : String(ports.configured())}`;
      setBoxNote(path, st.kind === 'rejected' ? `The grammar did not accept this sentence (line ${st.error.line}, column ${st.error.column}: ${st.error.message}).` : failure);
      if (st.kind === 'rejected') say(path, { type: 'rejected', line: st.error.line, column: st.error.column, message: st.error.message }); else say(path, { type: 'notice', message: failure });
      // 2026-11-12-1204: the GRAMMAR rejected the text (free, instant, exact: tried first, always). For a PHRASE, with the sentence service set up, Apply asks it ONCE, automatically, and shows the PREVIEW (nothing is written until it is
      // applied). Never while typing, never when the grammar accepted the text. 2026-11-12-1206: for an arrangement and a composition too (the service is version-gated for them: an older one says so, in one sentence).
      if (st.kind !== 'rejected') { pb(`ask skipped: the verdict is ${st.kind}, not a sentence the grammar rejected`); return { ok: false }; }
      if (ports.askPlan === undefined) { pbWarn(gateLine); setBoxNote(path, 'The sentence service is not available in this build.'); say(path, { type: 'notice', message: 'The sentence service is not available in this build.' }); return { ok: false }; }
      if (ports.configured?.() === false) { pbWarn(gateLine); setBoxNote(path, 'The sentence service is not set up: add its URL and token in Settings -> Forge.'); say(path, { type: 'notice', message: 'The sentence service is not set up: add its URL and token in Settings -> Forge.' }); return { ok: false }; }
      pb(gateLine);
      await ask(path);
      return { ok: false };
    }
    pb('grammar verdict: accepted');
    told.delete(path); ports.trace(appliedLine(basename(path), change || 'unchanged')); set(path, null);
    setBoxNote(path, change ? 'Applied.' : 'Nothing changed: the note already says this.');
    const disk = await descriptionOf(path);
    say(path, { type: 'applied', change: change || 'unchanged', description: disk ?? text });
    return { ok: true, disk: disk ?? text };
  }
  const set = (path: string, u: Ui | null): void => { if (u === null || u.state.kind === 'synced') ui.delete(path); else { ui.set(path, u); notices.delete(path); } syncBars(); };

  async function evaluate(path: string, auto: boolean): Promise<void> {
    if (disposed) return;
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
      set(path, { state: st });
      return;
    }
    if (st.kind === 'python-apply' || st.kind === 'python-custom') { if (auto) await doApplyPython(path, family, st); else set(path, { state: st }); return; }
    if (st.kind === 'recipe-rejected') {
      if (told.get(path) !== `recipe:${st.recipe}`) { told.set(path, `recipe:${st.recipe}`); ports.trace(recipeRejectedLine(basename(path), st.error)); }
      set(path, { state: st });
      return;
    }
    if (st.kind === 'recipe-apply') { if (auto) await doApplyRecipe(path, family, st); else set(path, { state: st }); return; }
    if (st.kind === 'rejected') {
      if (told.get(path) !== st.sentence) { told.set(path, st.sentence); ports.trace(rejectedLine(basename(path), st.error)); }
      const keep = ui.get(path);
      set(path, { state: st, preview: keep?.preview?.forSentence === st.sentence ? keep.preview : undefined, message: keep?.preview?.forSentence === st.sentence ? keep.message : undefined });
      return;
    }
    if (auto) await doApply(path, family, st); else set(path, { state: st });
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
    try {
      await proc(path, (cur) => {
        const r = applyRecipeText(cur, basename(path), family, ports.vault(), st.recipe);
        if (r.ok === false) { failure = r.message; stale = r.stale; return cur; }
        change = r.change;
        return r.text;
      });
    } catch (e) { failure = `Update from Recipe: ${(e as Error)?.message ?? e}`; console.error('recipe-apply: could not write the note', e); }
    if (failure === null) { told.delete(path); ports.trace(recipeAppliedLine(basename(path), change)); set(path, null); return; }
    if (stale) { await evaluate(path, false); return; }                                                    // the text moved on: what it says now is read afresh (a newer edit has its own timer)
    set(path, { state: st, message: failure });
  }

  /** A note whose Description AND Recipe were edited, and the person chose the Description: it is applied as it stands (the Recipe edit is dropped), decided on the CURRENT text inside the write. */
  async function doApplyDescriptionOver(path: string, family: Family): Promise<void> {
    let change = '', failure: string | null = null;
    { let now = ''; try { now = await ports.read(path); } catch { /* the note went away: the write below says so */ }
      const chosen = now === '' ? null : descriptionState(now, family, ports.vault(), 'description');
      const loop = chosen !== null && chosen.kind === 'apply' ? await loopRefusalOf(noteId(path), chosen.params) : null;
      if (loop !== null) { ports.trace(`[forge-description] refused ${basename(path)}: ${loop}`); const keep = ui.get(path); set(path, { state: keep?.state ?? { kind: 'synced' }, message: `Not applied: ${loop}` }); return; } }
    try {
      await proc(path, (cur) => {
        const r = applyDescriptionText(cur, basename(path), family, ports.vault(), extractDescription(cur), 'description');
        if (r.ok === false) { failure = r.message; return cur; }
        change = r.change;
        return r.text;
      });
    } catch (e) { failure = `Update from Description: ${(e as Error)?.message ?? e}`; console.error('description-apply: could not write the note', e); }
    if (failure === null) { told.delete(path); ports.trace(appliedLine(basename(path), change)); set(path, null); return; }
    const keep = ui.get(path); set(path, { state: keep?.state ?? { kind: 'synced' }, message: failure });
  }

  async function doApply(path: string, family: Family, st: Extract<DescriptionState, { kind: 'apply' }>): Promise<void> {
    let change = '', failure: string | null = null, stale = false;
    { const loop = await loopRefusalOf(noteId(path), st.params); if (loop !== null) { ports.trace(`[forge-description] refused ${basename(path)}: ${loop}`); set(path, { state: st, message: `Not applied: ${loop}` }); return; } }
    try {
      await proc(path, (cur) => {
        const r = applyDescriptionText(cur, basename(path), family, ports.vault(), st.sentence);
        if (r.ok === false) { failure = r.message; stale = r.stale; return cur; }
        change = r.change;
        return r.text;
      });
    } catch (e) { failure = `Update from Description: ${(e as Error)?.message ?? e}`; console.error('description-apply: could not write the note', e); }
    if (failure === null) { told.delete(path); ports.trace(appliedLine(basename(path), change)); set(path, null); return; }
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
    if (a === 'update') await update(path);
    else if (a === 'update-recipe') await updateRecipe(path);
    else if (a === 'update-python') await updatePython(path);
    else if (a === 'revert-generated') await revertGenerated(path);
    else if (a === 'revert') await revert(path);
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
    const readSections = async (id: string) => { try { const r = readCompositionNote(await ports.read(`${id}.md`)); return r.ok ? r.value.sections : null; } catch { return null; } };
    return compositionLoopRefusal(note, params, readSections);
  }
  const noteId = (path: string): string => path.replace(/\.md$/, '');

  type Asked = { ok: true; params: GrammarParams } | { ok: false; message: string };
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
    const sentence = u.state.sentence;
    const v = ports.vault();
    const req = family === 'phrase'
      ? buildPlanRequest({ sentence, barNames: ports.barNames(), phraseNames: ports.phraseNames(), ownKey: ports.ownKey?.() })
      : buildFamilyPlanRequest({ family, sentence, kitNames: v.kits, phraseNames: ports.phraseNames(), arrangementNames: v.arrangements, compositionNames: v.compositions, note: path.replace(/\.md$/, ''), ownKey: ports.ownKey?.() });
    const keepBox = (x: Ui): Ui => (x.fromBox ? { ...x, fromBox: true, base: x.base } : x);
    if (req.ok === false) { pbWarn(`request not built: ${req.message}`); set(path, keepBox({ state: u.state, message: req.message, fromBox: u.fromBox, base: u.base })); if (u.fromBox) { setBoxNote(path, req.message); say(path, { type: 'notice', message: req.message }); } return; }
    set(path, { ...u, busy: true });
    if (u.fromBox) { setBoxBusy(path, 'Asking the sentence service...'); say(path, { type: 'asking' }); }
    ports.trace(askingServiceLine(basename(path)));                                                         // 2026-11-13-1209 (C): a request LEFT
    let outcome: Asked;
    try {
      const res = await ports.askPlan(req.payload);
      outcome = family === 'phrase' ? interpretPlanResponse(res, req.payload.bars) : await askNewKind(res, req.payload);
    }
    catch (e) { outcome = { ok: false, message: `Could not reach the transpile service (${(e as Error)?.message ?? e}). Check your connection and Settings → Forge → Transpile service URL.` }; }
    if (u.fromBox) setBoxBusy(path, null);
    if (cancelledAsk.has(path)) {                                                                        // 2026-11-17-2001: Esc while the service thought: the answer is dropped, said once
      ports.trace(askedServiceLine(basename(path), 'dropped: cancelled'));
      if (!disposed) { say(path, { type: 'dropped', message: 'cancelled' }); set(path, { state: u.state, ...(u.fromBox ? { fromBox: true, base: u.base } : {}) }); }
      return;
    }
    // 2026-11-13-1209 (B): every way out after a request left ends VISIBLE and TRACED (a message under the box and in the strip, a `dropped: <why>` trace line), never silent.
    const dropVisibly = async (why: string, message: string, strip?: Ui): Promise<void> => {
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
    ports.trace(askedServiceLine(basename(path), outcome.ok === false ? `refused: ${outcome.message}` : `${outcome.params.kind}`));
    if (outcome.ok === false) { set(path, { state: now.state, message: outcome.message, ...(now.fromBox ? { fromBox: true, base: now.base } : {}) }); if (now.fromBox) { askMessage.set(path, `The service refused: ${outcome.message}`); setBoxNote(path, `The service refused: ${outcome.message}`); say(path, { type: 'refused', message: outcome.message }); } return; }
    const name = basename(path);
    const recipe = (outcome.params.kind === 'arrangement' || outcome.params.kind === 'composition' ? familyRecipeSteps(outcome.params) : phraseRecipeSteps(outcome.params as PhraseParams)).join('\n');
    set(path, { state: now.state, ...(now.fromBox ? { fromBox: true, base: now.base } : {}), preview: { params: outcome.params, forSentence: sentence, description: describe(outcome.params), recipe } });
    if (now.fromBox) { setBoxNote(path, 'The service answered: the suggestion is in the dialog.'); say(path, { type: 'suggestion', description: describe(outcome.params), recipe }); }
    if (family === 'phrase') void phraseDescription(name, outcome.params as PhraseParams);
  }

  async function applyPreview(path: string): Promise<{ ok: boolean; disk?: string; message?: string }> {
    const family = familyOfPath(path); const u = ui.get(path);
    if (family === null || !u?.preview) return { ok: false, message: 'There is nothing to apply.' };                // never without a preview
    const { params, forSentence } = u.preview;
    let failure: string | null = null, change = '';
    { const loop = await loopRefusalOf(noteId(path), params as GrammarParams);                                // the vault may have moved since the preview was made (another composition edited): asked once more, the same words
      if (loop !== null) { set(path, { state: u.state, message: loop, ...(u.fromBox ? { fromBox: true, base: u.base } : {}) }); if (u.fromBox) { endSuggestion(path, 'expired'); say(path, { type: 'refused', message: loop, by: 'plugin' }); } return { ok: false, message: loop }; } }
    // a suggestion for a sentence typed in the BOX: nothing was written for it, so the Description on disk must be what it was when the sentence was sent, and the box must still hold that sentence
    if (u.fromBox && boxText(path) !== undefined && boxText(path) !== forSentence) { set(path, { state: u.state, message: 'The text in the box changed after the suggestion; ask again.', fromBox: true, base: u.base }); endSuggestion(path, 'expired'); say(path, { type: 'notice', message: 'The text in the box changed after the suggestion; ask again.' }); return { ok: false, message: 'The text in the box changed after the suggestion; ask again.' }; }
    try {
      await proc(path, (cur) => {
        if (extractDescription(cur) !== (u.fromBox ? u.base : forSentence)) { failure = 'The Description changed while the service was thinking; its suggestion was dropped.'; return cur; }
        const w = writeFromParams(cur, basename(path), family, params as GrammarParams);
        if (w.ok === false) { failure = w.message; return cur; }
        change = changeSummary(cacheParams(cur, family), params as GrammarParams);
        return w.text;
      });
    } catch (e) { failure = `Apply: ${(e as Error)?.message ?? e}`; }
    if (failure !== null) { set(path, { state: u.state, message: failure, ...(u.fromBox ? { fromBox: true, base: u.base } : {}) }); if (u.fromBox) { endSuggestion(path, 'expired'); say(path, { type: 'failed', message: failure }); } return { ok: false, message: failure }; }
    told.delete(path); ports.trace(appliedLine(basename(path), change)); set(path, null);
    if (u.fromBox) { const d = await descriptionOf(path); if (d !== null) for (const b of boxes.values()) if (b.path === path) b.handle.reset(d); endSuggestion(path, 'applied'); say(path, { type: 'applied', change, description: d ?? describe(params as GrammarParams) }); setBoxNote(path, 'Applied.'); return { ok: true, ...(d !== null ? { disk: d } : {}) }; }        // applied: the box shows the canonical grammar sentence, not the free one
    return { ok: true };
  }

  /** 2026-11-17-2001 - the composer's FIRST Enter: what would this sentence do? Nothing is written. The grammar reads it first (free, instant, exact); when it cannot, the sentence service is asked ONCE (the same gates as
   *  before). The answer is a proposal (its canonical wording) the person sees in the dialog and applies with a second Enter, or a reason it cannot be one (the line under the card says it). */
  async function previewFromBox(path: string, text: string): Promise<PreviewResult> {
    try { return await previewFromBoxCore(path, text); }
    catch (e) {                                                                                           // never silent (2026-11-13-1211): the console, the dialog and the line under the card say it
      const why = (e as Error)?.message ?? String(e);
      pbWarn(`preview failed: ${why}`); console.error('[forge-promptbox] preview failed', e);
      say(path, { type: 'failed', message: why });
      return { ok: false, message: `Could not ask: ${why}` };
    }
  }
  async function previewFromBoxCore(path: string, text: string): Promise<PreviewResult> {
    const family = familyOfPath(path);
    if (family === null) { pbWarn(`preview skipped: ${path} is not a phrase, arrangement or composition note`); return { ok: false, message: 'This note is not a phrase, arrangement or composition.' }; }
    pb(`preview asked: ${basename(path)} family=${family} text=${text.length} chars`);
    say(path, { type: 'you', text });
    cancelledAsk.delete(path);
    let cur = '';
    try { cur = await ports.read(path); } catch (e) { const m = `Could not read the note: ${(e as Error)?.message ?? e}`; say(path, { type: 'failed', message: m }); return { ok: false, message: m }; }
    const edited = replaceDescriptionSection(cur, text);
    if (edited === null) { const m = 'This note has no Description heading to write the sentence under.'; say(path, { type: 'notice', message: m }); return { ok: false, message: m }; }
    const st = descriptionState(edited, family, ports.vault());
    if (st.kind === 'apply') {
      if (st.unchanged) { const m = 'Nothing changed: the note already says this.'; say(path, { type: 'notice', message: m }); return { ok: false, message: m }; }
      const loop = await loopRefusalOf(noteId(path), st.params);                                           // 2026-11-19-0910: the grammar read it, but a LOOP is refused before any preview, in the same words as the service path
      if (loop !== null) { pb(`grammar verdict: accepted, then refused: ${loop}`); say(path, { type: 'refused', message: loop, by: 'plugin' }); setBoxNote(path, `Refused: ${loop}`); return { ok: false, message: `Refused: ${loop}` }; }
      const description = describe(st.params as never);
      pb('grammar verdict: accepted (preview, nothing written)');
      say(path, { type: 'suggestion', description, recipe: '', via: 'grammar' });
      return { ok: true, proposal: { description, via: 'grammar' } };
    }
    if (st.kind === 'synced') { const m = 'Nothing changed: the note already says this.'; say(path, { type: 'notice', message: m }); return { ok: false, message: m }; }
    if (st.kind !== 'rejected' && st.kind !== 'both-edited') { const m = 'This note has something else to say first; see the line at the top.'; say(path, { type: 'notice', message: m }); return { ok: false, message: m }; }
    // the grammar did not accept it (or the note's other facets were edited too): the same strip, trace and dialog lines as before, then the service, once
    const failure = st.kind === 'rejected' ? st.message : st.message;
    const sentence = st.kind === 'rejected' ? st.sentence : text;
    const state: DescriptionState = st.kind === 'rejected' ? st : { kind: 'rejected', sentence, error: { message: failure, line: 1, column: 1 }, message: failure };
    set(path, { state, message: failure, fromBox: true, base: extractDescription(cur) });
    pb(`grammar verdict: ${st.kind}`);
    const rejectedText = st.kind === 'rejected' ? `The grammar did not accept this sentence (line ${st.error.line}, column ${st.error.column}: ${st.error.message}).` : failure;
    if (st.kind === 'rejected') say(path, { type: 'rejected', line: st.error.line, column: st.error.column, message: st.error.message }); else say(path, { type: 'notice', message: failure });
    if (st.kind !== 'rejected') return { ok: false, message: rejectedText };
    const gateLine = `service gate: askPlan=${ports.askPlan === undefined ? 'absent' : 'present'} configured=${ports.configured === undefined ? 'unset' : String(ports.configured())}`;
    if (ports.askPlan === undefined) { pbWarn(gateLine); const m = 'The sentence service is not available in this build.'; say(path, { type: 'notice', message: m }); return { ok: false, message: `${rejectedText} ${m}` }; }
    if (ports.configured?.() === false) { pbWarn(gateLine); const m = 'The sentence service is not set up: add its URL and token in Settings -> Forge.'; say(path, { type: 'notice', message: m }); return { ok: false, message: `${rejectedText} ${m}` }; }
    pb(gateLine);
    askMessage.delete(path);
    await ask(path);
    if (cancelledAsk.delete(path)) return { ok: false, message: 'Cancelled.' };
    const after = ui.get(path);
    if (after?.preview && after.preview.forSentence === sentence) return { ok: true, proposal: { description: after.preview.description, via: 'service' } };
    return { ok: false, message: askMessage.get(path) ?? after?.message ?? 'The service did not suggest anything.' };
  }

  /** 2026-11-17-2001 - Esc on a preview (or typing over it): drop the proposal, nothing was written. */
  function discardPreview(path: string): void {
    const u = ui.get(path); if (u?.preview) { const rest = { ...u }; delete rest.preview; set(path, rest); }
    endSuggestion(path, 'cancelled');
  }

  /** 2026-11-17-2001 - the composer's SECOND Enter: write what the person saw. A service proposal goes through the preview the service made; a grammar proposal through the same writers "Update from Description" uses. */
  async function applyProposal(path: string, text: string, proposal: Proposal): Promise<{ ok: boolean; disk?: string; message?: string }> {
    pb(`apply pressed: ${basename(path)} family=${familyOfPath(path) ?? 'none'} text=${text.length} chars via=${proposal.via}`);
    try {
      if (proposal.via === 'service') return await applyPreview(path);
      const r = await applyFromBoxCore(path, text, true);
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

  return {
    modified(path) {
      if (disposed || familyOfPath(path) === null) return;
      void refreshBoxes(path);                                                                         // a control wrote the Description (or a hand edit): the box follows at once, not after the debounce
      const prior = timers.get(path); if (prior !== undefined) ports.clearTimer(prior);
      timers.set(path, ports.setTimer(() => { timers.delete(path); void evaluate(path, true); }, DESCRIPTION_DEBOUNCE_MS));       // a second edit inside the wait replaces the first: the first is never written
    },
    inspect: (path) => evaluate(path, false),
    drop(path) { const t = timers.get(path); if (t !== undefined) { ports.clearTimer(t); timers.delete(path); } },
    async reset(path) { const t = timers.get(path); if (t !== undefined) { ports.clearTimer(t); timers.delete(path); } ui.delete(path); told.delete(path); notices.delete(path); syncBars(); await evaluate(path, false); },
    async inspectOpen() {
      if (disposed) return;
      const todo = new Set<string>();
      for (const { path, contentEl } of ports.panes()) { if (looked.get(contentEl) === path) continue; looked.set(contentEl, path); todo.add(path); }
      for (const path of todo) await evaluate(path, false);
    },
    canRevertGenerated: (path) => { const st = ui.get(path)?.state; return st?.kind === 'custom-note' && st.canRevert; },
    revertGenerated,
    focusBox(path) { for (const b of boxes.values()) if (path === undefined || b.path === path) { b.handle.focus(); return true; } return false; },
    suggestInBox(path, text) { for (const b of boxes.values()) if (b.path === path) { b.handle.suggest(text); return true; } return false; },
    applyFromBox, previewFromBox, applyProposal,
    update, revert, ask, syncBars,
    canUpdate: (path) => { const u = ui.get(path); return u !== undefined && (u.state.kind === 'apply' || u.state.kind === 'recipe-apply' || u.state.kind === 'python-apply' || u.state.kind === 'python-custom'); },
    dispose() { disposed = true; notices.clear(); for (const t of timers.values()) ports.clearTimer(t); timers.clear(); for (const h of bars.values()) h.dispose(); bars.clear(); for (const b of boxes.values()) b.handle.dispose(); boxes.clear(); ui.clear(); },
  };
}
