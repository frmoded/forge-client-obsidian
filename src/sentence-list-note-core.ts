// 2026-11-19-0970 (THE LIST MODEL, stage 1) - the NOTE side of the list: read the Description section of an arrangement or composition note as a list, and write the whole note from a replay in ONE go (the Description as the numbered
// list, the derived frontmatter `description:` and `links:`, the Recipe, the Python, the json cache and the six stamps), by the SAME writers every control uses (applyArrangementWrite / applyCompositionWrite -> renderSourceChainNote: the
// stamps are the hashes of the FINISHED text, so a list note is "in sync" with its own stamps and nothing is offered to update). Pure strings in, strings out: no `obsidian`, no vault.
//
// IDEMPOTENT: the writers are deterministic and keep everything from the json fence down byte for byte, so writing a replay of the list a note already has gives the note's own text (the caller's `process` then writes nothing: "no-op
// stays no-op"). A replay that applied NOTHING (an empty list) writes the EMPTY note of 0960 (json `{}`, empty facets), byte for byte what a new note is: undoing every sentence gives it back.
import type { GrammarParams, GrammarVault } from './phrase-grammar-core.ts';
import { applyArrangementWrite, type ArrangementParams } from './arrangement-core.ts';
import { applyCompositionWrite, type CompositionParams } from './composition-core.ts';
import { extractPhraseJsonBlock, renderSourceChainNote } from './phrase-notes-core.ts';
import { extractDescription } from './v2-note-core.ts';
import { parseList, render, type ListKind, type ParsedList } from './sentence-list-core.ts';

/** The list a note's Description section holds (a numbered list, a legacy paragraph split into its sentences, or one legacy line). Reads only. */
export function listOfNote(text: string, kind: ListKind, vault: GrammarVault): ParsedList {
  return parseList(extractDescription(text), kind, vault);
}

/** What a write needs of a replay: the params the applied lines say (null = none) and the lines (all of them: an unreadable line is kept in the Description). */
export interface ListWrite { params: GrammarParams | null; list: readonly string[] }

const eolOf = (text: string): string => (text.includes('\r\n') ? '\r\n' : '\n');

/** The note `text` with its Description, Recipe, Python, json cache, links and stamps made again from `replay`. `ok: false` says why (no json block: not one of our notes). */
export function writeListNote(text: string, name: string, kind: ListKind, replay: ListWrite): { ok: true; text: string } | { ok: false; message: string } {
  const sentence = render(replay.list, eolOf(text));
  if (replay.params === null) {
    const block = extractPhraseJsonBlock(text);
    if (block.ok === false) return { ok: false, message: block.message };
    const emptied = text.slice(0, block.contentStart) + '{}' + text.slice(block.contentEnd);
    return { ok: true, text: renderSourceChainNote(emptied, { description: '', links: [], sentence, recipe: [], python: '' }, block.fenceStart) };
  }
  const w = kind === 'arrangement' ? applyArrangementWrite(text, name, replay.params as ArrangementParams, true, sentence)
    : kind === 'composition' ? applyCompositionWrite(text, name, replay.params as CompositionParams, true, sentence)
      : { ok: false as const, message: 'A phrase is not written from a list yet.' };
  return w.ok === false ? { ok: false, message: w.message } : { ok: true, text: w.text };
}
