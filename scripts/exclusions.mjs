// scripts/exclusions.mjs
//
// CW-plugin-shared-exclusion-module (drain 2026-07-29-1610).
//
// Shared file/directory exclusion policy for bundle-sync + drift-check.
// Both `sync-bundled-vault.mjs` and `build-release-zip.mjs` used to
// maintain this list separately — the 2026-07-28 release arc added
// `_scratch` in one script, then the other, one turn apart. Third
// occurrence would cost another two edits. This module makes future
// exclusion additions a one-line edit in one place.
//
// Policy:
// - VCS / editor state / build caches never mirror to the bundle.
// - `.pyc` files (Python bytecode) never mirror.
// - Underscore-prefixed driver-scratch files never mirror:
//   - `_spike*`   — driver local spike files (drain v0.2.147)
//   - `_v2_spike*` — V2-spike-note convention (drain v0.2.164)
//   - `_scratch*` — 2026-07-28 arc addition
//   - `_P*.md`   — `_P.md`, `_P1.md`, etc. driver placeholder pattern

// Names that must never be mirrored into the bundle. Local-development
// artefacts (VCS, editor state, runtime caches) that don't belong in the
// shipped plugin.
export const EXCLUDED_NAMES = new Set([
  ".git",
  ".github",
  ".gitignore",
  ".DS_Store",
  "node_modules",
  ".obsidian",
  ".forge",
  "__pycache__",
  ".pytest_cache",
  "dist",
  "build",
]);

/** Return true if `name` (a single path segment or filename) is
 *  excluded from bundle mirror + drift check.
 *
 *  Called on both directory names (during traversal — a whole excluded
 *  tree is skipped) and file names (leaf `.pyc`, `_spike.md`, etc.).
 */
export function isExcludedName(name) {
  if (EXCLUDED_NAMES.has(name)) return true;
  if (name.endsWith(".pyc")) return true;
  if (name.startsWith("_spike")) return true;
  if (name.startsWith("_v2_spike")) return true;
  if (name.startsWith("_scratch")) return true;
  if (/^_P[^/]*\.md$/i.test(name)) return true;
  return false;
}
