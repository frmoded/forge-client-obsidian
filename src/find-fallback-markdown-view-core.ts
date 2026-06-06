// v0.2.69 — pure-core fallback resolver for "which markdown view
// should chip click target?" Bug 2 from the v0.2.68 forge-music
// install round-trip: lastMarkdownView was assigned only inside the
// file-open event handler. Path A install workflow (Obsidian restoring
// last workspace state with a file already open) means file-open for
// that file fired BEFORE ChipsView.registerEvent ran, so
// lastMarkdownView stayed null. User clicks chip without ever
// switching files, fallback returns null, guard Notice fires, no
// insertion lands.
//
// This helper walks an explicit fallback chain:
//   1. Live active markdown view (if any has a file).
//   2. Tracked lastSeenView (snapshot at view-open + file-open).
//   3. Most-recent markdown leaf (Obsidian's getMostRecentLeaf).
//   4. First markdown leaf with a file (last-resort iteration).
//   5. null — caller surfaces the "click into an action snippet
//      first" Notice in this case.
//
// Pure-core extraction No. 27. No `obsidian` import; runs cleanly
// under `node --test`. Structural adapter mirrors Obsidian's narrow
// shape (file?.path-bearing view, leaf with view, workspace finder).

export interface MarkdownViewLike {
  file: { path: string } | null;
}

export interface MarkdownLeafLike {
  view: MarkdownViewLike | null;
}

export interface WorkspaceLeafFinder {
  /** Live active markdown view per Obsidian's
   *  workspace.getActiveViewOfType(MarkdownView). */
  getActiveMarkdownView(): MarkdownViewLike | null;
  /** All markdown leaves per workspace.getLeavesOfType('markdown'). */
  getMarkdownLeaves(): MarkdownLeafLike[];
  /** Most-recent markdown leaf per workspace.getMostRecentLeaf().
   *  Optional — older Obsidian versions don't expose it. */
  getMostRecentLeaf?(): MarkdownLeafLike | null;
}

/** Resolve which markdown view a chip click should target. Walks the
 *  fallback chain documented in the file header. Returns null only
 *  when no markdown leaf has a file.
 *
 *  `lastSeenView` is the chips view's tracked snapshot (assigned in
 *  onOpen + file-open). May be null on first-ever load.
 *
 *  A returned view always has `view.file !== null` — callers can
 *  safely dereference `.file.path` without re-checking.
 *
 *  Pure: no side effects; safe to call repeatedly. */
export function findFallbackMarkdownView(
  finder: WorkspaceLeafFinder,
  lastSeenView: MarkdownViewLike | null,
): MarkdownViewLike | null {
  // 1. Live active view wins when it has a file.
  const live = finder.getActiveMarkdownView();
  if (live?.file) return live;

  // 2. Tracked lastSeenView wins next when it has a file. A snapshot
  //    with `file === null` does NOT win over later leaf iteration —
  //    we'd rather find a stale-but-real markdown leaf than insert
  //    into the void.
  if (lastSeenView?.file) return lastSeenView;

  // 3. Most-recent leaf when Obsidian exposes the helper.
  const recent = finder.getMostRecentLeaf?.();
  if (recent?.view?.file) return recent.view;

  // 4. First markdown leaf with a file (iteration fallback).
  for (const leaf of finder.getMarkdownLeaves()) {
    if (leaf.view?.file) return leaf.view;
  }

  // 5. Nothing usable.
  return null;
}
