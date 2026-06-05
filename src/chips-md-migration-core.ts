// Pure-core decision: when the plugin loads, is the user's extracted
// `_meta/_chips.md` in v1 format (pre-v0.2.48 hand-authored chips
// list) or v2 (schema_version: 2 + overrides/groups/hide)?
//
// The migrateChipsMdToV2 wiring in welcome.ts uses this to decide
// whether to back up the v1 file and overwrite with the bundle's
// v2 file. Cohort vaults that installed v0.2.48-v0.2.51 silently
// kept their pre-existing v1 _chips.md because the v0.2.38 auto
// re-extract mechanism only fires on forge.toml version drift —
// and the v0.2.48 schema-v2 migration shipped without bumping
// forge-moda/forge.toml. This one-shot detector unblocks them.
//
// Pure-core extraction No. 17. No `obsidian` import — `node --test`
// exercises this without a shim, same pattern as copy-dir-core,
// forge-toml-stub, bundled-vault-version-core, chips-core, etc.

/** Status of an extracted `_meta/_chips.md` per its frontmatter.
 *  - `v2`: schema_version: 2 present — already migrated, no-op.
 *  - `v1`: schema_version absent or != 2 — needs migration. `preservedAs`
 *    is the DEFAULT backup name (collision-free check happens in the
 *    caller via chooseBackupName + the actual on-disk file list).
 *  - `absent`: caller already verified the file isn't on disk; no work.
 *  - `unparseable`: missing `---` frontmatter delimiters or otherwise
 *    malformed; caller logs + skips to avoid clobbering an unexpected
 *    file shape. */
export type ChipsMdVersionStatus =
  | { kind: 'v2' }
  | { kind: 'v1'; preservedAs: string }
  | { kind: 'absent' }
  | { kind: 'unparseable' };

/** Default backup filename used by the migration when collision-free. */
export const DEFAULT_BACKUP_NAME = '_chips.md.bak.v1';

/** Decide whether an extracted `_meta/_chips.md` body is v1 or v2.
 *  Pure: caller is responsible for read I/O.
 *
 *  Detection rule per chips-schema.md: `schema_version: 2` in the
 *  frontmatter is the canonical v2 marker. Absence of the marker
 *  (including any pre-v0.2.48 _chips.md that lists `chips:` directly)
 *  → v1. Explicit non-2 `schema_version` values also classify as v1
 *  (defensive — caller migrates to the bundled v2 file).
 *
 *  Inputs:
 *    null       → 'absent' (caller checked exists() first; defensive).
 *    no `---`   → 'unparseable' (not a valid markdown frontmatter file).
 *    has `---`  → parse frontmatter for `schema_version`. */
export function classifyChipsMd(body: string | null): ChipsMdVersionStatus {
  if (body === null) return { kind: 'absent' };
  if (!body.startsWith('---')) return { kind: 'unparseable' };
  const end = body.indexOf('\n---', 4);
  if (end === -1) return { kind: 'unparseable' };
  const fm = body.slice(0, end);
  // `schema_version: 2` — number or quoted string both tolerated, per
  // YAML's loose scalar rules.
  const m = fm.match(/^schema_version\s*:\s*["']?([^"'\n]+?)["']?\s*$/m);
  if (m && m[1].trim() === '2') return { kind: 'v2' };
  return { kind: 'v1', preservedAs: DEFAULT_BACKUP_NAME };
}

/** Choose a collision-free backup name for the v1 file. Caller passes
 *  the set of file names already present in the `_meta/` directory.
 *
 *  Default name `_chips.md.bak.v1`. If that's already taken, suffixes
 *  `.2`, `.3`, … until free. Idempotent: same input → same output.
 *  Matches the renameWithBackup collision pattern in welcome.ts for
 *  consistency with the v0.2.38 vault-bundle drift backups. */
export function chooseBackupName(existingFiles: Set<string>): string {
  if (!existingFiles.has(DEFAULT_BACKUP_NAME)) return DEFAULT_BACKUP_NAME;
  let counter = 2;
  while (existingFiles.has(`${DEFAULT_BACKUP_NAME}.${counter}`)) {
    counter += 1;
  }
  return `${DEFAULT_BACKUP_NAME}.${counter}`;
}
