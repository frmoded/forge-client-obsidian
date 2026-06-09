// v0.2.112 Item A — chip palette folding pure-core.
//
// Determines which library category should expand by default given
// the active file path on first palette open. User manual
// expand/collapse overrides this on subsequent renders (session-
// scoped state lives in chips-view.ts).
//
// Per the v0.2.106 lesson: path-prefix gates need positive
// frontmatter signal for BEHAVIORAL routing. This is UI-only
// filtering (which sections show expanded), so path-prefix is
// acceptable. Documented per the prompt §2.5.

/** Determine which library category corresponds to an active file
 *  path. Returns the source library name ("forge-moda" / "forge-
 *  music" / "forge-tutorial") for a path under that library, or
 *  null when the active file isn't inside any known library
 *  (e.g. vault root, an authoring snippet outside the libraries).
 *
 *  Bundled libraries are matched by case-sensitive top-level
 *  directory prefix. */
export function libraryForActiveFilePath(
  activeFilePath: string | null,
): string | null {
  if (!activeFilePath) return null;
  const topDir = activeFilePath.split('/')[0];
  if (topDir === 'forge-moda' || topDir === 'forge-music'
      || topDir === 'forge-tutorial') {
    return topDir;
  }
  return null;
}

/** Compute which library category headers should be open by default
 *  on first palette open. Per the prompt §2.5:
 *
 *  - Active file is under a known library → expand ONLY that one;
 *    other categories collapsed.
 *  - Active file is not under any library (vault root, plain note)
 *    → expand ALL known categories (no preferred context, surface
 *    everything).
 *
 *  `allSources` is the set of library source names actually present
 *  in the loaded chip groups (so this function never expands a
 *  category that has no chips). */
export function initialExpandedLibraries(
  activeFilePath: string | null,
  allSources: string[],
): Set<string> {
  const ctx = libraryForActiveFilePath(activeFilePath);
  if (ctx && allSources.includes(ctx)) {
    return new Set([ctx]);
  }
  return new Set(allSources);
}
