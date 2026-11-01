// 2026-10-31-1120 (M15c, design 4.14) - "Update from Description": the pure core. A phrase, arrangement or composition note is written by the controls (the Description is then the grammar's sentence and carries a hash); when the PERSON edits
// the Description by hand, the hash no longer matches, and this decides what that edit means: it parses (apply it: json cache, Recipe, Python, stamps follow), it does not parse (write nothing, say where), or it is the derived Recipe / Python
// that was edited instead (they are derived: say so, change nothing). No `obsidian` import: the vault, the clock and the UI are the controller's (description-apply.ts).
import { parse, type GrammarError, type GrammarParams, type GrammarVault } from './phrase-grammar-core.ts';
import { descriptionEditedByHand, extractPhraseJsonBlock } from './phrase-notes-core.ts';
import { facetHashSync } from './facet-sync-hash-core.ts';
import { extractDescription, extractPythonSection, extractRecipeSection } from './v2-note-core.ts';
import { parseFrontmatter } from './rhythm-edit-core.ts';
import { applyPhraseWrite, isPhrasePath, readPhraseNote } from './phrase-core.ts';
import { applyArrangementWrite, isArrangementPath, readArrangementNote } from './arrangement-core.ts';
import { applyCompositionWrite, isCompositionPath, readCompositionNote } from './composition-core.ts';

export type Family = 'phrase' | 'arrangement' | 'composition';
export const DESCRIPTION_DEBOUNCE_MS = 600;
export const RECIPE_PYTHON_DERIVED = 'Recipe and Python are derived; edit the Description.';

/** Which kind of derived note a path is (and so which writer and which grammar sentences belong to it); null = not one of ours. */
export function familyOfPath(path: string): Family | null {
  if (isPhrasePath(path)) return 'phrase';
  if (isArrangementPath(path)) return 'arrangement';
  if (isCompositionPath(path)) return 'composition';
  return null;
}

const FAMILY_KINDS: Record<Family, readonly string[]> = { phrase: ['extend', 'mix', 'morph', 'transform'], arrangement: ['arrangement'], composition: ['composition'] };
const WORD: Record<string, string> = { extend: 'a phrase', mix: 'a phrase', morph: 'a phrase', transform: 'a phrase', arrangement: 'an arrangement', composition: 'a composition' };

export type DescriptionState =
  | { kind: 'synced' }
  | { kind: 'derived-edited'; message: string }
  | { kind: 'rejected'; sentence: string; error: GrammarError; message: string }
  | { kind: 'apply'; sentence: string; params: GrammarParams; change: string; unchanged: boolean };

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

/** Was the Recipe or the Python edited by hand (the Description still matches its stamp)? Only a note that carries the stamps can say so. */
export function derivedEditedByHand(text: string): boolean {
  const fields = parseFrontmatter(text)?.fields;
  if (!fields) return false;
  const stale = (stored: unknown, now: string): boolean => typeof stored === 'string' && stored !== '' && stored !== facetHashSync(now);
  return stale(fields.recipe_hash, extractRecipeSection(text) ?? '') || stale(fields.python_hash, extractPythonSection(text) ?? '');
}

/** What the note's text says right now about its Description. Pure; `vault` is what the grammar checks names against. */
export function descriptionState(text: string, family: Family, vault: GrammarVault): DescriptionState {
  if (!parseFrontmatter(text) || extractPhraseJsonBlock(text).ok === false) return { kind: 'synced' };           // not a data note of ours: nothing to say
  if (!descriptionEditedByHand(text)) return derivedEditedByHand(text) ? { kind: 'derived-edited', message: RECIPE_PYTHON_DERIVED } : { kind: 'synced' };
  const sentence = extractDescription(text);
  const res = parse(sentence, vault);
  if (res.ok === false) return { kind: 'rejected', sentence, error: res.error, message: rejectionMessage(res.error) };
  if (!FAMILY_KINDS[family].includes(res.params.kind)) {
    const error = { message: `this note is ${WORD[`${family === 'phrase' ? 'extend' : family}`]}, but the sentence describes ${WORD[res.params.kind]}; make a new note for that`, line: 1, column: 1 };
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
export function applyDescriptionText(text: string, name: string, family: Family, vault: GrammarVault, planned: string): { ok: true; text: string; change: string } | { ok: false; message: string; stale: boolean } {
  const st = descriptionState(text, family, vault);
  if (st.kind !== 'apply') return { ok: false, message: st.kind === 'rejected' ? st.message : 'There is nothing to update: the Description matches the note.', stale: true };
  if (st.sentence !== planned) return { ok: false, message: 'The Description changed again; the newer sentence is being read.', stale: true };
  const w = writeFromParams(text, name, family, st.params);
  return w.ok === false ? { ok: false, message: w.message, stale: false } : { ok: true, text: w.text, change: st.change };
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
export const ignoredLine = (name: string): string => `[forge-description] ignored ${name}: ${RECIPE_PYTHON_DERIVED}`;
export const askedServiceLine = (name: string, outcome: string): string => `[forge-description] asked the service about ${name} -> ${outcome}`;
