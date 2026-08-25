// src/rolling-backup-core.ts
//
// Drain 2026-08-25-0120 — driver's adjudication of 1620, option (b):
// re-extract keeps ONE rolling backup per vault, overwritten each
// time. Exactly one backup exists at any moment.
//
// History this replaces, so nobody re-litigates it:
//   v0.2.39  renameWithBackup → `<vault>.bak.<version>/`. Accumulated
//            one dir per drift event and broke findFeaturedSnippet.
//   v0.2.106 delete-on-extract. No litter, but a cohort member who
//            poked at a bundled snippet lost it with no recourse.
//   this     one FIXED name, replaced in place. Bounded litter (one
//            dir) and one undo.
//
// NO OBSIDIAN IMPORTS (pure-core convention).
//
// NAME CONSTRAINT (cc-prompt-queue ~648). The engine's walk and the
// plugin's mount both exclude directories matching `\.bak\.` — with a
// TRAILING dot. `<vault>.bak/` does not match and would be walked as a
// snippet source, re-introducing the duplicate-`simulation.md`
// shadowing that killed v0.2.39. The suffix below therefore keeps the
// trailing dot, and the suite asserts that against the vendored engine
// source rather than against a copy of the pattern.

/** The one suffix. Trailing dot is load-bearing — see NAME CONSTRAINT. */
export const ROLLING_BACKUP_SUFFIX = '.bak.previous';

/** The single backup directory for a bundled vault. Vault-root
 *  relative, matching how `ensureBundledVault` names its target. */
export function rollingBackupDirFor(vaultName: string): string {
  return `${vaultName}${ROLLING_BACKUP_SUFFIX}`;
}

/** Exact-match test for "this directory IS a rolling backup". Exact,
 *  not prefix: `<vault>.bak.previous.1` is legacy collision-suffix
 *  litter and stays sweepable. */
export function isRollingBackupDir(name: string): boolean {
  return name.endsWith(ROLLING_BACKUP_SUFFIX)
    && name.length > ROLLING_BACKUP_SUFFIX.length;
}

export interface RollingBackupPlan {
  /** Where the outgoing extracted vault goes. */
  backupDir: string;
  /** True when a previous backup is present and must be removed before
   *  the move, so the result is a REPLACE and never an accumulation. */
  removeExistingFirst: boolean;
}

/** Plan the backup for one re-extract.
 *
 *  `existingFolders` is the vault-root folder listing (names or paths;
 *  only the final segment is compared), so the caller can hand
 *  `adapter.list('/')` straight through. */
export function planRollingBackup(
  vaultName: string,
  existingFolders: readonly string[],
): RollingBackupPlan {
  const backupDir = rollingBackupDirFor(vaultName);
  const present = existingFolders.some(f => basename(f) === backupDir);
  return { backupDir, removeExistingFirst: present };
}

/** Should the every-onload legacy sweep remove this vault-root folder?
 *
 *  The sweep predates this drain and exists to clear `<vault>.bak.<v>`
 *  litter from the v0.2.39 era. The rolling backup has the same
 *  `<vault>.bak.` prefix, so WITHOUT this carve-out the sweep destroys
 *  it on the next plugin load and the whole feature degrades to
 *  delete-on-extract with extra steps. */
export function shouldSweepLegacyBakDir(
  name: string,
  candidates: readonly string[],
): boolean {
  if (isRollingBackupDir(name)) return false;
  return candidates.some(c => name.startsWith(`${c}.bak.`));
}

/** How many backup dirs exist for one vault. The at-most-one
 *  invariant: this is 0 or 1, never more. Used by the guard test and
 *  available to any future runtime assertion. */
export function countBackupDirsFor(
  vaultName: string,
  folders: readonly string[],
): number {
  const prefix = `${vaultName}.bak.`;
  return folders.filter(f => basename(f).startsWith(prefix)).length;
}

function basename(p: string): string {
  return p.split('/').filter(Boolean).pop() ?? '';
}
