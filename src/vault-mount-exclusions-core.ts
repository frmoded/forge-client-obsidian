// src/vault-mount-exclusions-core.ts
//
// Drain 2026-08-23-1400 — what the plugin must never hand the engine.
// NO OBSIDIAN IMPORTS (pure-core convention).
//
// The engine's vault scan skips Forge-managed state dirs and backup
// dirs. The plugin's two ingestion points — the MEMFS mount loop and
// the per-file `syncUserVaultFile` — did not, so a `.forge/edges/**`
// snapshot could reach the registry through the plugin even where the
// engine's own walk would have skipped it.
//
// MIRROR, NOT A SECOND LIST. These values are checked against the
// vendored `assets/engine/forge/core/snippet_registry.py` by a drift
// test in this module's suite; if the engine's set changes and this
// one does not, that test fails. (A build-time codegen would remove
// the mirror entirely, but it would also put a generated file in the
// import path of the mount — the drift test buys the same guarantee
// for a fraction of the moving parts.)

/** Mirrors the engine's `_RESERVED_DIRS`. */
export const RESERVED_DIRS: ReadonlySet<string> = new Set([
  '.forge', '.obsidian', '.git', '.stfolder',
]);

/** Mirrors the engine's `_BAK_DIR_PATTERN`. */
export const BAK_DIR_PATTERN = /\.bak\./;

/** True for a directory name the vault walk must not descend into. */
export function isReservedDirName(name: string): boolean {
  return RESERVED_DIRS.has(name) || BAK_DIR_PATTERN.test(name);
}

/**
 * True when a vault-relative file path lies under a reserved directory
 * at ANY depth.
 *
 * Only segments ABOVE the file are directories, so a note that happens
 * to be named `.forge.md` still mounts — it is a (strangely named)
 * note, not state.
 */
export function isExcludedFromVaultMount(path: string): boolean {
  const segments = path.split('/');
  return segments.slice(0, -1).some(isReservedDirName);
}
