// 2026-11-19-0990 - a note with NO json cache fence, opened as a Score: it is valid and empty, and when it already says something (a Description list, or a Recipe) its cache is COMPUTED from that, by the same writers every control uses. Pure: strings
// in, strings out; no obsidian import. The tab's open calls it through one atomic `process` (the same text = nothing written: a note that has its fence is never touched by an open).
//
// The order of the sources is the note's own: a readable Description list (the list is the source: what the person sees) wins, else a readable Recipe; a note that says nothing readable only gets its empty cache. Two json fences, a note with
// no frontmatter and a note whose source cannot be read are left exactly as they are (the Score says so in plain words: cache-fence-core.ts); nothing is guessed.
import type { GrammarVault } from './phrase-grammar-core.ts';
import { hasNoCacheFence, withCacheFence } from './cache-fence-core.ts';
import { extractDescription, extractRecipeSection } from './v2-note-core.ts';
import { linesOfParams, parseList, replayGrammar } from './sentence-list-core.ts';
import { writeListNote } from './sentence-list-note-core.ts';
import { parseRecipe } from './recipe-grammar-core.ts';
import { wrongKindSentence, type Family } from './note-family-core.ts';
import { asRecipeSourced } from './phrase-notes-core.ts';

/** The text a note should have once it is opened as a Score: `text` itself when there is nothing to repair. */
export function repairForOpen(text: string, name: string, family: Family, vault: GrammarVault): string {
  if (!hasNoCacheFence(text)) return text;
  const withFence = withCacheFence(text);
  const listed = parseList(extractDescription(withFence), family, vault);
  if (listed.list.length > 0) {
    const rp = replayGrammar(listed.list, family, { vault });
    if (rp.params !== null) { const w = writeListNote(withFence, name, family, rp); if (w.ok) return w.text; }
  }
  const recipe = extractRecipeSection(withFence) ?? '';
  if (recipe.trim() !== '') {
    const res = parseRecipe(recipe, vault);
    if (res.ok && wrongKindSentence(family, res.params.kind, 'the Recipe') === null) {
      const w = writeListNote(withFence, name, family, { params: res.params, list: linesOfParams(res.params, family) });
      if (w.ok) return asRecipeSourced(w.text);
    }
  }
  return withFence;
}
