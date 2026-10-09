// Beat-as-data Phase 5c (drain 2026-10-07-0100) — the Beat Box as the DEFAULT view of a rhythm data note.
//
// Pure core, every Obsidian touch injected (like rhythm-autosave-core.ts). What lives here:
//   * decideDefaultView   an ALLOW-LIST predicate: swap a leaf to the Beat Box (or, Phase 6, to the Score the user chose) only when every
//                         condition is positively met.
//   * ModeMarks (rhythm-mode-core.ts)  "Open as JSON" / "Open as Score" must stick: a per-leaf mark (scoped to that leaf + that file).
//   * createDefaultViewController  evaluate(leaf): marks + the awaited body read + a re-entrancy guard around the swap. The swap itself
//                         fires layout-change / file-open events that call evaluate() again; the guard makes those a no-op, so there is
//                         no loop and no flicker.
//
// The view layer (rhythm-edit-view.ts) supplies `describe` (reads the leaf), `readBodyIsRhythm` (reads the note) and `swapToBeatBox`
// (leaf.setViewState). The live event order is the one thing this cannot prove — see the drain's FEEDBACK.

/** Where a leaf lives. Only 'main' (the main area) and 'sidebar' (document leaves in the sidebars) are normal workspace leaves;
 *  everything else — hover previews, pop-out windows, canvas cards — is 'other' and never swapped. */
import { ModeMarks, defaultTarget, type EditionId, type ModeMark } from './rhythm-mode-core.ts';

export type LeafLocation = 'main' | 'sidebar' | 'other';

export interface LeafInfo {
  location: LeafLocation;
  /** `leaf.view.getViewType()` */
  viewType: string;
  /** `leaf.view instanceof MarkdownView` (a deferred / diff / other view is false) */
  isPlainMarkdownView: boolean;
  filePath: string | null;
  extension: string | null;
  /** `type: data` + `content_type: json` frontmatter (the Phase 5 predicate `isRhythmEditCandidate`) */
  frontmatterIsCandidate: boolean;
}

export type SwapTarget = 'beatbox' | 'score';

export interface DefaultViewInput extends LeafInfo {
  settingOn: boolean;
  edition: EditionId;
  /** Does the note's body validate as editable rhythm data? `null` = not read yet. */
  bodyIsRhythm: boolean | null;
  /** The mark that applies to this leaf + file (already reconciled): "stay in JSON", "stay in Score", or none. */
  mark: ModeMark | null;
  swapInProgress: boolean;
}

export type DefaultViewReason =
  | 'swap'
  | 'need-body'
  | 'setting-off'
  | 'swap-in-progress'
  | 'not-allowed-location'
  | 'not-markdown-view'
  | 'no-file'
  | 'not-candidate'
  | 'prefer-markdown'
  | 'invalid-rhythm'
  | 'stale'
  | 'swap-failed';

export interface DefaultViewDecision { swap: boolean; reason: DefaultViewReason; target?: SwapTarget }

const ALLOWED_LOCATIONS: readonly string[] = ['main', 'sidebar'];

export function decideDefaultView(i: DefaultViewInput): DefaultViewDecision {
  const no = (reason: DefaultViewReason): DefaultViewDecision => ({ swap: false, reason });
  if (!i.settingOn) return no('setting-off');
  if (i.swapInProgress) return no('swap-in-progress');
  if (!ALLOWED_LOCATIONS.includes(i.location)) return no('not-allowed-location');
  if (i.viewType !== 'markdown' || !i.isPlainMarkdownView) return no('not-markdown-view');
  if (!i.filePath || i.extension !== 'md') return no('no-file');
  if (!i.frontmatterIsCandidate) return no('not-candidate');
  const target = defaultTarget(i.mark, i.edition);
  if (target === null) return no('prefer-markdown');
  if (i.bodyIsRhythm === null) return no('need-body');
  if (i.bodyIsRhythm === false) return no('invalid-rhythm');
  return { swap: true, reason: 'swap', target };
}

export interface DefaultViewDeps<K extends object> {
  settingOn(): boolean;
  edition: EditionId;
  /** Describe what the leaf currently shows, or null if it is gone / not describable. Synchronous and cheap. */
  describe(leaf: K): LeafInfo | null;
  /** Read the note and say whether its body is editable rhythm data. Only called after every cheap check passed. */
  readBodyIsRhythm(leaf: K, path: string): Promise<boolean>;
  /** `leaf.setViewState(...)` to the Beat Box or the Score, in the SAME leaf. NOTE: Obsidian's setViewState silently returns (no error) when
   *  the leaf is already inside another setViewState, so a call can be dropped — hence isSwapped + the retry below. */
  swapTo(leaf: K, path: string, target: SwapTarget): Promise<void>;
  /** Is the leaf now showing `target`? */
  isSwapped(leaf: K, target: SwapTarget): boolean;
  sleep(ms: number): Promise<void>;
}

/** Waits between swap attempts: one try, then three retries with growing delays (a leaf that is busy is busy for milliseconds). */
export const SWAP_RETRY_DELAYS_MS: readonly number[] = [60, 180, 500];

export interface DefaultViewController<K extends object> {
  evaluate(leaf: K): Promise<DefaultViewReason>;
  /** An explicit mode choice for this leaf + file: JSON → 'markdown', Score → 'score', Beat Box → null (clears). */
  setMark(leaf: K, path: string, mark: ModeMark | null): void;
}

export function createDefaultViewController<K extends object>(deps: DefaultViewDeps<K>): DefaultViewController<K> {
  const marks = new ModeMarks<K>();
  const swapping = new WeakSet<K>();

  async function evaluate(leaf: K): Promise<DefaultViewReason> {
    const info = deps.describe(leaf);
    if (!info) return 'not-markdown-view';
    const input = (bodyIsRhythm: boolean | null, current: LeafInfo): DefaultViewInput => ({
      ...current,
      settingOn: deps.settingOn(),
      edition: deps.edition,
      bodyIsRhythm,
      mark: marks.reconcile(leaf, current.filePath),
      swapInProgress: swapping.has(leaf),
    });
    const first = decideDefaultView(input(null, info));
    if (first.reason !== 'need-body') return first.reason;

    const path = info.filePath as string;
    const bodyIsRhythm = await deps.readBodyIsRhythm(leaf, path);
    // The leaf may have navigated (or been swapped by a concurrent pass) while the note was being read: decide again on what it shows NOW.
    const now = deps.describe(leaf);
    if (!now || now.filePath !== path) return 'stale';
    const second = decideDefaultView(input(bodyIsRhythm, now));
    if (!second.swap) return second.reason;

    const target = second.target as SwapTarget;
    swapping.add(leaf);
    try {
      await deps.swapTo(leaf, path, target);
      for (const delay of SWAP_RETRY_DELAYS_MS) {
        if (deps.isSwapped(leaf, target)) return 'swap';
        await deps.sleep(delay);
        const again = deps.describe(leaf);                        // still the same plain markdown view of the same note?
        if (!again || !again.isPlainMarkdownView || again.filePath !== path) return deps.isSwapped(leaf, target) ? 'swap' : 'stale';
        await deps.swapTo(leaf, path, target);
      }
      return deps.isSwapped(leaf, target) ? 'swap' : 'swap-failed';
    } finally {
      swapping.delete(leaf);
    }
  }

  return {
    evaluate,
    setMark: (leaf, path, mark) => { if (mark === null) marks.clear(leaf); else marks.set(leaf, path, mark); },
  };
}
