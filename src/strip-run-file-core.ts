// src/strip-run-file-core.ts
//
// Drain 2026-08-25-1030 — which file the Inputs strip's Run should
// actually run.
//
// THE BUG. The strip host's `run` callback receives a snippetId and
// re-derives a TFile from it (`<id>.md` from the vault root). But that
// id came from `snippetIdFromPath`, which for a note in a NON-LIBRARY
// subfolder — any folder without a `forge.toml`, i.e. any folder a
// cohort member makes — keeps only the BASENAME. The round trip is not
// inverse. The lookup misses, `fallbackFile` goes undefined, and
// `runSnippet` re-queries a workspace whose active leaf is the panel
// the user just clicked in. Result: "No active note to run."
//
// Library-subdir notes keep a fully qualified id and round-trip fine,
// which is exactly why CCQA's check 2 (mood / factorial / simulation)
// was green while the driver's smoke vault failed.
//
// THE SHAPE, fourth instance. The run callback's own comment names
// three prior ones (v0.2.288's auto-forge roundtrip, drain 1600's
// dropped facet argument, drain 1610's re-query) and states the
// lesson: USE WHAT YOU WERE HANDED. It then hands itself an id and
// re-derives a file. A value reconstructed from a lossy projection of
// itself is not the value.
//
// NO OBSIDIAN IMPORTS (pure-core convention).

/** Minimal shape of a vault file. */
export interface FilePathLike {
  path: string;
}

/**
 * Pick the file the strip's Run should target.
 *
 * `boundFile` is the file the strip captured when it BOUND to the note
 * — the authoritative answer, because it never went through the id
 * projection. It is used when it is still the file the strip is
 * dispatching for.
 *
 * The id lookup remains as the fallback for two real cases: no binding
 * yet (a run dispatched before any bind, e.g. straight after a
 * reload), and a binding that has drifted from the id being
 * dispatched. A stale pointer must never win over an explicit id.
 *
 * `resolveById` mirrors `fileForSnippetId`: `<id>.md` from the vault
 * root, or null.
 */
export function resolveStripRunFile<F extends FilePathLike>(
  snippetId: string,
  boundFile: F | null | undefined,
  resolveById: (path: string) => F | null,
): F | null {
  const byId = resolveById(`${snippetId}.md`);
  if (byId) return byId;
  // The id did not resolve — either the note is in an ordinary
  // subfolder (the incident) or it moved. The binding is what we
  // actually observed, so prefer it over failing.
  if (boundFile && stripsToSameNote(boundFile.path, snippetId)) return boundFile;
  return null;
}

/** Is `path` plausibly the note this snippetId names? Guards against
 *  running a stale binding for an unrelated note: the id is either the
 *  full vault-relative path (library subdir) or the bare basename
 *  (everything else), so one of those must match. */
function stripsToSameNote(path: string, snippetId: string): boolean {
  const withoutExt = path.replace(/\.md$/i, '');
  if (withoutExt === snippetId) return true;
  return withoutExt.slice(withoutExt.lastIndexOf('/') + 1) === snippetId;
}
