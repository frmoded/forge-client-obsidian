// Pure-core helper for v3.1 per-chapter `_chips.md` walk-up discovery.
// Given an active file path + a library root path + a set of paths that
// actually exist in the vault, returns the ordered list of `_chips.md`
// paths to consult, most-specific (closest to the file) first.
//
// The walk:
//   1. Starting from the active file's parent directory.
//   2. At each level, candidate is `<dir>/_chips.md`. If that path is
//      in `existingFiles`, it's included in the result.
//   3. Walk UP one level. Repeat.
//   4. Stop walking when we reach (and process) `libraryRoot`. NEVER
//      walk above the library root.
//   5. At the library-root level, also consider `<libraryRoot>/_meta/_chips.md`
//      (the canonical v2 location, alongside the bare `<libraryRoot>/_chips.md`).
//
// All paths are vault-relative, forward-slash-separated, with no leading
// slash. `libraryRoot = ""` means the vault root itself; in that case the
// walk goes from the file's parent up to "" inclusive.
//
// Pure-core extraction No. 24. No `obsidian` import; runs cleanly under
// `node --test`.

/** Compute the ordered list of `_chips.md` paths the v3.1 walk-up
 *  consults for `activeFilePath`. Higher-specificity (closer to the
 *  active file) first.
 *
 *  Parameters:
 *    `activeFilePath` — vault-relative, forward-slash, e.g.
 *      `forge-tutorial/01-hello/hello.md`. May or may not actually
 *      exist; only its directory structure is used to derive the walk.
 *    `libraryRoot` — vault-relative directory above which the walk
 *      MUST NOT proceed. `""` means the vault root itself. Example:
 *      for a file under a bundled library at `forge-music/blues/song.md`,
 *      passing `libraryRoot = "forge-music"` keeps the walk inside the
 *      library.
 *    `existingFiles` — set of vault-relative paths that exist. Used
 *      to filter the candidate `_chips.md` paths to only the ones
 *      actually on disk.
 *
 *  Returns:
 *    Array of vault-relative paths (forward-slash) in walk order
 *    (most-specific first). Empty when no `_chips.md` is found at any
 *    level.
 *
 *  Behavior notes:
 *    - Active file at vault root (no `/` in path): walk consists of
 *      vault-root `_chips.md` + vault-root `_meta/_chips.md`.
 *    - `libraryRoot = ""` with file `01-hello/hello.md`: walks
 *      `01-hello/_chips.md` → vault root `_chips.md` → `_meta/_chips.md`.
 *    - Active file IN `libraryRoot` but not below: walks library-root
 *      level only.
 *    - Idempotent: same input → same output every call. */
export function walkUpChipsConfigs(
  activeFilePath: string,
  libraryRoot: string,
  existingFiles: Set<string>,
): string[] {
  const out: string[] = [];
  // Normalize: strip any trailing slash from libraryRoot for consistent
  // prefix comparisons. The "vault root" library uses `""`.
  const root = libraryRoot.endsWith('/')
    ? libraryRoot.slice(0, -1)
    : libraryRoot;

  // Derive the file's parent directory (the most-specific walk level).
  // For `a/b/c.md` parent is `a/b`. For `c.md` parent is `""`.
  const lastSlash = activeFilePath.lastIndexOf('/');
  let dir = lastSlash === -1 ? '' : activeFilePath.slice(0, lastSlash);

  // Walk up to (and including) the library root. Stop walking once
  // we've processed the level equal to `root`.
  while (true) {
    const candidate = dir === '' ? '_chips.md' : `${dir}/_chips.md`;
    if (existingFiles.has(candidate)) out.push(candidate);
    // At the library-root level, also probe the canonical `_meta/_chips.md`
    // alongside the bare `_chips.md`.
    if (dir === root) {
      const metaCandidate = dir === '' ? '_meta/_chips.md' : `${dir}/_meta/_chips.md`;
      if (existingFiles.has(metaCandidate)) out.push(metaCandidate);
      break;
    }
    // Ascend one level. If we'd go above the root, snap to root.
    const nextSlash = dir.lastIndexOf('/');
    if (nextSlash === -1) {
      // dir was a top-level directory. Next level is "".
      if (root === '') {
        dir = '';
        continue;
      }
      // The active file is above (outside) the declared library root.
      // Treat that as an end-of-walk; we already emitted the dir-level
      // probe, so stop here without duplicating root probes.
      break;
    }
    dir = dir.slice(0, nextSlash);
  }
  return out;
}
