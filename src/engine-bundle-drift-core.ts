// v0.2.x: 10th pure-core extraction. Walks the engine source-of-truth
// (forge engine repo) and the plugin bundle (assets/engine/forge/)
// via a structural adapter; produces a drift list of files that are
// missing in the bundle, orphaned in the bundle, or have mismatched
// content.
//
// The adapter abstraction keeps the helper testable without
// filesystem coupling. The real-fs adapter lives in
// scripts/sync-engine-bundle.mjs + the preflight in
// build-release-zip.mjs (both share the scope filter via
// engineSourceScope() / engineBundleScope() below — kept here so
// tests verify the same predicate the real adapter uses).
//
// Scope (per the 2026-06-02 drift-check prompt §1):
//   INCLUDED: forge/__init__.py, forge/core/**, forge/moda/**,
//             forge/music/** (all .py files, recursive)
//   EXCLUDED: forge/api/, forge/installer/, forge/sdk/,
//             forge/builtins/, forge/config.py, __pycache__,
//             tests/

export interface DriftEntry {
  /** Path relative to the engine `forge/` root, e.g. 'core/registry.py'. */
  relPath: string;
  status: 'missing-in-bundle' | 'orphaned-in-bundle' | 'content-mismatch';
}

export interface BundleDriftAdapter {
  /**
   * Return the sorted list of in-scope file paths (relative to the
   * `forge/` root) for the requested scope. The adapter applies the
   * scope filter — out-of-scope files (api/, installer/, etc.) MUST
   * be omitted from the listing.
   */
  listEngineFiles(scope: 'source' | 'bundle'): Promise<string[]>;
  /** Read raw bytes of a file from the given scope. */
  readFile(scope: 'source' | 'bundle', relPath: string): Promise<Buffer>;
}

const EXCLUDED_TOP_LEVEL_DIRS = new Set([
  'api', 'installer', 'sdk', 'builtins', '__pycache__', 'tests',
]);
const EXCLUDED_TOP_LEVEL_FILES = new Set(['config.py']);

/**
 * Predicate for the scope filter — exposed so the filesystem adapter
 * in scripts/sync-engine-bundle.mjs and the preflight share the same
 * rule. `relPath` is relative to the `forge/` root (forward slashes,
 * no leading slash). Returns true if the file is in scope for the
 * bundle.
 */
export function isInScope(relPath: string): boolean {
  if (!relPath.endsWith('.py')) return false;
  const parts = relPath.split('/');
  const top = parts[0];
  if (parts.length === 1) {
    // Top-level file. Only __init__.py is in scope; config.py and
    // others excluded.
    if (EXCLUDED_TOP_LEVEL_FILES.has(top)) return false;
    return top === '__init__.py';
  }
  if (EXCLUDED_TOP_LEVEL_DIRS.has(top)) return false;
  // Any path component named __pycache__ (e.g. core/__pycache__/foo.pyc)
  // is excluded — covers nested cache dirs too.
  if (parts.includes('__pycache__')) return false;
  return true;
}

/**
 * Walk both source and bundle file lists; return a sorted-by-relPath
 * drift list. Empty list = bundle byte-equal to source on every
 * in-scope file.
 */
export async function engineBundleDrift(
  adapter: BundleDriftAdapter,
): Promise<DriftEntry[]> {
  const [sourceFiles, bundleFiles] = await Promise.all([
    adapter.listEngineFiles('source'),
    adapter.listEngineFiles('bundle'),
  ]);
  const sourceSet = new Set(sourceFiles);
  const bundleSet = new Set(bundleFiles);

  const drift: DriftEntry[] = [];

  // Files in source but not bundle → missing-in-bundle.
  for (const rel of sourceFiles) {
    if (!bundleSet.has(rel)) {
      drift.push({ relPath: rel, status: 'missing-in-bundle' });
    }
  }

  // Files in bundle but not source → orphaned-in-bundle.
  for (const rel of bundleFiles) {
    if (!sourceSet.has(rel)) {
      drift.push({ relPath: rel, status: 'orphaned-in-bundle' });
    }
  }

  // Files in both → check content equality.
  for (const rel of sourceFiles) {
    if (!bundleSet.has(rel)) continue;
    const [srcBytes, bunBytes] = await Promise.all([
      adapter.readFile('source', rel),
      adapter.readFile('bundle', rel),
    ]);
    if (!srcBytes.equals(bunBytes)) {
      drift.push({ relPath: rel, status: 'content-mismatch' });
    }
  }

  drift.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return drift;
}
