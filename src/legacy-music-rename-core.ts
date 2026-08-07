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

export type LegacyMusicRenameAction =
  | 'rename'              // old dir present, backup slot free → park it
  | 'skip-no-old'         // nothing to park (fresh vault or already parked + cleaned)
  | 'skip-backup-exists'; // backup already present → never clobber it

export interface LegacyMusicRenameState {
  oldExists: boolean;
  backupExists: boolean;
}

/** Decide whether the pre-rename `forge-music/` dir should be parked
 *  at `forge-music.bak.legacy/`. Idempotent across plugin loads: after
 *  a successful rename, oldExists is false → 'skip-no-old'. If BOTH
 *  exist (a re-extracted old dir alongside an earlier park — should
 *  not happen in practice), we refuse to clobber the existing backup;
 *  the stale old dir stays and is neutralized by the MEMFS mount-skip
 *  list in pyodide-host.ts instead. */
export function decideLegacyMusicRename(
  state: LegacyMusicRenameState,
): LegacyMusicRenameAction {
  if (!state.oldExists) return 'skip-no-old';
  if (state.backupExists) return 'skip-backup-exists';
  return 'rename';
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
