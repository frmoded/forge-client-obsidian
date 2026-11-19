// 2026-11-16-1000 - the two things the Score's selection menu needs from the PLUGIN (not from the tab): append a sentence to the note's list, and make a new phrase note. The phrase tab is mounted by `mountPhrase`
// with plain ports; these two live in score-first.ts (the description controller and the new-phrase flow), so score-first registers them HERE once and the tab asks. A tab with no host (a test, a lean edition) simply has no menu
// actions that need one: the menu says so in its own line. Pure: no obsidian, no DOM.
import type { NewPhraseResult, TransformPhrase } from './phrase-core.ts';

export interface BarSelectionHost {
  /** 2026-11-19-0980: APPEND `sentence` as the next line of the note's list at `path` (one write, undoable with Cmd/Ctrl+Z). `message` says what was added, or why not, in words. (It was `previewDescription`: the sentence shown in the prompt box, applied by Apply.) */
  appendLine(path: string, sentence: string): Promise<{ ok: boolean; message: string }>;
  /** 2026-11-19-0992 (Duplicate), widened by 2026-11-19-0992a: is the NEXT click on a bar of the Score of the note at `path` a link click (its PHRASE composer has ANY text, trimmed)? Asked at the click. An empty composer, any other composer and an absent method = never (the click pins). */
  duplicateArmed?(path: string): boolean;
  /** 2026-11-19-0992: the copy click: `noteId` is the lineage id of the note that made the bar (`bars/bar_007`; null = the Score could not tell). With the composer saying "Duplicate" (or ending with the word) it gets ` [[bar_007]].` appended, focus, and the usual preview (0992); with any other text (0992a) the link ` [[bar_007]]` goes in at the caret, focus, no preview. `message` says what was done, or why not. */
  duplicateClick?(path: string, noteId: string | null): Promise<{ ok: boolean; message: string }>;
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
