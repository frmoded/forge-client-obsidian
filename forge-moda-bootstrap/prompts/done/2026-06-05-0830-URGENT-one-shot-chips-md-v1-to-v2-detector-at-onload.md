# URGENT — One-shot `_chips.md` v1→v2 detector at onload (cohort-vaults unblock)

## Scope

Cohort vaults that installed v0.2.48 through v0.2.51 still have v1-format `_chips.md` files on disk. The v2 file in the plugin bundle never overwrites the user's pre-existing v1 file because the auto re-extract mechanism (v0.2.38) only fires on `forge.toml` version drift — and the v0.2.48 schema-v2 migration shipped without bumping `forge-moda/forge.toml`. The v2 surface (auto-discovery, signature-sourcing, `Do [[X]]().` insertions) is therefore dead in every real cohort vault including Tamar's.

This prompt is the **one-shot unblock**: on plugin load, walk each library subdir's `_meta/_chips.md`, detect v1 format (absent `schema_version: 2`), back up the v1 file to `_chips.md.bak.v1`, and overwrite with the bundled v2 file. Idempotent: once a vault has been upgraded, subsequent plugin loads see `schema_version: 2` and skip.

What this prompt does NOT do:
- Generalize the bundle-drift mechanism (that's v1-audit item — separate larger drain post-V1).
- Change the v0.2.38 auto re-extract logic.
- Modify the chip-palette code path itself (it's already v2-capable per v0.2.48).
- Touch any bundled vault content (the schema-v2 _chips.md in forge-moda is already correct).
- Bump forge-moda's `forge.toml` version (it's already too late for the cohort — the v2 detector handles the upgrade directly; future bundled-content drains will bump forge.toml per the new cc-prompt-queue.md rule).

## Why

Per Mission's Papert-first + speed-second decision lens: cohort users can't see the schema-v2 work in their palettes today. Every Forge-click that should produce a curated chip insertion fails because the auto-discovery path is gated on the v2 file format. Unblocking this is the highest Papert win per minute of work.

This is the **third instance** of the lifecycle-assumption anti-pattern (v1-audit item (dd)) — see `cowork-forge-protocol.md` for the discipline going forward. The structural fix (generalized bundle-drift detection, v1-audit item (cc)+(dd) related) is queued separately; this prompt is the tactical unblock.

## Files to modify

- **`~/projects/forge-client-obsidian/src/welcome.ts`** — add `migrateChipsMdToV2(adapter, libraryDirName)` helper called from the appropriate onload path (likely near `ensureBundledForgeModa` / `ensureBundledForgeMusic`).
- **NEW: `~/projects/forge-client-obsidian/src/chips-md-migration-core.ts`** — pure-core helper deciding v1-vs-v2 from frontmatter contents. Pure-core extraction No. 17. Tests in sibling `.test.ts`.
- **`~/projects/forge-client-obsidian/manifest.json`** — `{CURRENT} → {NEXT_PATCH}` placeholder.
- **`~/projects/forge-client-obsidian/INSTALL.md`** — version pin update.

(No bundled vault content changes. No forge.toml bumps. The migration writes to user vaults at runtime; it doesn't touch the bundle.)

## Files to read first

- `~/projects/forge/docs/specs/chips-schema.md` — confirm `schema_version: 2` is the canonical v2 marker.
- `~/projects/forge-client-obsidian/src/welcome.ts` — current `ensureBundledForgeModa` + `ensureBundledForgeMusic` shape; understand the onload flow.
- `~/projects/forge-client-obsidian/src/bundled-vault-version-core.ts` — the v0.2.38 pure-core helper. The new migration is a sibling lifecycle.
- `~/projects/forge-client-obsidian/assets/vaults/forge-moda/_meta/_chips.md` — confirm the bundled v2 file is correct (`schema_version: 2` in frontmatter).

## Implementation notes

### Pure-core helper shape

```typescript
// src/chips-md-migration-core.ts
export type ChipsMdVersionStatus =
  | { kind: 'v2' }                       // already migrated; no-op
  | { kind: 'v1'; preservedAs: string }  // needs migration; what backup name to use
  | { kind: 'absent' }                   // no extracted _chips.md; nothing to migrate
  | { kind: 'unparseable' };              // malformed; skip + log

/** Decide whether an extracted `_chips.md` body is v1 or v2.
 *  v2 is indicated by `schema_version: 2` in the frontmatter.
 *  Absence of the marker → v1 (any pre-v0.2.48 _chips.md). */
export function classifyChipsMd(body: string | null): ChipsMdVersionStatus { ... }

/** Compute the backup filename. Idempotent: same input → same output.
 *  If `_chips.md.bak.v1` already exists in the caller's `existingFiles`
 *  set, returns `_chips.md.bak.v1.2`, `.3`, etc. */
export function chooseBackupName(existingFiles: Set<string>): string { ... }
```

### Tests (`chips-md-migration-core.test.ts`) — TDD discipline

1. `classifyChipsMd(null) → {kind: 'absent'}`.
2. `classifyChipsMd('---\ntype: data\n---\n\nchips:\n  - label: ...')` → `{kind: 'v1', preservedAs: '_chips.md.bak.v1'}`.
3. `classifyChipsMd('---\ntype: data\nschema_version: 2\n---\n\n...')` → `{kind: 'v2'}`.
4. `classifyChipsMd('---\ntype: data\nschema_version: 1\n---\n\n...')` → `{kind: 'v1'}` (explicit v1 marker, defensive).
5. `classifyChipsMd('not-valid-yaml-no-frontmatter')` → `{kind: 'unparseable'}`.
6. `chooseBackupName(new Set())` → `'_chips.md.bak.v1'`.
7. `chooseBackupName(new Set(['_chips.md.bak.v1']))` → `'_chips.md.bak.v1.2'`.
8. `chooseBackupName(new Set(['_chips.md.bak.v1', '_chips.md.bak.v1.2']))` → `'_chips.md.bak.v1.3'`.
9. Idempotent: classifying the same body twice yields equal results (no-op-stays-no-op).

### welcome.ts wiring

```typescript
async function migrateChipsMdToV2(
  adapter: DataAdapter,
  libraryDirName: string,
): Promise<void> {
  const extractedPath = `${libraryDirName}/_meta/_chips.md`;
  const bundledPath = `.obsidian/plugins/forge-client-obsidian/assets/vaults/${libraryDirName}/_meta/_chips.md`;

  if (!(await adapter.exists(extractedPath))) {
    return;  // 'absent' — no _chips.md to migrate
  }
  if (!(await adapter.exists(bundledPath))) {
    console.warn(`Forge: bundled _chips.md missing for ${libraryDirName}; skipping migration`);
    return;
  }

  const extractedBody = await adapter.read(extractedPath);
  const status = classifyChipsMd(extractedBody);

  if (status.kind === 'v2') {
    return;  // already migrated; no-op
  }
  if (status.kind === 'unparseable') {
    console.warn(`Forge: extracted _chips.md for ${libraryDirName} is unparseable; skipping migration`);
    return;
  }

  // status.kind === 'v1'
  const existingFiles = await listAdjacentFiles(adapter, `${libraryDirName}/_meta/`);
  const backupName = chooseBackupName(existingFiles);
  const backupPath = `${libraryDirName}/_meta/${backupName}`;

  await adapter.rename(extractedPath, backupPath);
  const bundledBody = await adapter.read(bundledPath);
  await adapter.write(extractedPath, bundledBody);
  console.log(`Forge: migrated ${libraryDirName}/_meta/_chips.md v1→v2; previous version backed up as ${backupName}`);
}
```

Called from the appropriate onload point — after `ensureBundledForgeModa` (and ensureBundledForgeMusic when applicable) so the extracted vault exists before the migration runs.

### Edge cases CC should handle

- **`_chips.md` on disk but bundled file missing**: warn + skip (likely a dev-mode setup where assets are mocked).
- **Adapter.rename fails** (mobile Obsidian limitation): fall back to copy-then-delete via `copyDirRecursive` + `adapter.remove`. Same pattern as `bundled-vault-version-core`'s `renameWithBackup`.
- **Multiple library subdirs** (forge-moda + forge-music + future): migration runs for each. Each is independent.

## Tests

### Auto-verifiable by CC

- `npm test` → expect `X/X` with ~9 new cases. Report as `X/X in Y ms`.
- Clean-vault smoke for the migration path:
  1. Build release zip.
  2. Set up `~/test-vaults/chips-migration-smoke/.obsidian/plugins/forge-client-obsidian/`, unzip release.
  3. Manually drop a `_chips.md` file (v1 format — pre-v0.2.48 shape) into `~/test-vaults/chips-migration-smoke/forge-moda/_meta/`.
  4. Drop a vault `forge.toml` with `domains = ["moda"]`.
  5. Boot via node script (mirroring the v0.2.38 smoke approach) and assert: migration ran, `_chips.md.bak.v1` exists with v1 content, `_chips.md` exists with v2 content (schema_version present).
  6. Boot AGAIN to verify idempotency: no second backup created, no log spam, `_chips.md` unchanged.

### Deferred to user (CC writes the §3 checklist per protocol)

Per cc-prompt-queue.md user-side smoke quality bar. Specifically:

1. Install v0.2.X (the version this prompt cuts) via `install-latest.sh` into an existing cohort vault that has a v1 `_chips.md`.
2. Open Obsidian, switch to the vault, open DevTools console.
3. Expect log line: `Forge: migrated forge-moda/_meta/_chips.md v1→v2; previous version backed up as _chips.md.bak.v1`.
4. Verify the file tree shows `forge-moda/_meta/_chips.md.bak.v1` (original v1 preserved).
5. Verify `forge-moda/_meta/_chips.md` now contains `schema_version: 2` in frontmatter.
6. Forge-click any moda snippet; verify the chip palette shows auto-discovered chips with `Do [[X]]().` insertions (the v2 behavior that was previously dead).
7. Restart Obsidian; verify console does NOT log the migration message a second time (idempotency).
8. Failure modes section + end-state cleanup.

## Out of scope

- Generalized bundle-drift detection (v1-audit (cc)+(dd); separate post-V1 drain).
- Adding a UX affordance to view/restore old `_chips.md.bak.v1` (the file is on disk; users with hand-curated v1 customizations can diff it themselves).
- Migrating other potentially-stale bundled-vault files (only `_chips.md` is in scope today; future content-only changes use the new cc-prompt-queue.md rule).
- Telemetry on how many cohort vaults run the migration (no telemetry infrastructure exists; future v1.x feature).

## Don'ts

- **Don't overwrite without backup.** The `_chips.md.bak.v1` backup is load-bearing for the corner case of curator hand-edits.
- **Don't make the migration auto-discover other files.** Scope is strictly `_meta/_chips.md` per library subdir. Generalization is the v1-audit item, not this drain.
- **Don't bump forge.toml in any bundled vault.** Migration is a one-time runtime fix; bundled content stays as it is.
- **Don't tag a release if the new tests fail.** Hard preflight gate.
- **Don't bump versions concretely** — use `{CURRENT} → {NEXT_PATCH}`.

## Report when done

Standard §0–§3 per cc-prompt-queue.md:

- **§0** — manifest before/after, commit SHAs, push, tag, release URL, SHA round-trip, line counts.
- **§1.1** — TDD test cases (the 9 above + any CC extras).
- **§1.2** — pre-fix verbatim test output (cases fail — helper module doesn't exist).
- **§1.3** — fix landed: cited line-number diffs in welcome.ts + chips-md-migration-core.ts.
- **§1.4** — post-fix verbatim test output + clean-vault smoke script output.
- **§1.5** — full `npm test` suite.
- **§2** — surprises during implementation; any adapter quirks discovered; whether the v0.2.38 `renameWithBackup` pattern was reused or duplicated.
- **§3** — user-side smoke checklist per the quality bar.
