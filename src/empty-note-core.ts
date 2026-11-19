// 2026-11-19-0960 - a sentence-driven note (phrase, arrangement, composition) STARTS EMPTY (driver 2026-11-18, R2; checklists/music_tabs_chat_ui_design.md section 11): an empty Description, an empty Recipe, an empty Python and an
// empty json cache. It has NO KIND until its first applied sentence: the sentence makes the kind and every facet, by the same writers the controls use. Pure: no obsidian import, no DOM.
//
// What "empty" is in the file (the ONE definition, `isEmptyNote`): a data note (frontmatter) whose json fence holds an EMPTY OBJECT. Everything else about it is written by the same renderer every note uses
// (renderSourceChainNote), with empty parts, so its six stamps (source_facet, the three hashes and the two derived-from hashes) are the hashes of the empty facets: no facet reads as "edited by hand", nothing offers to
// update, revert or repair it, and nothing ever writes a failing Recipe or Python for it (it has none). Bars and rhythm notes are DATA notes, not sentence-driven: they are not made here.
import { extractPhraseJsonBlock, renderSourceChainNote, type SourceChainParts } from './phrase-notes-core.ts';

/** What another note says when a source it plays has no sentence yet (a track's phrase, a section's note): said where the empty message of a source would otherwise end a sentence in nothing. */
export const EMPTY_SOURCE = 'it is empty: it has no sentence yet';

/** The parts of a note with nothing in it: no frontmatter description, no links, no sentence, no Recipe step, no Python. */
const NO_PARTS: SourceChainParts = { description: '', links: [], sentence: '', recipe: [], python: '' };

/** The text of a new empty note: the frontmatter (a data note, `extraFront` after it), the three empty sections the facets live in, and the json cache last, `{}`. */
function emptyNote(extraFront: readonly string[] = []): string {
  const fence = ['```json', '{}', '```', ''].join('\n');
  const stub = ['---', 'type: data', 'content_type: json', ...extraFront, '---', '', ''].join('\n');
  return renderSourceChainNote(stub + fence, NO_PARTS, stub.length);
}

/** A new phrase: no kind (readPhraseKind says null), nothing to draw. `name` is only the note's name (the file's); an empty note says nothing about itself. */
export const emptyPhraseNote = (_name: string): string => emptyNote();
/** A new arrangement: no tracks yet. */
export const emptyArrangementNote = (_name: string): string => emptyNote();
/** A new composition: no sections yet. `extraFront` is for the root mark of the piece (`root: true`). */
export const emptyCompositionNote = (_name: string, extraFront: readonly string[] = []): string => emptyNote(extraFront);

/** Is this note EMPTY: a data note whose json cache is an empty object (spaces and line breaks inside the braces do not matter)? Anything else is not: a kind, any key, invalid json, a list, no frontmatter, no fence. */
export function isEmptyNote(text: string): boolean {
  if (typeof text !== 'string') return false;
  const block = extractPhraseJsonBlock(text);
  if (block.ok === false) return false;
  try {
    const v = JSON.parse(text.slice(block.contentStart, block.contentEnd)) as unknown;
    return v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0;
  } catch {
    return false;
  }
}
