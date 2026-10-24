// 2026-10-23-0630 — a phrase note opens as its Score by default in a score-first vault. The sibling of the Beat Box's default-view controller (rhythm-default-view-core.ts), kept apart because the
// rules differ: only phrase notes, only a score-first vault, and a tab restored with the layout keeps its text. Pure: every Obsidian touch (the leaf's view, the swap, the clock) is injected.
//
// The person's choices are marks on a leaf, scoped to the file it shows ("Open as JSON" => markdown, until that leaf navigates to another file). The swap itself is a navigation the person did not
// ask for, so it must never loop: a swapped leaf is no longer a markdown view, and a swap in progress is not entered twice.
import { isPhrasePath } from './phrase-core.ts';

export type PhraseLeafLocation = 'main' | 'sidebar' | 'other';

export interface PhraseLeafInfo {
  location: PhraseLeafLocation;
  /** The leaf shows a plain markdown view (not a Score, not a canvas card, not a reading-mode embed). */
  isPlainMarkdownView: boolean;
  filePath: string | null;
}

export interface PhraseRouteInput {
  scoreFirst: boolean;
  swapInProgress: boolean;
  location: PhraseLeafLocation;
  isPlainMarkdownView: boolean;
  filePath: string | null;
  /** The person's choice for THIS leaf and THIS file ('markdown' = Open as JSON), or null. */
  mark: 'markdown' | null;
  /** The file this leaf showed when the router was registered (a tab restored with the layout), if it still shows it. */
  restoredPath: string | null;
}

export type PhraseRouteReason =
  | 'score' | 'not-score-first' | 'swap-in-progress' | 'not-allowed-location' | 'not-markdown-view' | 'no-file' | 'not-a-phrase' | 'chosen-json' | 'layout-restore';

export function decidePhraseRoute(i: PhraseRouteInput): { swap: boolean; reason: PhraseRouteReason } {
  const no = (reason: PhraseRouteReason) => ({ swap: false, reason });
  if (!i.scoreFirst) return no('not-score-first');
  if (i.swapInProgress) return no('swap-in-progress');
  if (i.location === 'other') return no('not-allowed-location');
  if (!i.isPlainMarkdownView) return no('not-markdown-view');
  if (i.filePath === null) return no('no-file');
  if (!isPhrasePath(i.filePath)) return no('not-a-phrase');
  if (i.mark === 'markdown') return no('chosen-json');
  if (i.restoredPath === i.filePath) return no('layout-restore');
  return { swap: true, reason: 'score' };
}

export const PHRASE_SWAP_RETRY_DELAYS_MS = [60, 180, 500];

export interface PhraseRouterPorts<L> {
  scoreFirst(): boolean;
  /** What the leaf shows now, or null when it has no view to speak of. */
  describe(leaf: L): PhraseLeafInfo | null;
  /** Switch the leaf to the phrase tab for this path (without making a history entry). May be silently dropped by Obsidian when the leaf is busy. */
  swapTo(leaf: L, path: string): Promise<void>;
  /** The leaf now shows the phrase tab. */
  isSwapped(leaf: L): boolean;
  sleep(ms: number): Promise<void>;
  trace(line: string): void;
  /** 2026-10-24-0900 (one tab per phrase): ANOTHER leaf that already shows this phrase, as its Score or as text (JSON); null when there is none. */
  findOpen(leaf: L, path: string): L | null;
  /** Bring that leaf to the front, focused. */
  focus(leaf: L): void | Promise<void>;
  /** Get the leaf that just opened the phrase out of the way (back to what it showed, or closed if it was a fresh tab). false = it could not be (the only tab of its pane): the caller shows the Score there instead. */
  dismiss(leaf: L): Promise<boolean>;
}

export type PhraseRouteResult = PhraseRouteReason | 'reused' | 'swap-failed' | 'navigated-away';

export interface PhraseRouter<L> {
  evaluate(leaf: L): Promise<PhraseRouteResult>;
  /** The person's choice for this leaf and file; it ends when the leaf shows another file. */
  setMark(leaf: L, path: string, mark: 'markdown' | null): void;
  /** The tabs that existed when the router was registered: they keep showing their text until their leaf navigates. */
  restore(pairs: ReadonlyArray<readonly [L, string]>): void;
}

const JSON_WHY: Partial<Record<PhraseRouteReason, string>> = {
  'chosen-json': 'the person chose Open as JSON',
  'layout-restore': 'a tab restored with the layout',
};

export function createPhraseRouter<L extends object>(ports: PhraseRouterPorts<L>): PhraseRouter<L> {
  const marks = new Map<L, { path: string; mark: 'markdown' }>();
  const restored = new Map<L, string>();
  const swapping = new Set<L>();
  const said = new Map<L, string>();                       // one evidence line per (leaf, outcome, file): events repeat, the line does not

  const say = (leaf: L, key: string, line: string) => {
    if (said.get(leaf) === key) return;
    said.set(leaf, key);
    ports.trace(line);
  };

  return {
    setMark(leaf, path, mark) { if (mark) marks.set(leaf, { path, mark }); else marks.delete(leaf); },
    restore(pairs) { for (const [leaf, path] of pairs) restored.set(leaf, path); },
    async evaluate(leaf) {
      if (!ports.scoreFirst()) return 'not-score-first';
      const info = ports.describe(leaf);
      if (!info) return 'not-markdown-view';
      // a choice and a restore belong to ONE file in ONE leaf: a leaf that shows another file has moved on
      const markNow = marks.get(leaf);
      if (markNow && markNow.path !== info.filePath) marks.delete(leaf);
      const restoredNow = restored.get(leaf);
      if (restoredNow !== undefined && restoredNow !== info.filePath && info.isPlainMarkdownView) restored.delete(leaf);
      const path = info.filePath;
      const d = decidePhraseRoute({
        scoreFirst: true,
        swapInProgress: swapping.has(leaf),
        location: info.location,
        isPlainMarkdownView: info.isPlainMarkdownView,
        filePath: path,
        mark: marks.get(leaf)?.mark ?? null,
        restoredPath: restored.get(leaf) ?? null,
      });
      if (!d.swap) {
        const why = JSON_WHY[d.reason];
        if (why && path) say(leaf, `${d.reason}|${path}`, `[forge-phrase] routed ${path} -> json (${why})`);
        return d.reason;
      }
      const target = path as string;
      swapping.add(leaf);
      try {
        // one tab per phrase: a phrase that is already open somewhere is focused THERE, and this leaf (which just opened it as text) gives way. If it cannot give way, it shows the Score as before.
        const holder = ports.findOpen(leaf, target);
        if (holder !== null) {
          let gaveWay = false;
          try { gaveWay = await ports.dismiss(leaf); } catch { gaveWay = false; }    // first: a leaf that cannot give way must not have moved the focus
          if (gaveWay) {
            try { await ports.focus(holder); } catch { /* the tab is gone from here either way; the evidence line still says what happened */ }
            said.delete(leaf);
            ports.trace(`[forge-phrase] reused ${target} (focused existing tab)`);
            return 'reused';
          }
        }
        await ports.swapTo(leaf, target);
        for (const delay of PHRASE_SWAP_RETRY_DELAYS_MS) {
          if (ports.isSwapped(leaf)) break;
          await ports.sleep(delay);
          if (ports.isSwapped(leaf)) break;
          const again = ports.describe(leaf);
          if (!again || !again.isPlainMarkdownView || again.filePath !== target || marks.has(leaf)) return 'navigated-away';   // the person moved on: do not drag the tab back
          await ports.swapTo(leaf, target);
        }
        if (!ports.isSwapped(leaf)) {
          ports.trace(`[forge-phrase] could not route ${target} -> score (the tab did not switch)`);
          return 'swap-failed';
        }
        said.delete(leaf);
        ports.trace(`[forge-phrase] routed ${target} -> score (a new open in a score-first vault)`);
        return 'score';
      } finally {
        swapping.delete(leaf);
      }
    },
  };
}
