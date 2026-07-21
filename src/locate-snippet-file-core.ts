// CW-slot-cache-writer-not-found (2026-07-17): pure-core note locator
// for handleSlotCacheMiss.
//
// Pre-drain, handleSlotCacheMiss located notes by
// `getAbstractFileByPath("${snippetId}.md")` + a fallback to
// `${basename}.md` at vault root. Both lookups treat vault-root as
// the search space. When a note lives at a nested path AND its
// snippetId is the bare basename (which snippetIdFromPath returns
// for non-library subdirs like `experiments/`), neither lookup
// succeeds and the "could not locate" error fires.
//
// This helper adds two locate paths:
//   1. `providedFile` — if the caller already has the TFile in scope
//      (runSnippet -> computeSnippetWithArgs -> handleSlotCacheMiss),
//      use it directly. Zero lookup, always correct.
//   2. Basename walk — scan the vault's markdown files for any file
//      whose basename or full-path ends with `${snippetId}.md`.
//      Handles the wizard-authored nested-path case.
//
// Kept as a TFile-agnostic pure-core so it's unit-testable without
// Obsidian shims. Callers pass `{path, basename}`-shaped objects.

export interface FileLike {
  path: string;
  basename: string;
}

/**
 * CW-slot-cache-panel-treatment: attempt-trace record. Populated
 * as an out-param so the caller can render a diagnostic when the
 * lookup misses. Back-compat: no attempts array → same behavior as
 * pre-drain (return null on miss without recording).
 */
export type LocateStep = 'provided-file' | 'exact-path' | 'basename';

export interface LocateAttempt {
  step: LocateStep;
  /** What was tried (a path, a basename, or a summary of the input). */
  tried: string;
  /** True if this step returned a file; false if it fell through. */
  matched: boolean;
}

/**
 * Locate the file for a given snippetId.
 *
 * Resolution order:
 *   1. `providedFile` if supplied — wins unconditionally.
 *   2. Exact-path match on `${snippetId}.md` (handles qualified
 *      snippetIds from library subdirs).
 *   3. Basename match on `${bareName}.md` where bareName is the last
 *      path segment (handles the wizard-authored nested-path case).
 *
 * Returns the matched file, or null if no file was found.
 *
 * `attempts` (optional, mutable): when supplied, this function
 * appends one LocateAttempt per step actually tried (in order). A
 * provided-file miss (i.e. `providedFile === null`) is NOT appended
 * — step 1 only records when it was eligible. Step 2 always records.
 * Step 3 only records if step 2 missed. This gives the diagnostic
 * surface an accurate trace without cluttering it with non-eligible
 * paths.
 */
export function locateSnippetFile<T extends FileLike>(
  snippetId: string,
  markdownFiles: readonly T[],
  providedFile?: T | null,
  attempts?: LocateAttempt[],
): T | null {
  if (providedFile) {
    attempts?.push({
      step: 'provided-file',
      tried: providedFile.path,
      matched: true,
    });
    return providedFile;
  }
  const withSuffix = `${snippetId}.md`;
  // Step 1: exact-path match. Fast when snippetId is the full vault-
  // relative path (library-subdir qualified case).
  for (const f of markdownFiles) {
    if (f.path === withSuffix) {
      attempts?.push({ step: 'exact-path', tried: withSuffix, matched: true });
      return f;
    }
  }
  attempts?.push({ step: 'exact-path', tried: withSuffix, matched: false });
  // Step 2: basename fallback. When snippetId is a bare name (non-
  // library subdir) but the file lives at a nested path, match by
  // basename. If multiple files share the basename, first-match wins
  // — same tiebreak as Obsidian's own basename-based navigation.
  const bareName = snippetId.split('/').pop() ?? snippetId;
  for (const f of markdownFiles) {
    if (f.basename === bareName) {
      attempts?.push({ step: 'basename', tried: bareName, matched: true });
      return f;
    }
  }
  attempts?.push({ step: 'basename', tried: bareName, matched: false });
  return null;
}
