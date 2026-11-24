// 2026-11-16-1000 - the two things the Score's selection menu needs from the PLUGIN (not from the tab): append a sentence to the note's list, and make a new phrase note. The phrase tab is mounted by `mountPhrase`
// with plain ports; these two live in score-first.ts (the description controller and the new-phrase flow), so score-first registers them HERE once and the tab asks. A tab with no host (a test, a lean edition) simply has no menu
// actions that need one: the menu says so in its own line. Pure: no obsidian, no DOM.
import type { NewPhraseResult, TransformPhrase } from './phrase-core.ts';
import type { InspectorEntry } from './artifact-inspector-core.ts';
import { pinnedNoteFor } from './linked-panes-core.ts';

export interface BarSelectionHost {
  /** 2026-11-19-0980: APPEND `sentence` as the next line of the note's list at `path` (one write, undoable with Cmd/Ctrl+Z). `message` says what was added, or why not, in words. (It was `previewDescription`: the sentence shown in the prompt box, applied by Apply.) */
  appendLine(path: string, sentence: string): Promise<{ ok: boolean; message: string }>;
  /** 2026-11-19-0992 (Duplicate), widened by 2026-11-19-0992a: is the NEXT click on a bar of the Score of the note at `path` a link click (its PHRASE composer has ANY text, trimmed)? Asked at the click. An empty composer, any other composer and an absent method = never (the click pins). */
  duplicateArmed?(path: string): boolean;
  /** 2026-11-24-1034 (R2): is the PHRASE composer of the note at `path` open and EMPTY? Then a plain click on a bar writes `bar K` AND still pins the bar. An absent method = the empty click only pins (as before). */
  duplicateEmpty?(path: string): boolean;
  /** 2026-11-24-1034: the click now writes the bar's POSITION in any phrase text (and in an empty composer: `duplicateEmpty`), the source link only after `replaced by`/`Take`/a head (`barClickText`, duplicate-sentence-core.ts); the older words below say what 0992, 0992a and 0996b did.
   *  The click on a bar while the phrase composer has text (0992, 0992a, 0996b): `noteId` is the lineage id of the note that made the bar (`bars/bar_007`; null = the Score could not tell), `bar` the bar's NUMBER in the Score now (1-based; null = the Score could not tell).
   *  2026-11-19-0996b: when the composer's text STARTS with a bar word (Duplicate, Copy, Move, Delete, Remove, Keep, Morph, Mix, Extend) the click inserts ` bar 3` (then ` and bar 5`) at the caret, focus back, no preview, no pin, no note needed; with any other text (0992a) the link ` [[bar_007]]` goes in at the caret, focus back, no preview.
   *  (The 0992 click that appended ` [[bar_007]].` and previewed the note copy is gone: the note copy is the typed `Duplicate [[bar_007]].`.) `message` says what was done, or why not. */
  duplicateClick?(path: string, noteId: string | null, bar?: number | null): Promise<{ ok: boolean; message: string }>;
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

/** 2026-11-23-1023 (Part B): the LINK CLICK of an arrangement's or a composition's Score. While the composer of this note holds text (asked of the host at the click), the next plain click on a bar does not pin it (and the notes pane does not follow): it writes the
 *  link of the note the bar comes from at the caret. For a composition that is the note its SECTION plays: the IMMEDIATE child the Description names (a nested composition or arrangement gives itself, never a note deeper down); for an arrangement the phrase of the track. */
export const linkClickPort = (path: () => string | null | undefined): { armed(): boolean; onBar(entry: InspectorEntry): void } => ({
  armed: () => { const p = path(); return p !== null && p !== undefined && barSelectionHost()?.duplicateArmed?.(p) === true; },
  onBar: (e) => { const p = path(); const pin = pinnedNoteFor(e.prov); if (p) void barSelectionHost()?.duplicateClick?.(p, pin ? pin.noteId : null, null); },
});
