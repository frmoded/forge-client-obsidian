// 2026-11-16-1000 - the two things the Score's selection menu needs from the PLUGIN (not from the tab): show a sentence in the note's prompt box as a preview, and make a new phrase note. The phrase tab is mounted by `mountPhrase`
// with plain ports; these two live in score-first.ts (the description controller and the new-phrase flow), so score-first registers them HERE once and the tab asks. A tab with no host (a test, a lean edition) simply has no menu
// actions that need one: the menu says so in its own line. Pure: no obsidian, no DOM.
import type { NewPhraseResult, TransformPhrase } from './phrase-core.ts';

export interface BarSelectionHost {
  /** Show `text` in the prompt box of the note at `path` (edited, not applied). false = that note has no prompt box on screen. */
  previewDescription(path: string, text: string): boolean;
  /** Make a new transform phrase note (the next free `phrase_NNN`, no dialog), open it, and start the rename of its title. The flow notifies its own failures. */
  makePhrase(params: TransformPhrase): Promise<NewPhraseResult>;
}
let host: BarSelectionHost | null = null;
/** Register the host; the returned function takes it away again (only if it is still this one). */
export function registerBarSelectionHost(h: BarSelectionHost): () => void {
  host = h;
  return () => { if (host === h) host = null; };
}
export const barSelectionHost = (): BarSelectionHost | null => host;
