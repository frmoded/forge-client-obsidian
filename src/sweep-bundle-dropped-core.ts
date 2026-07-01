// v0.2.236 — Pure-core classification for the sweepBundleDroppedFiles
// pass in welcome.ts. Drain 2026-07-02-2000 surfaced a driver report
// that 10 files persisted in the driver's forge-music/blues/ after
// v0.8.0's rename, despite the sweep running unconditionally on
// startup. Extracting the set-diff into a testable pure-core gives us:
//
// 1. A place to write a failing test that pins the exact scenario
//    (extracted has blues/*, bundled has slow_burn/* → sweep must
//    trash blues/*).
// 2. A safety net: if the bundle walk returned an empty set (dev
//    mode / corrupt install / adapter.list race), refuse to sweep.
//    Without this, an empty bundle set would classify EVERY
//    extracted file as "not in bundle" and trash the whole library.
//
// The wrapper in welcome.ts wires this to adapter.list + vault.trash.

export interface SweepDecision {
  /** Extracted files whose relPath is not present in the bundle set —
   *  these are the drops that need to be trashed. Sorted for
   *  deterministic notices. */
  toTrash: string[];
  /** Sentinel: when true, the sweep should abort without trashing
   *  anything (empty bundle set + non-empty extracted set — refusing
   *  to catastrophically wipe the extracted library). */
  bailUnsafeEmptyBundle: boolean;
}

/** Compute which extracted files are absent from the bundle set +
 *  therefore should be trashed. Pure; no I/O.
 *
 *  Safety net: when the bundle set is empty AND the extracted set is
 *  non-empty, return `bailUnsafeEmptyBundle: true` with an empty
 *  `toTrash`. This guards against the case where `adapter.list` on the
 *  bundle root silently returned no files (dev-mode symlink race /
 *  half-loaded plugin assets / rare Obsidian adapter bug) — without
 *  this net, the sweep would classify EVERY extracted file as
 *  "not in bundle" and trash the whole library.
 *
 *  The empty-extracted case is fine (no-op naturally). The
 *  empty-bundle + non-empty-extracted case is the dangerous asymmetry
 *  worth calling out. */
export function computeSweepTrashList(
  bundledFiles: Set<string>,
  extractedFiles: Set<string>,
): SweepDecision {
  if (bundledFiles.size === 0 && extractedFiles.size > 0) {
    return { toTrash: [], bailUnsafeEmptyBundle: true };
  }
  const toTrash: string[] = [];
  for (const relPath of extractedFiles) {
    if (!bundledFiles.has(relPath)) {
      toTrash.push(relPath);
    }
  }
  toTrash.sort();
  return { toTrash, bailUnsafeEmptyBundle: false };
}
