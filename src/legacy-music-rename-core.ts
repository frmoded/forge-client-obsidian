// v0.2.333 Phase 5 two-vault split (drain 2026-08-06-1800) — pure-core
// decision logic for parking a pre-rename `forge-music/` extracted
// library when the renamed `music-theory/` bundle first extracts.
//
// Why `.bak.` in the backup name (design decision D1, FEEDBACK
// 2026-08-06-1800): the engine ignores `.bak.`-segment directories at
// snippet discovery (snippet_registry.py:_BAK_DIR_PATTERN, v0.2.78)
// and the plugin ships file-tree strike-through + read-only Notice
// cues for them (bak-path-core, v0.2.82). Parking under a `.bak.`
// name makes the old copy inert everywhere with zero new exclusion
// code; a plain `forge-music.legacy/` name would need fresh
// exclusions in MEMFS mount, palette discovery, and the registry.
//
// The rename is NON-destructive: user-authored files inside the old
// dir survive in the parked copy, recoverable by hand. Cleanup is
// user-owned (sweepLegacyBakDirs deliberately no longer matches
// forge-music.bak.* — see welcome.ts).

export const LEGACY_MUSIC_DIR = 'forge-music';
export const LEGACY_MUSIC_BACKUP_DIR = 'forge-music.bak.legacy';
// Drain 2026-08-08-1200 — the driver's manual mid-migration rename
// (before the v0.2.334 park mechanism reached those vaults). Missing
// the `.bak.` segment, so the engine's _BAK_DIR_PATTERN does NOT
// exclude it and its notes collide with the music-theory bundle
// (AmbiguousSnippetResolutionError). Parked to the same backup slot.
export const LEGACY_MUSIC_VARIANT_DIR = 'forge-music.legacy';

export type LegacyMusicRenameAction =
  | 'rename'                // old forge-music/ present, backup slot free → park it
  | 'rename-legacy-variant' // forge-music.legacy/ present, backup slot free → park it
  | 'skip-no-old'           // nothing to park (fresh vault or already parked + cleaned)
  | 'skip-backup-exists';   // backup already present → never clobber it

export interface LegacyMusicRenameState {
  oldExists: boolean;
  backupExists: boolean;
  /** Driver's manual `forge-music.legacy/` rename (2026-08-08 item [5]).
   *  Optional so pre-existing call sites/tests stay valid. */
  legacyVariantExists?: boolean;
}

/** Decide whether a legacy music dir (`forge-music/` or the driver's
 *  manual `forge-music.legacy/`) should be parked at
 *  `forge-music.bak.legacy/`. Idempotent across plugin loads: after a
 *  successful rename the source dir is gone → 'skip-no-old'. When the
 *  backup slot is already taken, we refuse to clobber it; the leftover
 *  dir stays and is neutralized by the MEMFS mount-skip list in
 *  pyodide-host.ts instead. If BOTH legacy dirs exist (never observed),
 *  the original `forge-music/` wins the slot and the variant is left
 *  in place, mount-skip-neutralized. */
export function decideLegacyMusicRename(
  state: LegacyMusicRenameState,
): LegacyMusicRenameAction {
  if (state.oldExists) {
    return state.backupExists ? 'skip-backup-exists' : 'rename';
  }
  if (state.legacyVariantExists) {
    return state.backupExists ? 'skip-backup-exists' : 'rename-legacy-variant';
  }
  return 'skip-no-old';
}

/** Cohort-facing Notice text shown exactly once, when the park fires.
 *  Load-bearing string — pinned by legacy-music-rename-core.test.ts. */
export function legacyMusicRenameNotice(): string {
  return (
    `Forge: your music library moved — forge-music/ was parked at ` +
    `${LEGACY_MUSIC_BACKUP_DIR}/ and the library now lives in ` +
    `music-theory/. Delete the parked copy once you've confirmed ` +
    `nothing of yours is inside it.`
  );
}

/** Variant of the park Notice for the `forge-music.legacy/` case.
 *  Load-bearing string — pinned by legacy-music-rename-core.test.ts. */
export function legacyVariantRenameNotice(): string {
  return (
    `Forge: ${LEGACY_MUSIC_VARIANT_DIR}/ was parked at ` +
    `${LEGACY_MUSIC_BACKUP_DIR}/ (its name defeated Forge's ` +
    `backup-dir exclusion and collided with music-theory/). Delete ` +
    `the parked copy once you've confirmed nothing of yours is ` +
    `inside it.`
  );
}
