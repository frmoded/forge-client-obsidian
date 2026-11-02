// 2026-10-31-1140 (M16a): the same controller also hears a hand-edited RECIPE (the Recipe is a source too): it parses (applied by ONE `process`, the Description, Python, json cache and stamps made again from it), it does not parse (nothing is
// written; the bar says the line and the column; Revert), or the Description was edited too (nothing is applied; the bar offers Update from Description / Update from Recipe). One controller and one bar per pane, so a note with two
// things to say is said once. The service is NOT offered for a Recipe (no LLM): a Recipe that does not parse is the person's to fix.
// 2026-10-31-1120 (M15c) - "Update from Description": the controller. It hears the vault's `modify` of a phrase, arrangement or composition note, waits for the person to stop typing (DESCRIPTION_DEBOUNCE_MS), reads the CURRENT text,
// and asks description-apply-core what the Description means: it parses (applied by ONE `process`, the same writers the controls use), it does not parse (nothing is written; the sentence says where; Revert; and, for a phrase, "Ask the
// sentence service", which only ever PREVIEWS), or the derived Recipe / Python was edited (said, not applied). No `obsidian` import: the vault, the clock, the service and the panes are ports (score-first.ts wires them, only in a
// score-first vault: P3).
import { mountDescriptionBar, type BarAction, type BarHandle, type BarView } from './description-bar-dom.ts';
import {
  DESCRIPTION_DEBOUNCE_MS, appliedLine, applyDescriptionText, applyRecipeText, askedServiceLine, cacheParams, changeSummary, descriptionState, familyOfPath, ignoredLine, rejectedLine, revertDescriptionText, revertedLine, writeFromParams,
  type DescriptionState, type Family,
} from './description-apply-core.ts';
import { bothEditedLine, recipeAppliedLine, recipeRejectedLine, recipeRevertedLine } from './recipe-apply-core.ts';
import type { GrammarParams, GrammarVault } from './phrase-grammar-core.ts';
import { buildPlanRequest, interpretPlanResponse, type PlanPayload } from './sentence-plan-core.ts';
import { phraseDescription, phraseRecipeSteps } from './phrase-notes-core.ts';
import { describe } from './phrase-describe-core.ts';
import { extractDescription } from './v2-note-core.ts';
import type { PhraseParams } from './phrase-core.ts';

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
  /** Every pane that shows a note right now: its path and the element its content is drawn in (a tab, the notes pane, the text view). */
  panes(): Array<{ path: string; contentEl: HTMLElement }>;
  /** POST /plan, as the sentence dialog sends it. Absent, or `configured()` false = the service is not offered. */
  askPlan?(payload: PlanPayload): Promise<{ status: number; json: unknown }>;
  configured?(): boolean;
  ownKey?(): string | undefined;
}

interface Ui { state: DescriptionState; message?: string; preview?: { params: PhraseParams; description: string; recipe: string; forSentence: string }; busy?: boolean }
const basename = (path: string): string => path.replace(/^.*\//, '').replace(/\.md$/, '');

export interface DescriptionController {
  /** The vault says this note changed: evaluate it once the person stops typing. */
  modified(path: string): void;
  /** Look at this note now without applying it (a note opened, a pane moved): the bar shows what is wrong, if anything. */
  inspect(path: string): Promise<void>;
  update(path: string): Promise<void>;
  revert(path: string): Promise<void>;
  ask(path: string): Promise<void>;
  /** Draw (or take away) the bar in every pane that shows a note with something to say. */
  syncBars(): void;
  /** Is there something for "Update from Description" to do on this note (the command's availability)? */
  canUpdate(path: string): boolean;
  dispose(): void;
}

export function createDescriptionController(ports: DescriptionPorts): DescriptionController {
  const ui = new Map<string, Ui>();
  const timers = new Map<string, unknown>();
  const told = new Map<string, string>();                         // path -> the sentence an evidence line was last written for (a rejected sentence is said once, not at every unrelated modify)
  const bars = new Map<HTMLElement, BarHandle>();
  let disposed = false;

  const viewOf = (path: string, u: Ui): BarView => {
    const family = familyOfPath(path);
    const st = u.state;
    if (u.preview) return { message: u.message ?? 'The sentence service suggests this. Nothing is written until you press Apply.', actions: ['apply-preview', 'cancel-preview'], preview: { description: u.preview.description, recipe: u.preview.recipe }, busy: u.busy };
    if (st.kind === 'rejected') {
      const offer = family === 'phrase' && ports.askPlan !== undefined && ports.configured?.() !== false;
      return { message: u.message ?? st.message, actions: ['revert', ...(offer ? ['ask' as const] : [])], busy: u.busy };
    }
    if (st.kind === 'apply') return { message: u.message ?? `The Description changed (${st.change}); update the note from it.`, actions: ['update', 'revert'], busy: u.busy };
    if (st.kind === 'recipe-rejected') return { message: u.message ?? st.message, actions: ['revert'], busy: u.busy };               // no "Ask the sentence service" for a Recipe: no LLM, the person fixes it
    if (st.kind === 'recipe-apply') return { message: u.message ?? `The Recipe changed (${st.change}); update the note from it.`, actions: ['update-recipe', 'revert'], busy: u.busy };
    if (st.kind === 'both-edited') return { message: u.message ?? st.message, actions: ['update', 'update-recipe'], busy: u.busy };
    if (st.kind === 'derived-edited') return { message: st.message, actions: [], busy: u.busy };
    return { message: '', actions: [] };
  };

  const syncBars = (): void => {
    if (disposed) return;
    const live = new Set<HTMLElement>();
    for (const { path, contentEl } of ports.panes()) {
      const u = ui.get(path);
      if (!u || u.state.kind === 'synced') continue;
      live.add(contentEl);
      let h = bars.get(contentEl);
      if (h && h.el.parentElement !== contentEl) { h = undefined; bars.delete(contentEl); }                  // the pane emptied itself (a reload): draw again
      if (!h) { h = mountDescriptionBar(contentEl, (a) => { void act(path, a); }); bars.set(contentEl, h); }
      h.show(viewOf(path, u));
    }
    for (const [el, h] of [...bars]) if (!live.has(el)) { h.dispose(); bars.delete(el); }
  };

  const set = (path: string, u: Ui | null): void => { if (u === null || u.state.kind === 'synced') ui.delete(path); else ui.set(path, u); syncBars(); };

  async function evaluate(path: string, auto: boolean): Promise<void> {
    if (disposed) return;
    const family = familyOfPath(path);
    if (family === null) return;
    let text: string;
    try { text = await ports.read(path); } catch { return; }                                             // the note went away: nothing to say
    const st = descriptionState(text, family, ports.vault());
    if (st.kind === 'synced') { told.delete(path); set(path, null); return; }
    if (st.kind === 'derived-edited') { if (told.get(path) !== 'derived') { told.set(path, 'derived'); ports.trace(ignoredLine(basename(path))); } set(path, { state: st }); return; }
    if (st.kind === 'both-edited') { if (told.get(path) !== 'both') { told.set(path, 'both'); ports.trace(bothEditedLine(basename(path))); } set(path, { state: st }); return; }
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
    else if (a === 'revert') await revert(path);
    else if (a === 'ask') await ask(path);
    else if (a === 'apply-preview') await applyPreview(path);
    else if (a === 'cancel-preview') { const u = ui.get(path); if (u) set(path, { state: u.state }); }
  }

  async function update(path: string): Promise<void> {
    const family = familyOfPath(path); if (family === null) return;
    const u = ui.get(path);
    if (u && u.state.kind === 'apply') { await doApply(path, family, u.state); return; }
    if (u && u.state.kind === 'both-edited') { await doApplyDescriptionOver(path, family); return; }           // the person chose the Description
    if (u && u.state.kind === 'recipe-apply') { await doApplyRecipe(path, family, u.state); return; }          // "Update from Description" on a note whose Recipe is what changed: the Recipe is what there is to apply
    await evaluate(path, true);
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
    told.delete(path); ports.trace(was === 'recipe-rejected' || was === 'recipe-apply' || was === 'both-edited' ? recipeRevertedLine(basename(path)) : revertedLine(basename(path))); set(path, null);
  }

  async function ask(path: string): Promise<void> {
    const u = ui.get(path);
    if (!u || u.state.kind !== 'rejected' || familyOfPath(path) !== 'phrase' || !ports.askPlan) return;
    const sentence = u.state.sentence;
    const req = buildPlanRequest({ sentence, barNames: ports.barNames(), phraseNames: ports.phraseNames(), ownKey: ports.ownKey?.() });
    if (req.ok === false) { set(path, { state: u.state, message: req.message }); return; }
    set(path, { ...u, busy: true });
    let outcome: ReturnType<typeof interpretPlanResponse>;
    try { outcome = interpretPlanResponse(await ports.askPlan(req.payload), req.payload.bars); }
    catch (e) { outcome = { ok: false, message: `Could not reach the transpile service (${(e as Error)?.message ?? e}). Check your connection and Settings → Forge → Transpile service URL.` }; }
    const now = ui.get(path);
    if (disposed || !now || now.state.kind !== 'rejected' || now.state.sentence !== sentence) return;     // the Description moved on while the service thought: its answer is for a sentence that is gone
    ports.trace(askedServiceLine(basename(path), outcome.ok === false ? `refused: ${outcome.message}` : `${outcome.params.kind}`));
    if (outcome.ok === false) { set(path, { state: now.state, message: outcome.message }); return; }
    const name = basename(path);
    set(path, { state: now.state, preview: { params: outcome.params, forSentence: sentence, description: describe(outcome.params), recipe: phraseRecipeSteps(outcome.params).join('\n') } });
    void phraseDescription(name, outcome.params);
  }

  async function applyPreview(path: string): Promise<void> {
    const family = familyOfPath(path); const u = ui.get(path);
    if (family === null || !u?.preview) return;                                                           // never without a preview
    const { params, forSentence } = u.preview;
    let failure: string | null = null, change = '';
    try {
      await ports.process(path, (cur) => {
        if (extractDescription(cur) !== forSentence) { failure = 'The Description changed while the service was thinking; its suggestion was dropped.'; return cur; }
        const w = writeFromParams(cur, basename(path), family, params as GrammarParams);
        if (w.ok === false) { failure = w.message; return cur; }
        change = changeSummary(cacheParams(cur, family), params as GrammarParams);
        return w.text;
      });
    } catch (e) { failure = `Apply: ${(e as Error)?.message ?? e}`; }
    if (failure !== null) { set(path, { state: u.state, message: failure }); return; }
    told.delete(path); ports.trace(appliedLine(basename(path), change)); set(path, null);
  }

  return {
    modified(path) {
      if (disposed || familyOfPath(path) === null) return;
      const prior = timers.get(path); if (prior !== undefined) ports.clearTimer(prior);
      timers.set(path, ports.setTimer(() => { timers.delete(path); void evaluate(path, true); }, DESCRIPTION_DEBOUNCE_MS));       // a second edit inside the wait replaces the first: the first is never written
    },
    inspect: (path) => evaluate(path, false),
    update, revert, ask, syncBars,
    canUpdate: (path) => { const u = ui.get(path); return u !== undefined && (u.state.kind === 'apply' || u.state.kind === 'recipe-apply'); },
    dispose() { disposed = true; for (const t of timers.values()) ports.clearTimer(t); timers.clear(); for (const h of bars.values()) h.dispose(); bars.clear(); ui.clear(); },
  };
}
