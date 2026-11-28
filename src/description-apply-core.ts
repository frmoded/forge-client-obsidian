// 2026-10-31-1120 (M15c, design 4.14) - "Update from Description": the pure core. A phrase, arrangement or composition note is written by the controls (the Description is then the grammar's sentence and carries a hash); when the PERSON edits
// the Description by hand, the hash no longer matches, and this decides what that edit means: it parses (apply it: json cache, Recipe, Python, stamps follow) or it does not (write nothing, say where). 2026-11-26-1047: the Description is the ONLY
// source; the Recipe and the Python are generated and never read back (a hand edit of either is answered by one line), and DETACH makes a note custom Python, one way. No `obsidian` import: the vault, the clock and the UI are the controller's (description-apply.ts).
import { parse, type GrammarError, type GrammarParams, type GrammarVault } from './phrase-grammar-core.ts';
import { asCustom, descriptionEditedByHand, extractPhraseJsonBlock, generatedEditedByHand, isCustomNote, pythonEditedByHand, pythonTextOf, withLinks } from './phrase-notes-core.ts';
import { customCallNotes } from './custom-note-core.ts';
import { facetHashSync } from './facet-sync-hash-core.ts';
import { extractDescription, extractRecipeSection } from './v2-note-core.ts';
import { editabilityProblem, parseFrontmatter } from './rhythm-edit-core.ts';
import { readPhraseNote } from './phrase-core.ts';
import { linesOfParams, parseList, replayGrammar, type ListStop } from './sentence-list-core.ts';
import { writeListNote } from './sentence-list-note-core.ts';
import { listModel } from './list-model-selected.ts';
import { readArrangementNote } from './arrangement-core.ts';
import { readCompositionNote } from './composition-core.ts';
import { wrongKindSentence, type Family } from './note-family-core.ts';

// the kind tables moved to note-family-core.ts (2026-10-31-1140, so the Recipe core can read them too); re-exported so every importer is unchanged
export { familyOfPath, type Family } from './note-family-core.ts';
export const DESCRIPTION_DEBOUNCE_MS = 600;

/**
 * What a note's text says right now: `synced` nothing to say; `rejected` / `apply` the Description was edited by hand; `generated-edited` the Description is as it was written but the (generated) Recipe or Python was changed by hand, `facets` is what
 * they say now (the person's OK is for that text); `custom-note` a custom note (the banner, the controls off), `edited` = its Python was changed by hand since the note was last written.
 */
export type DescriptionState =
  | { kind: 'synced' }
  | { kind: 'generated-edited'; facets: string }
  | { kind: 'rejected'; sentence: string; error: GrammarError; message: string }
  /** 2026-11-19-0970 (and 2026-11-19-0980 for a phrase): `sentence` is the Description's text (a numbered list, or a legacy paragraph), `params` what its READABLE lines say, `list` the lines (the readable ones canonical, the rest as written) and `stop` where an unreadable line stopped the replay. */
  | { kind: 'apply'; sentence: string; params: GrammarParams; change: string; unchanged: boolean; list?: string[]; stop?: ListStop }
  | { kind: 'custom-note'; edited: boolean };

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

/** What the note's text says right now. Pure; `vault` is what the grammar checks names against. */
export function descriptionState(text: string, family: Family, vault: GrammarVault): DescriptionState {
  if (!parseFrontmatter(text) || extractPhraseJsonBlock(text).ok === false) return { kind: 'synced' };           // not a data note of ours: nothing to say
  if (isCustomNote(text)) return { kind: 'custom-note', edited: pythonEditedByHand(text) };
  if (!descriptionEditedByHand(text)) return generatedEditedByHand(text) ? { kind: 'generated-edited', facets: `${extractRecipeSection(text) ?? ''}\n${pythonTextOf(text) ?? ''}` } : { kind: 'synced' };
  const sentence = extractDescription(text);
  { const listed = listState(text, sentence, family, vault); if (listed !== null) return listed; }           // 2026-11-19-0980: a phrase's Description is a list too (stage 2)
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

/**
 * 2026-11-19-0970 (the list model): what the Description of an arrangement or a composition says when it is a LIST (or a legacy paragraph, split on the way): the lines are replayed through the grammar, one prefix at a time. The readable
 * lines before the first unreadable one are an `apply` (the unreadable line is kept and named in `stop`); when NO line can be read it is `rejected`, as a Description the grammar cannot read always was (nothing is written, the note keeps
 * what it shows). An empty Description is left to the grammar's own refusal (null).
 */
function listState(text: string, sentence: string, family: Family, vault: GrammarVault): DescriptionState | null {
  const parsed = parseList(sentence, family, vault);
  if (parsed.list.length === 0) return null;
  const rp = replayGrammar(parsed.list, family, { vault });
  if (rp.params === null) {
    const error = { message: rp.stop?.message ?? 'it could not be read', line: rp.stop?.line ?? 1, column: rp.stop?.column ?? 1 };
    return { kind: 'rejected', sentence, error, message: rejectionMessage(error) };
  }
  const prev = cacheParams(text, family);
  return { kind: 'apply', sentence, params: rp.params, change: changeSummary(prev, rp.params), unchanged: sameParams(prev, rp.params), list: rp.list, ...(rp.stop !== null ? { stop: rp.stop } : {}) };
}

type Written = { ok: true; text: string } | { ok: false; message: string };
/** 2026-11-27-1050: the prompt stack goes with a list write: the groups the written list no longer matches are dropped (lean: the text as it is). */
const carried = (w: Written, family: Family): Written => (w.ok === false ? w : { ok: true, text: listModel.groups.carry(w.text, family) });
/** The note with `params` as its json and every derived part made again, by the SAME writers the controls use (the hand-edit refusal lifted: the Description is the input). */
export function writeFromParams(text: string, name: string, family: Family, params: GrammarParams): Written {
  return carried(writeListNote(text, name, family, { params, list: linesOfParams(params, family) }), family);     // 2026-11-19-0970: the Description of an arrangement and a composition is the list of canonical sentences, whoever writes it; 2026-11-19-0980: a phrase's too
}

/** "Update from Description": the new text, or why not. Decided on the text it is GIVEN (inside the atomic write), against the sentence that was planned: a Description that changed since is not written (the newer edit is evaluated by its own turn). */
export function applyDescriptionText(text: string, name: string, family: Family, vault: GrammarVault, planned: string, limit?: number): { ok: true; text: string; change: string } | { ok: false; message: string; stale: boolean } {
  const st = descriptionState(text, family, vault);
  if (st.kind !== 'apply') return { ok: false, message: st.kind === 'rejected' ? st.message : 'There is nothing to update: the Description matches the note.', stale: true };
  if (st.sentence !== planned) return { ok: false, message: 'The Description changed again; the newer sentence is being read.', stale: true };
  if (st.list !== undefined) {                                                  // 2026-11-19-0970: the whole list is written in ONE go; `limit` (the loop check cut the list there) lines at most are applied, every line is kept
    const rp = replayGrammar(st.list, family, { vault, ...(limit !== undefined ? { maxApplied: limit } : {}) });
    if (rp.params === null) return { ok: false, message: 'There is nothing to update: no line of the Description can be read.', stale: false };
    const w = carried(writeListNote(text, name, family, rp), family);
    return w.ok === false ? { ok: false, message: w.message, stale: false } : { ok: true, text: w.text, change: st.change };
  }
  const w = writeFromParams(text, name, family, st.params);
  return w.ok === false ? { ok: false, message: w.message, stale: false } : { ok: true, text: w.text, change: st.change };
}

/**
/**
/** A CUSTOM note's text with its Python as it stands taken as the note: its `python_hash` is the Python's, `links:` follows the Python's calls (2026-11-03-1160 (d)). The one writer of a custom note: a hand edit of an existing one, and Detach. */
export const customNoteText = (text: string, name: string): string => withLinks(asCustom(listModel.groups.drop(text)), customCallNotes(name, pythonTextOf(text) ?? ''));          // 2026-11-27-1050: a custom note has no prompt stack
export const customFollowedLine = (name: string): string => `[forge-custom] ${name}: the links and the stamp follow its edited Python`;

/** 2026-11-26-1047 (DETACH, one way): what the person is asked before the note becomes custom Python. */
export const DETACH_CONFIRM = 'Detach makes this note custom Python: the Python as it is now becomes the note, and the Score is made by running it. The controls are switched off and the Description and the Recipe are no longer applied. This cannot be undone.';
/** Why this note cannot be detached (null = it can): it is custom already, its writer may not edit it (read_only), or it has no Python yet. */
export function detachRefusal(text: string): string | null {
  if (isCustomNote(text)) return 'Detach: this note is already custom Python.';
  const fm = parseFrontmatter(text);
  const locked = fm ? editabilityProblem(fm.fields) : null;
  if (locked !== null) return `Detach: ${locked}`;
  return extractPhraseJsonBlock(text).ok === false || (pythonTextOf(text) ?? '').trim() === '' ? 'Detach: this note has no Python yet. Say a sentence first.' : null;
}
export const detachedLine = (name: string): string => `[forge-detach] ${name} is now custom Python`;

/** "Revert": the Description the json cache says, and every derived part with it (the hand edit is dropped). */
export function revertDescriptionText(text: string, name: string, family: Family): Written {
  const prev = cacheParams(text, family);
  if (prev === null) return { ok: false, message: 'Revert: the note\'s json cache cannot be read, so there is no last good Description to go back to.' };
  return writeFromParams(text, name, family, prev);
}

export const appliedLine = (name: string, change: string): string => `[forge-description] applied ${name} (${change})`;
export const descriptionHeldLine = (name: string): string => `[forge-description] held ${name}: the Description was edited, Forge applies it`;       // 2026-11-23-1018
export const rejectedLine = (name: string, e: GrammarError): string => `[forge-description] rejected ${name}: line ${e.line} column ${e.column} ${e.message}`;
export const revertedLine = (name: string): string => `[forge-description] reverted ${name} to the json cache`;
export const askedServiceLine = (name: string, outcome: string): string => `[forge-description] asked the service about ${name} -> ${outcome}`;
/** 2026-11-13-1209: a request LEFT (the driver could see no trace at all when the answer was lost; now both ends are traced). */
export const askingServiceLine = (name: string): string => `[forge-description] asking the service about ${name}`;

