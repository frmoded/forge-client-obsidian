// 2026-10-31-1120 (M15c, design 4.14) - "Update from Description": the pure core. A phrase, arrangement or composition note is written by the controls (the Description is then the grammar's sentence and carries a hash); when the PERSON edits
// the Description by hand, the hash no longer matches, and this decides what that edit means: it parses (apply it: json cache, Recipe, Python, stamps follow), it does not parse (write nothing, say where), or it is the derived Recipe / Python
// that was edited instead (they are derived: say so, change nothing). No `obsidian` import: the vault, the clock and the UI are the controller's (description-apply.ts).
import { parse, type GrammarError, type GrammarParams, type GrammarVault } from './phrase-grammar-core.ts';
import { asCustom, asPythonSourced, asRecipeSourced, extractPhraseJsonBlock, isCustomNote, pythonTextOf } from './phrase-notes-core.ts';
import { facetHashSync } from './facet-sync-hash-core.ts';
import { extractDescription, extractPythonSection, extractRecipeSection } from './v2-note-core.ts';
import { parseFrontmatter } from './rhythm-edit-core.ts';
import { applyPhraseWrite, readPhraseNote } from './phrase-core.ts';
import { applyArrangementWrite, readArrangementNote } from './arrangement-core.ts';
import { applyCompositionWrite, readCompositionNote } from './composition-core.ts';
import { wrongKindSentence, type Family } from './note-family-core.ts';
import { recipeEdit } from './recipe-apply-core.ts';
import { bothEditedMessage, editedFacetsOf, pythonCommentsOf, pythonEdit, type Facet } from './python-apply-core.ts';

// the kind tables moved to note-family-core.ts (2026-10-31-1140, so the Recipe core can read them too); re-exported so every importer is unchanged
export { familyOfPath, type Family } from './note-family-core.ts';
export const DESCRIPTION_DEBOUNCE_MS = 600;

/**
 * What a note's text says right now about its SOURCES (a Description and, since 2026-10-31-1140 (M16a), a Recipe: either may be the one a person edited by hand).
 *  `synced` nothing to say; `custom-note` a custom note at rest (the banner); `rejected` / `apply` the Description was edited; `recipe-rejected` / `recipe-apply` the Recipe was; `python-apply` / `python-custom` the Python was (2026-11-02-1155, M16b: a known shape maps back; anything else is a CUSTOM note);
 *  `both-edited` two or three of them were (`facets` says which).
 */
export type DescriptionState =
  | { kind: 'synced' }
  | { kind: 'both-edited'; message: string; facets: Facet[] }
  | { kind: 'rejected'; sentence: string; error: GrammarError; message: string }
  | { kind: 'apply'; sentence: string; params: GrammarParams; change: string; unchanged: boolean }
  | { kind: 'recipe-rejected'; recipe: string; error: GrammarError; message: string }
  | { kind: 'recipe-apply'; recipe: string; params: GrammarParams; change: string; unchanged: boolean }
  | { kind: 'python-apply'; python: string; params: GrammarParams; change: string; unchanged: boolean }
  | { kind: 'python-custom'; python: string; already: boolean }
  /** A custom note nobody is editing right now: the banner stays (the controls are off), and Revert to generated is offered when the json cache from before the takeover can be read. */
  | { kind: 'custom-note'; canRevert: boolean };

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

/**
 * What the note's text says right now about its sources. Pure; `vault` is what the grammar checks names against.
 * `prefer` settles a note whose facets were edited TOGETHER (two or three of Description, Recipe, Python), for the button the person pressed: with none, that note is `both-edited` and nothing is applied.
 */
export function descriptionState(text: string, family: Family, vault: GrammarVault, prefer?: Facet): DescriptionState {
  if (!parseFrontmatter(text) || extractPhraseJsonBlock(text).ok === false) return { kind: 'synced' };           // not a data note of ours: nothing to say
  const edited = editedFacetsOf(text);
  if (edited.length === 0) return isCustomNote(text) ? { kind: 'custom-note', canRevert: cacheParams(text, family) !== null } : { kind: 'synced' };
  if (edited.length > 1 && prefer === undefined) return { kind: 'both-edited', message: bothEditedMessage(edited), facets: edited };
  const facet: Facet = prefer !== undefined && edited.includes(prefer) ? prefer : edited[0];
  if (facet === 'python') {
    const prev = cacheParams(text, family);
    const e = pythonEdit(text, prev);
    if (e.kind === 'apply') return { kind: 'python-apply', python: e.python, params: e.params, change: changeSummary(prev, e.params), unchanged: sameParams(prev, e.params) };
    return e.kind === 'custom' ? { kind: 'python-custom', python: e.python, already: isCustomNote(text) } : { kind: 'synced' };
  }
  if (facet === 'recipe') {
    const e = recipeEdit(text, family, vault);
    if (e.kind === 'rejected') return { kind: 'recipe-rejected', recipe: e.recipe, error: e.error, message: e.message };
    if (e.kind === 'apply') { const prev = cacheParams(text, family); return { kind: 'recipe-apply', recipe: e.recipe, params: e.params, change: changeSummary(prev, e.params), unchanged: sameParams(prev, e.params) }; }
    return { kind: 'synced' };
  }
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

/**
 * "Update from Python" (M16b): the new text, or why not. Decided on the text it is GIVEN (inside the atomic write), against the Python that was planned: a Python that changed since is not written (the newer edit is evaluated by its own turn).
 * A known shape: the params it says are the input, every derived part is made again by the same writers (the hand-edit refusal lifted) and the note is PYTHON-sourced (the Description and the Recipe stamped as derived from it).
 * Anything else: the note becomes CUSTOM (its Python is kept as typed, its json cache is kept for "Revert to generated"; nothing else is written).
 */
export function applyPythonText(text: string, name: string, family: Family, vault: GrammarVault, planned: string): { ok: true; text: string; change: string; custom: boolean; commentsDropped: boolean } | { ok: false; message: string; stale: boolean } {
  const st = descriptionState(text, family, vault, 'python');
  if (st.kind !== 'python-apply' && st.kind !== 'python-custom') return { ok: false, message: 'There is nothing to update: the Python matches the note.', stale: true };
  if (st.python !== planned) return { ok: false, message: 'The Python changed again; the newer text is being read.', stale: true };
  if (st.kind === 'python-custom') return { ok: true, text: asCustom(text), change: 'custom Python', custom: true, commentsDropped: false };
  const w = writeFromParams(text, name, family, st.params);
  if (w.ok === false) return { ok: false, message: w.message, stale: false };
  const next = asPythonSourced(w.text);
  // 2026-11-03-1155-8 (D4): the grammar writes its own Python; a comment of the person's that is not in it is gone
  const kept = new Set(pythonCommentsOf(pythonTextOf(next) ?? ''));
  return { ok: true, text: next, change: st.change, custom: false, commentsDropped: pythonCommentsOf(planned).some((c) => !kept.has(c)) };
}

/** What "Revert to generated" says it loses, for the confirm dialog: the person's Python (and where the grammar's version comes from). */
export const REVERT_GENERATED_CONFIRM = 'Revert to generated replaces your Python (and the Description and Recipe that were written for it) with what the controls last made for this note, and the Description is the source again (whatever the note was sourced from before). Your Python is lost. Revert?';

/** "Revert to generated" (M16b): the Python of the json cache - the params the grammar last understood, from before the takeover - and every derived part with it; the note is the grammar's again (not custom, Description-sourced). */
export function revertToGeneratedText(text: string, name: string, family: Family): Written {
  const prev = cacheParams(text, family);
  if (prev === null) return { ok: false, message: 'Revert to generated: the note\'s json cache cannot be read, so there is no last good version to go back to.' };
  return writeFromParams(text, name, family, prev);
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
export const askedServiceLine = (name: string, outcome: string): string => `[forge-description] asked the service about ${name} -> ${outcome}`;
