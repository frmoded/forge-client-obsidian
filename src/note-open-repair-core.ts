// 2026-11-19-0990 - a note with NO json cache fence, opened as a Score: it is valid and empty, and when its Description already says something its cache is COMPUTED from that, by the same writers every control uses. Pure: strings
// in, strings out; no obsidian import. The tab's open calls it through one atomic `process` (the same text = nothing written: a note that has its fence is never touched by an open).
//
// The Description (the list: what the person sees) is the only source (2026-11-26-1047: a Recipe is generated and never read back); a note whose Description says nothing readable only gets its empty cache. Two json fences, a note with
// no frontmatter and a note whose source cannot be read are left exactly as they are (the Score says so in plain words: cache-fence-core.ts); nothing is guessed.
import type { GrammarVault } from './phrase-grammar-core.ts';
import { hasNoCacheFence, withCacheFence } from './cache-fence-core.ts';
import { extractDescription } from './v2-note-core.ts';
import { parseList, replayGrammar } from './sentence-list-core.ts';
import { writeListNote } from './sentence-list-note-core.ts';
import { listModel } from './list-model-selected.ts';
import type { Family } from './note-family-core.ts';

/** The text a note should have once it is opened as a Score: `text` itself when there is nothing to repair. */
export function repairForOpen(text: string, name: string, family: Family, vault: GrammarVault): string {
  if (!hasNoCacheFence(text)) return text;
  const withFence = withCacheFence(text);
  const listed = parseList(extractDescription(withFence), family, vault);
  if (listed.list.length > 0) {
    const rp = replayGrammar(listed.list, family, { vault });
    if (rp.params !== null) { const w = writeListNote(withFence, name, family, rp); if (w.ok) return listModel.groups.carry(w.text, family); }          // 2026-11-27-1050: the prompt stack goes with the list
  }
  return withFence;
}
