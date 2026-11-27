// 2026-11-19-0970 (THE LIST MODEL, stage 1) - the NOTE side of the list: read the Description section of an arrangement or composition note as a list, and write the whole note from a replay in ONE go (the Description as the numbered
// list, the derived frontmatter `description:` and `links:`, the Recipe, the Python, the json cache and the six stamps), by the SAME writers every control uses (applyArrangementWrite / applyCompositionWrite -> renderSourceChainNote: the
// stamps are the hashes of the FINISHED text, so a list note is "in sync" with its own stamps and nothing is offered to update). Pure strings in, strings out: no `obsidian`, no vault.
//
// IDEMPOTENT: the writers are deterministic and keep everything from the json fence down byte for byte, so writing a replay of the list a note already has gives the note's own text (the caller's `process` then writes nothing: "no-op
// stays no-op"). A replay that applied NOTHING (an empty list) writes the EMPTY note of 0960 (json `{}`, empty facets), byte for byte what a new note is: undoing every sentence gives it back.
import type { GrammarParams, GrammarVault } from './phrase-grammar-core.ts';
import { applyArrangementWrite, type ArrangementParams } from './arrangement-core.ts';
import { applyCompositionWrite, type CompositionParams } from './composition-core.ts';
import { CUSTOM_BANNER, extractPhraseJsonBlock, isCustomNote, renderSourceChainNote } from './phrase-notes-core.ts';
import { applyPhraseWrite, phraseWriteRefusal, type PhraseParams } from './phrase-core.ts';
import { extractDescription } from './v2-note-core.ts';
import { listAfterParams, parseList, render, type ListKind, type ParsedList } from './sentence-list-core.ts';
import { withCacheFence } from './cache-fence-core.ts';

/** The list a note's Description section holds (a numbered list, a legacy paragraph split into its sentences, or one legacy line). Reads only. */
export function listOfNote(text: string, kind: ListKind, vault: GrammarVault): ParsedList {
  return parseList(extractDescription(text), kind, vault);
}

/** What a write needs of a replay: the params the applied lines say (null = none) and the lines (all of them: an unreadable line is kept in the Description). */
export interface ListWrite { params: GrammarParams | null; list: readonly string[] }

const eolOf = (text: string): string => (text.includes('\r\n') ? '\r\n' : '\n');

/** The note `text` with its Description, Recipe, Python, json cache, links and stamps made again from `replay`. `ok: false` says why (no json block: not one of our notes). */
export function writeListNote(note: string, name: string, kind: ListKind, replay: ListWrite): { ok: true; text: string } | { ok: false; message: string } {
  if (isCustomNote(note)) return { ok: false, message: CUSTOM_BANNER };          // 2026-11-26-1047: DETACH has no way back: no write of a list (a push, Forge, Revert, an undo) goes over a custom note's Python
  const text = withCacheFence(note);                                     // 2026-11-19-0990: a note with no json fence is valid and empty: the first write gives it its (empty) cache first, then writes everything else as it always did
  const sentence = render(replay.list, eolOf(text));
  if (replay.params === null) {
    const block = extractPhraseJsonBlock(text);
    if (block.ok === false) return { ok: false, message: block.message };
    const emptied = text.slice(0, block.contentStart) + '{}' + text.slice(block.contentEnd);
    return { ok: true, text: renderSourceChainNote(emptied, { description: '', links: [], sentence, recipe: [], python: '' }, block.fenceStart) };
  }
  const w = kind === 'arrangement' ? applyArrangementWrite(text, name, replay.params as ArrangementParams, true, sentence)
    : kind === 'composition' ? applyCompositionWrite(text, name, replay.params as CompositionParams, true, sentence)
      : applyPhraseWrite(text, replay.params as PhraseParams, name, true, sentence);       // 2026-11-19-0980 (stage 2): a phrase is written from its list too
  return w.ok === false ? { ok: false, message: w.message } : { ok: true, text: w.text };
}

/**
 * 2026-11-19-0980 (stage 2) - the STRIP's write: a slider, a picker or "Edit this bar" wrote `params`. The note is made again from the LIST, not from one sentence: the lines are edited in the smallest way that makes their replay say `params`
 * (listAfterParams: a Bars or Tempo slider writes or replaces a modifier line, a source or a style rewrites the head, a fork is a fork line) and the whole note is written in one go, idempotently. A legacy paragraph is split on the way (a strip write is
 * a recompute). Every refusal of a control write holds as it did (a Description, Recipe or Python edited by hand is never overwritten: `Not saved: ...`). `vault` is what the sentences may name.
 */
export function writePhraseStrip(text: string, name: string, params: PhraseParams, vault: GrammarVault): { ok: true; text: string } | { ok: false; message: string } {
  const refusal = phraseWriteRefusal(text, name, false);
  if (refusal !== null) return { ok: false, message: refusal };
  const lines = listAfterParams(listOfNote(text, 'phrase', vault).list, params, 'phrase', { vault });
  return applyPhraseWrite(text, params, name, false, render(lines, eolOf(text)));
}
