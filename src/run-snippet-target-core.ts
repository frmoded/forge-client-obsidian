// v0.2.288 — pure-core for `runSnippet`'s target-file resolution.
//
// Bug this closes (CW-2300-C smoke, 2026-07-09): the Description-
// canonical auto-forge flow captures `view` at forgeSnippet's start,
// spends seconds in the /generate LLM call, then calls runSnippet.
// runSnippet re-queried the workspace via `getActiveViewOfType`. If
// focus moved during the LLM roundtrip — modal, panel focus, another
// pane — the re-query returned null and the run stage silently
// emitted "No active note to run." Cohort saw the Recipe + Python
// written correctly but no score/output.
//
// Fix pattern: caller passes the file it captured; runSnippet uses
// the ACTIVE view if it's still the same file, else falls back to the
// caller's file. Pure-core here just picks the file — main.ts still
// handles the view-specific side effects (editor.save(), fresh-buffer
// read) when the view is present.
//
// Test coverage: five cases below.

/** Minimal shape the resolver needs from a MarkdownView-with-file. */
export interface ViewLike {
  file: { path: string };
}

/** Minimal shape for a TFile (the caller's fallback). */
export interface FileLike {
  path: string;
}

/** The decision runSnippet needs: which file to run, and whether to
 *  use the active view's editor context for pre-run save/read. */
export interface RunTarget<V extends ViewLike, F extends FileLike> {
  /** The file whose Python `compute()` we'll run. Null → surface
   *  "No active note to run." notice. */
  file: F | V['file'] | null;
  /** The active view if we can safely use its editor buffer (view is
   *  attached AND its file matches the file we're running). Null when
   *  we must read the file straight from disk (fallback path). */
  view: V | null;
}

/** Resolve the runSnippet target from the active workspace view + an
 *  optional caller-supplied fallback file.
 *
 *  Priority:
 *  1. Active view exists AND has a file → use view (editor-buffer path).
 *  2. Active view exists AND matches the fallback file's path → use view.
 *  3. Fallback file supplied → use it, view=null (disk-read path).
 *  4. Neither → file=null, view=null (caller shows error).
 *
 *  The second case matters when Obsidian re-attached the leaf but the
 *  same file is still open — the view is valid and its editor buffer
 *  is the freshest content.
 */
export function resolveRunTarget<
  V extends ViewLike,
  F extends FileLike,
>(
  activeView: V | null | undefined,
  fallbackFile: F | null | undefined,
): RunTarget<V, F> {
  const view = activeView ?? null;
  const fallback = fallbackFile ?? null;

  if (view && view.file) {
    return { file: view.file, view };
  }
  if (fallback) {
    return { file: fallback, view: null };
  }
  return { file: null, view: null };
}
