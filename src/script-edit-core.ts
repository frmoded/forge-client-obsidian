// 2026-11-22-1016 (checklists/music_tabs_chat_ui_design.md 11i) - THE SCRIPT AS THE THIRD ENTRY POINT of a list note (music-composer code, behind the list-model seam; lean never carries it). The driver writes the list, or the composer's sentences, or CHANGES THE SCRIPT (the Recipe;
// the Python stays as it was). A hand-edited, readable Recipe no longer rewrites the list at once: the list is marked `no longer matches the script` (muted strip text, never red) and the driver chooses, once: `Rewrite the description from the recipe` or `Discard my Recipe edits`. A list save
// while the Recipe holds edits asks ONCE. Nothing here calls a model. This core holds the words, the choice of what a rewrite keeps, and the rewrite itself (the pure text step; the controller does the write, the undo entry and the strip).
import { asRecipeSourced } from './phrase-notes-core.ts';
import { applyRecipeText, descriptionState } from './description-apply-core.ts';
import { linesOfParams, parseList, replayGrammar, splitSaid, withSaid } from './sentence-list-core.ts';
import { isWaitingLine } from './waiting-line-core.ts';
import { writeListNote } from './sentence-list-note-core.ts';
import { extractDescription } from './v2-note-core.ts';
import type { Family } from './note-family-core.ts';
import type { GrammarParams, GrammarVault } from './phrase-grammar-core.ts';

/** 2026-11-19-0997: this core is the LIST MODEL's (reached only through src/list-model-selected.ts); list-model.full.ts lists this string in `cores`, scripts/build-main.test.mjs greps the lean bundle for it. */
export const LIST_MODEL_SENTINEL_SCRIPT_EDIT_CORE = 'forge-list-model-core:script-edit-core';

/** The strip's sentence for a note whose Recipe was edited by hand and reads: the list is NOT rewritten; it is marked. `change` is what the Recipe says differently ("8 -> 6 bars"). */
export const staleMessage = (change: string): string => `The Description no longer matches the Recipe${change === '' ? '' : ` (the Recipe changed: ${change})`}.`;
/** The strip's sentence once the driver chose to keep the script while their list edit waits. */
export const heldMessage = (): string => 'The Description no longer matches the Recipe (your Description edit is held until you choose).';
/** The one question when a list edit meets a Recipe that holds edits of its own. */
export const ASK_ONCE = 'Your Recipe has edits the Description does not have. Keep them or replace them with the Description?';
/** The words on the buttons (the actions keep their old names: `update-recipe`, `revert`, `update`). */
export const SCRIPT_LABELS = { rewrite: 'Rewrite the description from the recipe', discard: 'Discard my Recipe edits', keep: 'Keep my Recipe edits', replace: 'Replace them with the Description' };
/** A script the list's sentences cannot say: refused in plain words, the Recipe kept as it is. */
export const UNSAYABLE = 'The Description cannot say this Recipe in sentences, so it is not rewritten from it. Your Recipe is kept as it is; change it, or use Discard my Recipe edits.';

/** Stable text of params (key order does not matter): two readings of the same music are equal. */
export const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x !== null && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1))) : x));

/**
 * What a rewrite from the script keeps of the old list: the driver's words beside a line (` (you said: ...)`) stay with the same canonical line when the rewrite makes it again, and everything from the first WAITING line on stays at the end (those lines were never applied
 * and still wait: dropping them would lose the driver's words). The lines before it are what the script says now.
 */
export function keepLines(fresh: readonly string[], old: readonly string[]): string[] {
  const said = new Map<string, string[]>();
  for (const l of old) { const s = splitSaid(l); if (s.said !== null) said.set(s.line, [...(said.get(s.line) ?? []), s.said]); }
  const out = fresh.map((l) => { const q = said.get(l); const w = q?.shift(); return w === undefined ? l : withSaid(l, w); });
  const firstWaiting = old.findIndex(isWaitingLine);
  return firstWaiting < 0 ? out : [...out, ...old.slice(firstWaiting)];
}

/** "Rewrite the description from the recipe": the note as the Recipe says it (every derived part made again, as `applyRecipeText` does), with the list kept as far as it can be (`keepLines`); or why not. A Recipe that parses but whose params the list's sentences do not give back
 *  exactly is REFUSED (nothing is written: the Recipe is never lost). */
export function rewriteFromScript(text: string, name: string, family: Family, vault: GrammarVault, planned: string, sentencesOf: (params: GrammarParams, kind: Family) => string[] = linesOfParams): { ok: true; text: string; change: string } | { ok: false; message: string; stale: boolean } {
  const r = applyRecipeText(text, name, family, vault, planned);
  if (r.ok === false) return r;
  const st = descriptionState(text, family, vault, 'recipe');
  if (st.kind !== 'recipe-apply') return { ok: false, message: 'There is nothing to update: the Recipe matches the note.', stale: true };
  const fresh = sentencesOf(st.params, family);                 // (the parameter is the test's way to hand the list a shape its sentences cannot give back: no Recipe the grammars read does that today, found by trying)
  const back = replayGrammar(fresh, family, { vault });
  if (back.params === null || canon(back.params) !== canon(st.params)) return { ok: false, message: UNSAYABLE, stale: false };
  const merged = keepLines(fresh, parseList(extractDescription(text), family, vault).list);
  if (merged.length === fresh.length && merged.every((l, i) => l === fresh[i])) return r;
  const w = writeListNote(text, name, family, { params: st.params, list: merged });
  return w.ok === false ? { ok: false, message: w.message, stale: false } : { ok: true, text: asRecipeSourced(w.text), change: r.change };
}
