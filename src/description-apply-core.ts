// 2026-10-31-1120 (M15c, design 4.14) - "Update from Description": the pure core. A phrase, arrangement or composition note is written by the controls (the Description is then the grammar's sentence and carries a hash); when the PERSON edits
// the Description by hand, the hash no longer matches, and this decides what that edit means: it parses (apply it: json cache, Recipe, Python, stamps follow), it does not parse (write nothing, say where), or it is the derived Recipe / Python
// that was edited instead (they are derived: say so, change nothing). No `obsidian` import: the vault, the clock and the UI are the controller's (description-apply.ts).
import { parse, type GrammarError, type GrammarParams, type GrammarVault } from './phrase-grammar-core.ts';
import { asRecipeSourced, descriptionEditedByHand, extractPhraseJsonBlock, recipeEditedByHand } from './phrase-notes-core.ts';
import { facetHashSync } from './facet-sync-hash-core.ts';
import { extractDescription, extractPythonSection, extractRecipeSection } from './v2-note-core.ts';
import { parseFrontmatter } from './rhythm-edit-core.ts';
import { applyPhraseWrite, readPhraseNote } from './phrase-core.ts';
import { applyArrangementWrite, readArrangementNote } from './arrangement-core.ts';
import { applyCompositionWrite, readCompositionNote } from './composition-core.ts';
import { wrongKindSentence, type Family } from './note-family-core.ts';
import { BOTH_EDITED, PYTHON_DERIVED, recipeEdit } from './recipe-apply-core.ts';

// the kind tables moved to note-family-core.ts (2026-10-31-1140, so the Recipe core can read them too); re-exported so every importer is unchanged
export { familyOfPath, type Family } from './note-family-core.ts';
export { PYTHON_DERIVED };
export const DESCRIPTION_DEBOUNCE_MS = 600;

/**
 * What a note's text says right now about its SOURCES (a Description and, since 2026-10-31-1140 (M16a), a Recipe: either may be the one a person edited by hand).
 *  `synced` nothing to say; `derived-edited` only the Python was edited (derived: said, not applied); `rejected` / `apply` the Description was edited; `recipe-rejected` / `recipe-apply` the Recipe was; `both-edited` both were.
 */
export type DescriptionState =
  | { kind: 'synced' }
  | { kind: 'derived-edited'; message: string }
  | { kind: 'both-edited'; message: string }
  | { kind: 'rejected'; sentence: string; error: GrammarError; message: string }
  | { kind: 'apply'; sentence: string; params: GrammarParams; change: string; unchanged: boolean }
  | { kind: 'recipe-rejected'; recipe: string; error: GrammarError; message: string }
  | { kind: 'recipe-apply'; recipe: string; params: GrammarParams; change: string; unchanged: boolean };

/** `Description, line 1, column 28: expected "bars" after the number.` - one sentence, the grammar's own words with a lower-case start. */
export function rejectionMessage(error: GrammarError): string {
  const m = error.message.length > 0 ? error.message[0].toLowerCase() + error.message.slice(1) : 'it could not be read';
  return `Description, line ${error.line}, column ${error.column}: ${m}`;
}

/** The params the note's json cache holds now (null when it cannot be read). */
export function cacheParams(text: string, family: Family): GrammarParams | null {
  const read = family === 'phrase' ? readPhraseNote(text) : family === 'arrangement' ? readArrangementNote(text) : readCompositionNote(text);
  return read.ok ? read.value : null;
}

const show = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : v === undefined ? 'none' : 'changed');
/** What an applied Description changed, in the words of the evidence line: `8 -> 6 bars`, `style building`, `no change in the music` (a wording-only edit). */
export function changeSummary(prev: GrammarParams | null, next: GrammarParams): string {
  if (prev === null) return `now ${next.kind}`;
  if (prev.kind !== next.kind) return `${prev.kind} -> ${next.kind}`;
  const a = prev as unknown as Record<string, unknown>, b = next as unknown as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof a.bars === 'number' && typeof b.bars === 'number' && a.bars !== b.bars) parts.push(`${a.bars} -> ${b.bars} bars`);
  for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])]) {
    if (key === 'kind' || key === 'bars') continue;
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) parts.push(typeof a[key] === 'object' || typeof b[key] === 'object' ? `${key} changed` : `${key} ${show(a[key])} -> ${show(b[key])}`);
  }
  return parts.length > 0 ? parts.join(', ') : 'no change in the music';
}

const sameParams = (a: GrammarParams | null, b: GrammarParams): boolean => a !== null && JSON.stringify(a) === JSON.stringify(b);

/** Was the Python edited by hand (the Description and the Recipe still match their stamps)? Only a note that carries the stamps can say so. Since 2026-10-31-1140 (M16a) the Recipe is a SOURCE, not derived text: a Recipe edit is `recipeEdit`'s. */
export function derivedEditedByHand(text: string): boolean {
  const fields = parseFrontmatter(text)?.fields;
  if (!fields) return false;
  const stored = fields.python_hash;
  return typeof stored === 'string' && stored !== '' && stored !== facetHashSync(extractPythonSection(text) ?? '');
}

/**
 * What the note's text says right now about its sources. Pure; `vault` is what the grammar checks names against.
 * `prefer` settles a note whose Description AND Recipe were both edited, for the button the person pressed: with none, that note is `both-edited` and nothing is applied.
 */
export function descriptionState(text: string, family: Family, vault: GrammarVault, prefer?: 'description' | 'recipe'): DescriptionState {
  if (!parseFrontmatter(text) || extractPhraseJsonBlock(text).ok === false) return { kind: 'synced' };           // not a data note of ours: nothing to say
  const descriptionEdited = descriptionEditedByHand(text), recipeEdited = recipeEditedByHand(text);
  if (descriptionEdited && recipeEdited && prefer === undefined) return { kind: 'both-edited', message: BOTH_EDITED };
  if (recipeEdited && (!descriptionEdited || prefer === 'recipe')) {
    const e = recipeEdit(text, family, vault);
    if (e.kind === 'rejected') return { kind: 'recipe-rejected', recipe: e.recipe, error: e.error, message: e.message };
    if (e.kind === 'apply') { const prev = cacheParams(text, family); return { kind: 'recipe-apply', recipe: e.recipe, params: e.params, change: changeSummary(prev, e.params), unchanged: sameParams(prev, e.params) }; }
    return { kind: 'synced' };
  }
  if (!descriptionEdited) return derivedEditedByHand(text) ? { kind: 'derived-edited', message: PYTHON_DERIVED } : { kind: 'synced' };
  const sentence = extractDescription(text);
  const res = parse(sentence, vault);
  if (res.ok === false) return { kind: 'rejected', sentence, error: res.error, message: rejectionMessage(res.error) };
  const wrong = wrongKindSentence(family, res.params.kind, 'the sentence');
  if (wrong !== null) {
    const error = { message: wrong, line: 1, column: 1 };
    return { kind: 'rejected', sentence, error, message: rejectionMessage(error) };
  }
  const prev = cacheParams(text, family);
  return { kind: 'apply', sentence, params: res.params, change: changeSummary(prev, res.params), unchanged: sameParams(prev, res.params) };
}

type Written = { ok: true; text: string } | { ok: false; message: string };
/** The note with `params` as its json and every derived part made again, by the SAME writers the controls use (the hand-edit refusal lifted: the Description is the input). */
export function writeFromParams(text: string, name: string, family: Family, params: GrammarParams): Written {
  if (family === 'phrase') return applyPhraseWrite(text, params as Parameters<typeof applyPhraseWrite>[1], name, true);
  const w = family === 'arrangement' ? applyArrangementWrite(text, name, params as Parameters<typeof applyArrangementWrite>[2], true) : applyCompositionWrite(text, name, params as Parameters<typeof applyCompositionWrite>[2], true);
  return w.ok === false ? { ok: false, message: w.message } : { ok: true, text: w.text };
}

/** "Update from Description": the new text, or why not. Decided on the text it is GIVEN (inside the atomic write), against the sentence that was planned: a Description that changed since is not written (the newer edit is evaluated by its own turn). */
export function applyDescriptionText(text: string, name: string, family: Family, vault: GrammarVault, planned: string, prefer?: 'description'): { ok: true; text: string; change: string } | { ok: false; message: string; stale: boolean } {
  const st = descriptionState(text, family, vault, prefer);
  if (st.kind !== 'apply') return { ok: false, message: st.kind === 'rejected' || st.kind === 'both-edited' ? st.message : 'There is nothing to update: the Description matches the note.', stale: true };
  if (st.sentence !== planned) return { ok: false, message: 'The Description changed again; the newer sentence is being read.', stale: true };
  const w = writeFromParams(text, name, family, st.params);
  return w.ok === false ? { ok: false, message: w.message, stale: false } : { ok: true, text: w.text, change: st.change };
}

/**
 * "Update from Recipe" (M16a): the new text, or why not. Decided on the text it is GIVEN (inside the atomic write), against the Recipe that was planned: a Recipe that changed since is not written (the newer edit is evaluated by its own turn).
 * `prefer: 'recipe'` is the button on a note whose Description was edited too: the Recipe is kept and the Description edit is dropped, as the person chose. The result is a RECIPE-sourced note: the same writers as ever make every derived
 * part again from the params the Recipe says (the hand-edit refusal lifted: the Recipe is the input), and the stamps say the Description is derived from the Recipe.
 */
export function applyRecipeText(text: string, name: string, family: Family, vault: GrammarVault, planned: string): { ok: true; text: string; change: string } | { ok: false; message: string; stale: boolean } {
  const st = descriptionState(text, family, vault, 'recipe');
  if (st.kind !== 'recipe-apply') return { ok: false, message: st.kind === 'recipe-rejected' ? st.message : 'There is nothing to update: the Recipe matches the note.', stale: true };
  if (st.recipe !== planned) return { ok: false, message: 'The Recipe changed again; the newer text is being read.', stale: true };
  const w = writeFromParams(text, name, family, st.params);
  return w.ok === false ? { ok: false, message: w.message, stale: false } : { ok: true, text: asRecipeSourced(w.text), change: st.change };
}

/** "Revert": the Description the json cache says, and every derived part with it (the hand edit is dropped). */
export function revertDescriptionText(text: string, name: string, family: Family): Written {
  const prev = cacheParams(text, family);
  if (prev === null) return { ok: false, message: 'Revert: the note\'s json cache cannot be read, so there is no last good Description to go back to.' };
  return writeFromParams(text, name, family, prev);
}

export const appliedLine = (name: string, change: string): string => `[forge-description] applied ${name} (${change})`;
export const rejectedLine = (name: string, e: GrammarError): string => `[forge-description] rejected ${name}: line ${e.line} column ${e.column} ${e.message}`;
export const revertedLine = (name: string): string => `[forge-description] reverted ${name} to the json cache`;
export const ignoredLine = (name: string): string => `[forge-description] ignored ${name}: ${PYTHON_DERIVED}`;
export const askedServiceLine = (name: string, outcome: string): string => `[forge-description] asked the service about ${name} -> ${outcome}`;
