// drain 2026-10-22-2100 — a way back from a phrase's JSON to its Score. The driver's M5 smoke (D6): "Once I switch the phrase to JSON, can not view it as a score" — the only way was Cmd+P,
// "Open phrase as Score", and nothing on screen said so. Obsidian's `MarkdownView` has `addAction` (the Beat Box already puts its mode buttons on a markdown tab's header that way), so while a
// phrase note is shown as text in a score-first vault the tab's header carries "Open as Score" (the Beat Box's own label), and it goes away when the tab shows anything else.
//
// Pure (the markdown views are injected): which note gets it, and the add / remove / re-add bookkeeping for views Obsidian REUSES when a tab navigates. The Obsidian half is in score-first.ts.
import { isPhrasePath } from './phrase-core.ts';

export const PHRASE_HEADER_TITLE = 'Open as Score';
export const PHRASE_HEADER_ICON = 'list-music';

/** Only a phrase note, only in a score-first vault. */
export function wantsPhraseHeader(scoreFirst: boolean, path: string | null | undefined): boolean {
  return scoreFirst === true && isPhrasePath(path);
}

/** The rhythm note buttons ("Open as Beat Box" / "Open as Score") on a markdown tab: they apply to a candidate note EXCEPT a phrase in a score-first vault, where they would refuse (a phrase is not
 *  rhythm data) and "Open as Score" would be there twice. Everywhere else the answer is the candidate answer, unchanged. */
export function rhythmHeaderApplies(isCandidate: boolean, scoreFirst: boolean, path: string | null | undefined): boolean {
  return isCandidate && !wantsPhraseHeader(scoreFirst, path);
}

export interface HeaderView {
  file: { path: string } | null | undefined;
  addAction(icon: string, title: string, callback: () => void): HTMLElement;
}

export interface PhraseHeaderDeps<V extends HeaderView> {
  /** The vault's profile answer, asked live on every sync. */
  isScoreFirst(): boolean;
  /** The button was clicked on `view`, showing `path`: switch that tab to the phrase's Score. */
  open(view: V, path: string): void;
}

export function createPhraseHeaderSync<V extends HeaderView>(deps: PhraseHeaderDeps<V>): { sync(views: Iterable<V>): void } {
  const have = new WeakMap<object, HTMLElement[]>();
  return {
    sync(views) {
      const scoreFirst = deps.isScoreFirst();
      for (const view of views) {
        const path = view.file?.path ?? null;
        const want = wantsPhraseHeader(scoreFirst, path);
        const els = have.get(view);
        if (want && !els) {
          have.set(view, [view.addAction(PHRASE_HEADER_ICON, PHRASE_HEADER_TITLE, () => { const p = view.file?.path; if (p && wantsPhraseHeader(deps.isScoreFirst(), p)) deps.open(view, p); })]);
        } else if (!want && els) {
          els.forEach((el) => el.remove());
          have.delete(view);
        }
      }
    },
  };
}

// ---- drain 2026-10-22-2105 — "Open phrase as Score" (the palette command) must act on the tab that SHOWS the phrase -----------------------------------------------------------------------
// The driver, in the real Obsidian: the phrase opened from the explorer as text, and the command did not bring the Score back. `openPhraseHere` took `workspace.getLeaf(false)`, "an existing leaf
// which can be navigated" — Obsidian's choice, not necessarily the tab that shows the note (the Beat Box's own commands, which work, take the ACTIVE MARKDOWN VIEW's leaf). This is that rule, pure.

export interface LeafCandidate<L> { path: string | null | undefined; leaf: L }

export interface PhraseTargetInput<L> {
  scoreFirst: boolean;
  /** The active markdown view (`getActiveViewOfType(MarkdownView)`) with the note it shows, or null when the focus is in something else (the explorer, a sidebar panel). */
  activeMarkdown: LeafCandidate<L> | null;
  /** Every markdown tab and the note it shows. */
  markdownLeaves: ReadonlyArray<LeafCandidate<L>>;
  /** `getActiveFile()`. */
  activePath: string | null | undefined;
}

/** Which phrase, and which tab to switch to its Score — or null (the command is not offered). The phrase is the one the person is looking at (the active markdown view's note, else the active file);
 *  the tab is the one showing it (the active markdown view's own leaf, else any markdown tab on that note), and `null` (the caller then asks Obsidian's `getLeaf(false)`, only when it runs) when no tab does. */
export function choosePhraseTarget<L>(input: PhraseTargetInput<L>): { path: string; leaf: L | null } | null {
  if (input.scoreFirst !== true) return null;
  const fromView = input.activeMarkdown && isPhrasePath(input.activeMarkdown.path) ? input.activeMarkdown : null;
  const path = fromView ? (fromView.path as string) : isPhrasePath(input.activePath) && !input.activeMarkdown ? (input.activePath as string) : null;
  if (path === null) return null;
  if (fromView) return { path, leaf: fromView.leaf };
  const showing = input.markdownLeaves.find((c) => c.path === path);
  return { path, leaf: showing ? showing.leaf : null };   // null: no tab shows it — the caller asks Obsidian for a leaf (`getLeaf(false)`) ONLY when it runs: that call can CREATE a leaf, so it must never happen while the palette merely asks "is this offered?"
}
