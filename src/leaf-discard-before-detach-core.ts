// Pure-core sequence: for a list of MarkdownView-bearing leaves,
// discard each view's buffer THEN detach the leaf.
//
// Born from the v0.2.221 → v0.2.223 re-extract command race. When
// `trashForensicShadow` was called on a file that had an open editor
// tab with unsaved (or recently-saved-still-dirty-in-Obsidian-tracking)
// content, Obsidian's leaf.detach() — async — would let the view's
// teardown flush the buffer back to disk AFTER the re-extract had
// already overwritten with bundle content. Driver smoke showed the
// marker text survive verbatim.
//
// The fix: clear the buffer's dirty flag BEFORE detach. setViewData's
// `clear=true` argument resets the view's modified state so detach
// has nothing to write back.
//
// This file owns the sequence so a `node --test` can lock the ORDER
// (discard before detach, not detach before discard). The main.ts
// caller passes adapters that wrap Obsidian's APIs.

/** Structural view interface — captures the two methods the discard
 *  sequence touches. The real MarkdownView is a superset. */
export interface DiscardableView {
  setViewData(data: string, clear: boolean): void;
}

/** Structural leaf interface — captures detach(). */
export interface DetachableLeaf {
  detach(): void;
}

/** One leaf paired with the view rendered inside it. */
export interface LeafViewPair {
  leaf: DetachableLeaf;
  view: DiscardableView;
}

/** Sink for failures. Lets tests assert errors are surfaced
 *  individually rather than swallowed. */
export type Logger = (message: string, error: unknown) => void;

/** Discard every view's buffer (so detach has nothing to flush),
 *  THEN detach every leaf. Order matters: if any leaf detaches
 *  before its view's buffer is cleared, the teardown can still
 *  write stale bytes to disk.
 *
 *  Both phases tolerate per-pair failures via the logger sink —
 *  one broken view shouldn't strand the others. */
export function discardThenDetach(
  pairs: ReadonlyArray<LeafViewPair>,
  log: Logger,
): void {
  for (const { view } of pairs) {
    try {
      view.setViewData('', true);
    } catch (e) {
      log('discardThenDetach: setViewData failed', e);
    }
  }
  for (const { leaf } of pairs) {
    try {
      leaf.detach();
    } catch (e) {
      log('discardThenDetach: leaf.detach failed', e);
    }
  }
}
