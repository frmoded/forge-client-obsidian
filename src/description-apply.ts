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
import { readPhraseKind, type PhraseParams } from './phrase-core.ts';
import { mountPromptBox, type PromptBoxHandle } from './prompt-box-dom.ts';
import { placeholderFor, replaceDescriptionSection } from './prompt-box-core.ts';

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
  /** Ask the person to confirm a step that loses something ("Revert to generated"); absent = it goes ahead. */
  confirm?(message: string): Promise<boolean>;
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
  /** Apply this text as the note's Description, as the prompt box's Apply does (the existing "Update from Description" writers; a sentence that does not parse writes nothing and the strip says where). */
  applyFromBox(path: string, text: string): Promise<{ ok: boolean; disk?: string }>;
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
  const notices = new Map<string, { message: string; text: string }>();     // path -> a sentence that stays on the note's bar after a successful apply (D4: comments dropped), until the note's text changes
  const looked = new WeakMap<HTMLElement, string>();              // pane element -> the note path it was last looked at for (a pane is read once per note it shows)
  let disposed = false;
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
      const u = ui.get(path);
      const n = notices.get(path);
      if ((!u || u.state.kind === 'synced') && !n) continue;
      live.add(contentEl);
      let h = bars.get(contentEl);
      if (h && h.el.parentElement !== contentEl) { h = undefined; bars.delete(contentEl); }                  // the pane emptied itself (a reload): draw again
      if (!h) { h = mountDescriptionBar(contentEl, (a) => { void act(path, a); }); bars.set(contentEl, h); }
      h.show(u ? viewOf(path, u) : { message: n!.message, actions: [] });
    }
    for (const [el, h] of [...bars]) if (!live.has(el)) { h.dispose(); bars.delete(el); }
    syncBoxes();
  };

  // ---- 2026-11-12-1203: the docked prompt box. An EDITOR VIEW of the Description facet on a score tab (the note on disk stays the only source of truth); the controls' writes reach it through the vault's `modify`.
  const boxes = new Map<HTMLElement, { path: string; handle: PromptBoxHandle }>();
  const descriptionOf = async (path: string): Promise<string | null> => { try { return extractDescription(await ports.read(path)); } catch { return null; } };
  const boxKind = (text: string, family: Family): string => (family === 'phrase' ? readPhraseKind(text) ?? 'mix' : family);
  const syncBoxes = (): void => {
    if (disposed) return;
    const live = new Set<HTMLElement>();
    for (const { path, contentEl, tab } of ports.panes()) {
      if (tab !== true || familyOfPath(path) === null) continue;
      if (ui.get(path)?.state.kind === 'custom-note') continue;                                              // a custom note: its Python is the source, the Description is not applied: no box
      live.add(contentEl);
      const have = boxes.get(contentEl);
      if (have && have.path === path && have.handle.el.parentElement === contentEl) { if (contentEl.lastElementChild !== have.handle.el) contentEl.appendChild(have.handle.el); continue; }
      if (have) { have.handle.dispose(); boxes.delete(contentEl); }
      void (async () => {
        let note = ''; try { note = await ports.read(path); } catch { return; }
        if (disposed || boxes.has(contentEl)) return;
        const family = familyOfPath(path)!;
        const handle = mountPromptBox(contentEl, { placeholder: placeholderFor(boxKind(note, family)), apply: (text) => applyFromBox(path, text) }, extractDescription(note));
        boxes.set(contentEl, { path, handle });
        pb(`box mounted: ${basename(path)} family=${family} askPlan=${ports.askPlan === undefined ? 'absent' : 'present'} configured=${ports.configured === undefined ? 'unset' : String(ports.configured())}`);       // 2026-11-13-1211: the first line the driver sees on opening a tab: this build is live and the service gate says what it will do before Apply is pressed
      })();
    }
    for (const [el, b] of [...boxes]) if (!live.has(el)) { b.handle.dispose(); boxes.delete(el); }
  };
  const boxText = (path: string): string | undefined => { for (const b of boxes.values()) if (b.path === path) return b.handle.state().text; return undefined; };
  const setBoxBusy = (path: string, message: string | null): void => { for (const b of boxes.values()) if (b.path === path) b.handle.setBusy(message); };
  const setBoxNote = (path: string, message: string | null): void => { for (const b of boxes.values()) if (b.path === path) b.handle.setNote(message); };
  /** The Description on disk, again, into every box of this note (a control wrote it, a hand edit, an apply): unapplied typing is never overwritten (the box offers the choice). */
  const refreshBoxes = async (path: string): Promise<void> => {
    if (disposed) return;
    syncBoxes();                                                                                       // a tab that rebuilt itself took its box with it: draw it again
    const targets = [...boxes.values()].filter((b) => b.path === path);
    if (targets.length === 0) return;
    const d = await descriptionOf(path);
    if (d === null) return;
    for (const b of targets) b.handle.setDisk(d);
  };
  /** Apply the box's text: the Description facet is replaced and the note made again from it in ONE `process` (the same writers the controls and "Update from Description" use). A sentence that does not parse, or a note whose Recipe or
   *  Python were edited too, writes NOTHING: the strip at the top says where (line and column), and the box keeps the text. */
  async function applyFromBox(path: string, text: string): Promise<{ ok: boolean; disk?: string }> {
    pb(`apply pressed: ${basename(path)} family=${familyOfPath(path) ?? 'none'} text=${text.length} chars`);
    try { return await applyFromBoxCore(path, text); }
    catch (e) {                                                                                           // 2026-11-13-1211: the box used to swallow a throw here (the text stayed "edited, not applied", the console empty): it is said now, in the console and under the box
      const why = (e as Error)?.message ?? String(e);
      pbWarn(`apply failed: ${why}`); console.error('[forge-promptbox] apply failed', e);
      setBoxNote(path, `Apply failed: ${why}`);
      return { ok: false };
    }
  }
  async function applyFromBoxCore(path: string, text: string): Promise<{ ok: boolean; disk?: string }> {
    const family = familyOfPath(path); if (family === null) { pbWarn(`ask skipped: ${path} is not a phrase, arrangement or composition note`); return { ok: false }; }
    let failure: string | null = null, change = '', sentence = text;
    try {
      await ports.process(path, (cur) => {
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
      // 2026-11-12-1204: the GRAMMAR rejected the text (free, instant, exact: tried first, always). For a PHRASE, with the sentence service set up, Apply asks it ONCE, automatically, and shows the PREVIEW (nothing is written until it is
      // applied). Never while typing, never when the grammar accepted the text. 2026-11-12-1206: for an arrangement and a composition too (the service is version-gated for them: an older one says so, in one sentence).
      if (st.kind !== 'rejected') { pb(`ask skipped: the verdict is ${st.kind}, not a sentence the grammar rejected`); return { ok: false }; }
      if (ports.askPlan === undefined) { pbWarn(gateLine); setBoxNote(path, 'The sentence service is not available in this build.'); return { ok: false }; }
      if (ports.configured?.() === false) { pbWarn(gateLine); setBoxNote(path, 'The sentence service is not set up: add its URL and token in Settings -> Forge.'); return { ok: false }; }
      pb(gateLine);
      await ask(path);
      return { ok: false };
    }
    pb('grammar verdict: accepted');
    told.delete(path); ports.trace(appliedLine(basename(path), change || 'unchanged')); set(path, null);
    setBoxNote(path, change ? 'Applied.' : 'Nothing changed: the note already says this.');
    const disk = await descriptionOf(path);
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
    try {
      await ports.process(path, (cur) => {
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
    if (ports.confirm && !(await ports.confirm(REVERT_GENERATED_CONFIRM))) return;
    let failure: string | null = null;
    try { await ports.process(path, (cur) => { const r = revertToGeneratedText(cur, basename(path), family); if (r.ok === false) { failure = r.message; return cur; } return r.text; }); } catch (e) { failure = `Revert to generated: ${(e as Error)?.message ?? e}`; }
    if (failure !== null) { const keep = ui.get(path); set(path, { state: keep?.state ?? { kind: 'synced' }, message: failure }); return; }
    told.delete(path); ports.trace(pythonRevertedLine(basename(path))); set(path, null);
  }

  /** The Recipe parsed: ONE `process` makes every derived part again from it (the plan re-decided on the CURRENT text inside the write, against the Recipe that was planned). */
  async function doApplyRecipe(path: string, family: Family, st: Extract<DescriptionState, { kind: 'recipe-apply' }>): Promise<void> {
    let change = '', failure: string | null = null, stale = false;
    try {
      await ports.process(path, (cur) => {
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
    try {
      await ports.process(path, (cur) => {
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
    try {
      await ports.process(path, (cur) => {
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

  async function act(path: string, a: BarAction): Promise<void> {
    if (a === 'update') await update(path);
    else if (a === 'update-recipe') await updateRecipe(path);
    else if (a === 'update-python') await updatePython(path);
    else if (a === 'revert-generated') await revertGenerated(path);
    else if (a === 'revert') await revert(path);
    else if (a === 'ask') await ask(path);
    else if (a === 'apply-preview') await applyPreview(path);
    else if (a === 'cancel-preview') { const u = ui.get(path); if (u) set(path, { state: u.state, ...(u.fromBox ? { fromBox: true, base: u.base } : {}) }); }
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
    let failure: string | null = null;
    try { await ports.process(path, (cur) => { const r = revertDescriptionText(cur, basename(path), family); if (r.ok === false) { failure = r.message; return cur; } return r.text; }); } catch (e) { failure = `Revert: ${(e as Error)?.message ?? e}`; }
    if (failure !== null) { const keep = ui.get(path); set(path, { state: keep?.state ?? { kind: 'synced' }, message: failure }); return; }
    const was = ui.get(path)?.state.kind;
    told.delete(path); ports.trace(was === 'python-apply' || was === 'python-custom' ? pythonRevertedLine(basename(path)) : was === 'recipe-rejected' || was === 'recipe-apply' || was === 'both-edited' ? recipeRevertedLine(basename(path)) : revertedLine(basename(path))); set(path, null);
  }

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
    if (fam.params.kind === 'composition') {
      const readSections = async (id: string) => { try { const r = readCompositionNote(await ports.read(`${id}.md`)); return r.ok ? r.value.sections : null; } catch { return null; } };
      const loop = await compositionLoopRefusal(payload.note ?? '', fam.params, readSections);
      if (loop !== null) return { ok: false, message: loop };
    }
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
    if (req.ok === false) { pbWarn(`request not built: ${req.message}`); set(path, keepBox({ state: u.state, message: req.message, fromBox: u.fromBox, base: u.base })); if (u.fromBox) setBoxNote(path, req.message); return; }
    set(path, { ...u, busy: true });
    if (u.fromBox) setBoxBusy(path, 'Asking the sentence service...');
    ports.trace(askingServiceLine(basename(path)));                                                         // 2026-11-13-1209 (C): a request LEFT
    let outcome: Asked;
    try {
      const res = await ports.askPlan(req.payload);
      outcome = family === 'phrase' ? interpretPlanResponse(res, req.payload.bars) : await askNewKind(res, req.payload);
    }
    catch (e) { outcome = { ok: false, message: `Could not reach the transpile service (${(e as Error)?.message ?? e}). Check your connection and Settings → Forge → Transpile service URL.` }; }
    if (u.fromBox) setBoxBusy(path, null);
    // 2026-11-13-1209 (B): every way out after a request left ends VISIBLE and TRACED (a message under the box and in the strip, a `dropped: <why>` trace line), never silent.
    const dropVisibly = async (why: string, message: string, strip?: Ui): Promise<void> => {
      ports.trace(askedServiceLine(basename(path), `dropped: ${why}`));
      if (disposed) return;
      setBoxNote(path, message);
      if (strip) { set(path, strip); return; }
      let disk = ''; try { disk = await ports.read(path); } catch { /* the note went away: the notice keys on text that no longer exists, so it simply never shows */ }
      notices.set(path, { message, text: disk }); syncBars();
    };
    const now = ui.get(path);
    if (disposed || !now || now.state.kind !== 'rejected' || now.state.sentence !== sentence) { await dropVisibly('the note changed while the service thought', 'The answer came back after the text changed; ask again.'); return; }
    if (now.fromBox && boxText(path) !== sentence) {                                                      // the person typed on in the box while the service thought: the answer is for a sentence that is gone
      const message = 'The Description changed while the service was thinking; its suggestion was dropped.';
      await dropVisibly('the text in the box changed', message, { state: now.state, message, fromBox: true, base: now.base });
      return;
    }
    ports.trace(askedServiceLine(basename(path), outcome.ok === false ? `refused: ${outcome.message}` : `${outcome.params.kind}`));
    if (outcome.ok === false) { set(path, { state: now.state, message: outcome.message, ...(now.fromBox ? { fromBox: true, base: now.base } : {}) }); if (now.fromBox) setBoxNote(path, `The service refused: ${outcome.message}`); return; }
    const name = basename(path);
    const recipe = (outcome.params.kind === 'arrangement' || outcome.params.kind === 'composition' ? familyRecipeSteps(outcome.params) : phraseRecipeSteps(outcome.params as PhraseParams)).join('\n');
    set(path, { state: now.state, ...(now.fromBox ? { fromBox: true, base: now.base } : {}), preview: { params: outcome.params, forSentence: sentence, description: describe(outcome.params), recipe } });
    if (now.fromBox) setBoxNote(path, 'The service answered: see the preview at the top.');
    if (family === 'phrase') void phraseDescription(name, outcome.params as PhraseParams);
  }

  async function applyPreview(path: string): Promise<void> {
    const family = familyOfPath(path); const u = ui.get(path);
    if (family === null || !u?.preview) return;                                                           // never without a preview
    const { params, forSentence } = u.preview;
    let failure: string | null = null, change = '';
    // a suggestion for a sentence typed in the BOX: nothing was written for it, so the Description on disk must be what it was when the sentence was sent, and the box must still hold that sentence
    if (u.fromBox && boxText(path) !== undefined && boxText(path) !== forSentence) { set(path, { state: u.state, message: 'The text in the box changed after the suggestion; ask again.', fromBox: true, base: u.base }); return; }
    try {
      await ports.process(path, (cur) => {
        if (extractDescription(cur) !== (u.fromBox ? u.base : forSentence)) { failure = 'The Description changed while the service was thinking; its suggestion was dropped.'; return cur; }
        const w = writeFromParams(cur, basename(path), family, params as GrammarParams);
        if (w.ok === false) { failure = w.message; return cur; }
        change = changeSummary(cacheParams(cur, family), params as GrammarParams);
        return w.text;
      });
    } catch (e) { failure = `Apply: ${(e as Error)?.message ?? e}`; }
    if (failure !== null) { set(path, { state: u.state, message: failure, ...(u.fromBox ? { fromBox: true, base: u.base } : {}) }); return; }
    told.delete(path); ports.trace(appliedLine(basename(path), change)); set(path, null);
    if (u.fromBox) { const d = await descriptionOf(path); if (d !== null) for (const b of boxes.values()) if (b.path === path) b.handle.reset(d); }        // applied: the box shows the canonical grammar sentence, not the free one
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
    applyFromBox,
    update, revert, ask, syncBars,
    canUpdate: (path) => { const u = ui.get(path); return u !== undefined && (u.state.kind === 'apply' || u.state.kind === 'recipe-apply' || u.state.kind === 'python-apply' || u.state.kind === 'python-custom'); },
    dispose() { disposed = true; notices.clear(); for (const t of timers.values()) ports.clearTimer(t); timers.clear(); for (const h of bars.values()) h.dispose(); bars.clear(); for (const b of boxes.values()) b.handle.dispose(); boxes.clear(); ui.clear(); },
  };
}
