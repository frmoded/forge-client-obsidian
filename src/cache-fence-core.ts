// 2026-11-19-0990 - the json CACHE fence of a phrase, arrangement or composition note, and what a note without one (or with two) is. Pure: no obsidian import.
//
// A sentence-driven note is `# Description`, `# Recipe`, `# Python` and `# Cache` (one json fence, last: phrase-notes-core.ts extractPhraseJsonBlock). A note with NO json fence is valid and EMPTY (it has no Score yet: the first sentence writes the fence
// with everything else); a note with TWO is named in plain words (the Score never guesses which one is its cache, and nothing is written). None of the three sentences below says "fence" or counts one.
import { CACHE_NOTE } from './phrase-notes-core.ts';
import { parseFrontmatter } from './rhythm-edit-core.ts';

/** How many ```json fences the note's body (after its frontmatter) opens. */
export function jsonFenceCount(text: string): number {
  const fm = parseFrontmatter(text);
  const body = fm ? text.slice(fm.bodyStart) : text;
  return (body.match(/^```json[ \t]*\r?$/gm) ?? []).length;
}

/** A data note (it has frontmatter) with no json fence at all: valid, and empty. */
export const hasNoCacheFence = (text: string): boolean => typeof text === 'string' && parseFrontmatter(text) !== null && jsonFenceCount(text) === 0;

/** The note with an EMPTY cache (`{}`) under a `# Cache` heading added at its end when it has no json fence; the same text otherwise. */
export function withCacheFence(text: string): string {
  if (!hasNoCacheFence(text)) return text;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const tail = ['', '# Cache', '', CACHE_NOTE, '', '```json', '{}', '```', ''].join(eol);
  return `${text.replace(/\s+$/, '')}${eol}${tail}`;
}

/** What a Score says when the note has nothing to draw yet. */
export const NO_SCORE_YET = 'This note has no Score yet; type a sentence in the box below.';
/** Two json blocks (or text after the cache): which one is the cache is not guessed. */
export const TWO_BLOCKS_WORDS = 'This note has two json blocks (or text after its Cache), so the Score cannot tell which one is its Cache. Keep one json block, under # Cache, last in the note.';
/** The cache fence is never closed. */
export const OPEN_BLOCK_WORDS = 'The json block of this note is never closed. Add a line with three backticks after it, under # Cache.';

/**
 * The words for a refusal of the json-fence reader (extractPhraseJsonBlock / readXNote): a plain sentence for the three fence refusals, `message` itself for everything else (a cache that is not valid json, a kind that is not this note's).
 * No frontmatter and no json block read as "no Score yet"; the sentence never counts fences.
 */
export function cacheWords(message: string): string {
  if (/^The note has text after the json block/.test(message)) return TWO_BLOCKS_WORDS;
  if (/^The json block is not closed/.test(message)) return OPEN_BLOCK_WORDS;
  if (/^The note has no frontmatter/.test(message) || /no json block found/.test(message)) return NO_SCORE_YET;
  return message;
}
