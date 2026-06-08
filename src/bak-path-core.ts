// v0.2.82 Item B — pure-core helpers for detecting `.bak.<version>/`
// path segments and computing the dedup key for the file-open Notice.
//
// v0.2.78 made the engine ignore `.bak.<version>/` directories during
// snippet discovery (see snippet_registry.py:_BAK_DIR_PATTERN), but
// Obsidian's file tree still surfaces them. Cohort smoke showed users
// clicking files under `.bak.*` and getting confused. This pure-core
// powers the plugin-side cues (CSS striking through .bak entries in
// the file tree; Notice on first open within each .bak dir).

/** Same pattern as forge.core.snippet_registry's `_BAK_DIR_PATTERN`.
 *  Anchored to ".bak." substring (handles both `<name>.bak.<ver>` and
 *  the v0.2.78 collision-suffix `<name>.bak.<ver>.<n>` variant). */
const BAK_DIR_PATTERN = /\.bak\./;

/** Is any path segment a `.bak.<...>` directory? Returns false on
 *  empty / undefined paths.
 *
 *  Examples:
 *    isBakPath('forge-tutorial.bak.0.1.0/01-hello/Hello.md') → true
 *    isBakPath('forge-tutorial/01-hello/Hello.md')           → false
 *    isBakPath('notes/something.bak.md')                     → false
 *      (.bak. needs to be a directory segment, not a file extension)
 */
export function isBakPath(path: string | null | undefined): boolean {
  if (!path) return false;
  const segments = path.split('/');
  // The final segment is the file basename — don't match `.bak.` there.
  // Only directory segments count.
  for (let i = 0; i < segments.length - 1; i++) {
    if (BAK_DIR_PATTERN.test(segments[i])) return true;
  }
  return false;
}

/** Return the dedup key for the file-open Notice — the FIRST path
 *  segment whose name matches `.bak.*`. Notices are deduped per
 *  unique `.bak.*` directory across the session: opening a second
 *  file inside the same backup dir does NOT re-fire the Notice.
 *
 *  Returns null when the path has no `.bak.*` segment.
 *
 *  Examples:
 *    bakDedupKey('forge-tutorial.bak.0.1.0/01-hello/Hello.md')
 *      → 'forge-tutorial.bak.0.1.0'
 *    bakDedupKey('outer/forge-tutorial.bak.0.1.0/01-hello/Hello.md')
 *      → 'outer/forge-tutorial.bak.0.1.0'
 *    bakDedupKey('forge-tutorial/Hello.md')
 *      → null
 */
export function bakDedupKey(path: string | null | undefined): string | null {
  if (!path) return null;
  const segments = path.split('/');
  for (let i = 0; i < segments.length - 1; i++) {
    if (BAK_DIR_PATTERN.test(segments[i])) {
      return segments.slice(0, i + 1).join('/');
    }
  }
  return null;
}

/** Strip the `.bak.<version>` suffix from a directory segment to
 *  recover the base library name. Used to compose the live-version
 *  hint in the Notice text.
 *
 *  Examples:
 *    baseLibraryName('forge-tutorial.bak.0.1.0') → 'forge-tutorial'
 *    baseLibraryName('forge-tutorial.bak.0.1.0.2') → 'forge-tutorial'
 *      (.2 is the v0.2.78 collision-suffix; still strips back to base)
 *    baseLibraryName('not-a-bak-dir') → 'not-a-bak-dir'
 *      (no `.bak.` present; pass-through)
 */
export function baseLibraryName(bakDirName: string): string {
  const m = bakDirName.match(/^(.*?)\.bak\..*$/);
  return m ? m[1] : bakDirName;
}
