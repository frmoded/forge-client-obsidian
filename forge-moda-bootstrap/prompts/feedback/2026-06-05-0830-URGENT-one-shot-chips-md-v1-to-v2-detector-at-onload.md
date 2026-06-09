---
timestamp: 2026-06-05T08:30:00Z
session_id: claude-code-drain-v0.2.52
prompt_modified: 2026-06-05T08:30:00Z
status: success
---

# Feedback — 2026-06-05-0830 URGENT one-shot `_chips.md` v1→v2 detector at onload (v0.2.52)

## §0 — Release coordinates

**Manifest:** `forge-client-obsidian/manifest.json` 0.2.51 → 0.2.52 (pre-bumped in main work commit; release.sh's SKIP_BUMP path detected + skipped the bump step — second production use of v0.2.51's release.sh fix, validated clean).

**Commits (commit-directly-to-main per memory rule):**

| Repo | SHA | Subject |
|---|---|---|
| forge-client-obsidian | `a753ba4` | `[…URGENT-one-shot-chips-md-v1-to-v2-detector-at-onload] v0.2.52 — one-shot _chips.md v1→v2 migration at onload (cohort-vaults unblock)` |
| forge-client-obsidian | (release commit by release.sh's SKIP_BUMP path) | `Release v0.2.52` (empty commit; tag points here) |

**Tag + release:**
- Tag `v0.2.52` pushed to `origin/main`.
- GH release: <https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.52>
- Release assets: `main.js`, `manifest.json`, `styles.css`, `forge-client-obsidian-v0.2.52.zip` (33.08 MB).
- Zip SHA-256: `0d69f0aed1b6575cd33debe84196bf409da7be4bcf950e4f44dd8d92dceab37a`
- **Install round-trip verified.** `install-latest.sh` against the smoke vault downloaded the same SHA-256 and unpacked cleanly. Second release through the fixed release.sh — clean end-to-end run, zero manual orchestration steps.

**Line counts of changed files:**

| File | Lines | Note |
|---|---|---|
| `src/chips-md-migration-core.ts` | 75 | NEW. Pure-core extraction #17. `classifyChipsMd` + `chooseBackupName` + `ChipsMdVersionStatus` type + `DEFAULT_BACKUP_NAME` constant. |
| `src/chips-md-migration-core.test.ts` | 160 | NEW. 16 TDD test cases (9 prompt-specified + 7 defensive extras). |
| `src/welcome.ts` | 428 (+118 from 310) | Added `migrateChipsMdToV2(adapter, libraryDirName)` helper + two onload call sites (`forge-moda` after `ensureBundledForgeModa`; `forge-music` after `ensureBundledForgeMusic`). |
| `scripts/smoke-chips-md-migration.mjs` | 307 | NEW. Clean-vault smoke (16 assertions over 6 cycles: first-install migrate, idempotent re-run, collision-suffix backup, no-op when extracted absent, skip when bundled missing, skip when extracted unparseable). |
| `manifest.json` | 10 | version field bump. |
| `INSTALL.md` | (unchanged total) | 5 `v0.2.51` → `v0.2.52` pin replacements. |

## §1 — TDD discipline

### §1.1 — Test cases added pre-fix

The 9 cases the prompt specified + 7 defensive extras CC added:

| # | Case | Source |
|---|---|---|
| 1 | `classifyChipsMd(null)` → `{kind: 'absent'}` | prompt |
| 2 | v1 body (no `schema_version`) → `{kind: 'v1', preservedAs: '_chips.md.bak.v1'}` | prompt |
| 3 | v2 body (`schema_version: 2` in frontmatter) → `{kind: 'v2'}` | prompt |
| 4 | explicit `schema_version: 1` → `{kind: 'v1'}` (defensive) | prompt |
| 5 | no frontmatter → `{kind: 'unparseable'}` | prompt |
| 6 | `chooseBackupName(empty set)` → `'_chips.md.bak.v1'` | prompt |
| 7 | `chooseBackupName({'_chips.md.bak.v1'})` → `'_chips.md.bak.v1.2'` | prompt |
| 8 | `chooseBackupName({'.v1', '.v1.2'})` → `'_chips.md.bak.v1.3'` | prompt |
| 9 | idempotence: same body twice → equal result | prompt |
| 10 | opening `---` but no closing → `{kind: 'unparseable'}` | CC defensive |
| 11 | quoted `schema_version: "2"` → `{kind: 'v2'}` (YAML scalar tolerance) | CC defensive |
| 12 | commented-out `# schema_version: 2` → `{kind: 'v1'}` (active-line-wins) | CC defensive |
| 13 | gap in suffix counter still picks lowest free (`.v1.5` exists but `.v1.2` doesn't → picks `.v1.2`) | CC defensive |
| 14 | unrelated files in the set don't affect output | CC defensive |
| 15 | `chooseBackupName` idempotent | CC defensive |
| 16 | `DEFAULT_BACKUP_NAME` constant exported correctly | CC defensive |

### §1.2 — Pre-fix verbatim test output (helper module didn't exist)

Pre-fix the import `from './chips-md-migration-core.ts'` would have produced a `ERR_MODULE_NOT_FOUND` boot error at the test runner level — the helper module didn't exist yet. No test cases compiled, no per-test failures to paste. Standard pure-core extraction startup state.

### §1.3 — Fix landed (cited diffs)

**`src/chips-md-migration-core.ts`** (NEW, 75 lines): exports `ChipsMdVersionStatus` discriminated union, `DEFAULT_BACKUP_NAME` constant (`'_chips.md.bak.v1'`), `classifyChipsMd(body: string | null): ChipsMdVersionStatus`, `chooseBackupName(existingFiles: Set<string>): string`. No `obsidian` import. `classifyChipsMd` regexes the frontmatter slice for `schema_version: <value>` and returns `{kind: 'v2'}` iff the value equals `'2'` (number or quoted string both tolerated). `chooseBackupName` loops with a counter starting at 2 if the default name is taken.

**`src/welcome.ts`** lines 1-7 — import added:

```typescript
+import { classifyChipsMd, chooseBackupName } from './chips-md-migration-core';
```

**`src/welcome.ts`** lines 99-130 — two call sites wired into `runFirstRunCheck`:

```typescript
 await ensureBundledForgeModa(app);
+await migrateChipsMdToV2(adapter, 'forge-moda');

 // ... ensureForgeTomlStub ...

 await ensureBundledForgeMusic(app);
+await migrateChipsMdToV2(adapter, 'forge-music');
```

**`src/welcome.ts`** lines 286-374 — new `migrateChipsMdToV2` helper. Behaviour matrix:

- `!exists(extractedPath)` → silent return (no work needed; e.g. forge-music without a curator file).
- `kind: 'v2'` → silent return (idempotent).
- `kind: 'unparseable'` → warn + return (no clobber).
- `kind: 'v1'` + `!exists(bundledPath)` → warn + return (no data loss; e.g. dev-mode setup).
- `kind: 'v1'` + bundled present:
  - Compute backup name via `chooseBackupName` against `adapter.list(metaDir).files` basenames.
  - `adapter.rename(extractedPath, backupPath)` — falls back to read + write + remove on rename failure (mobile-Obsidian quirk pattern matching `renameWithBackup`).
  - `adapter.write(extractedPath, bundledBody)`.
  - `console.log` success.

Errors at any step are caught in the outer try and warn-logged so plugin onload doesn't abort.

### §1.4 — Post-fix verbatim test output

```
ℹ tests 278
ℹ pass 278
ℹ fail 0
```

All 16 new cases pass (262 prior + 16 new = 278). Full suite green.

### §1.5 — Clean-vault smoke output

```
=== smoke: chips-md v1→v2 one-shot migration ===

Sandbox: /var/folders/.../forge-smoke-chips-md-1780644667902-...

Cycle 1: v1 extracted → expect migration
  ✓ action === 'migrated' (got 'migrated')
  ✓ backup name === '_chips.md.bak.v1' (got '_chips.md.bak.v1')
  ✓ forge-moda/_meta/_chips.md.bak.v1 exists
  ✓ backup contains the v1 body verbatim
  ✓ migrated _chips.md contains schema_version: 2

Cycle 2: re-run after migration → expect no-op-already-v2
  ✓ action === 'no-op-already-v2' (got 'no-op-already-v2')
  ✓ exactly one backup remains (_chips.md.bak.v1); got [_chips.md.bak.v1]

Cycle 3: pre-existing backup → collision suffix
  ✓ action === 'migrated' (got 'migrated')
  ✓ collision-suffix backup name === '_chips.md.bak.v1.2' (got '_chips.md.bak.v1.2')
  ✓ original .v1 backup preserved (not clobbered)
  ✓ new .v1.2 backup exists

Cycle 4: no extracted _chips.md → silent no-op
  ✓ action === 'no-op-absent' for unextracted library (got 'no-op-absent')

Cycle 5: v1 extracted but bundled missing → skip-no-bundled
  ✓ action === 'skip-no-bundled' when bundled file missing (got 'skip-no-bundled')
  ✓ extracted v1 file unchanged when bundled missing (no data loss)

Cycle 6: unparseable extracted → skip-unparseable
  ✓ action === 'skip-unparseable' for garbage body (got 'skip-unparseable')
  ✓ garbage file unchanged (no clobbering)

=== smoke result: 16 passed, 0 failed ===
```

16/16 assertions pass. Every documented edge case validated end-to-end against an fs-backed adapter that mirrors Obsidian's `DataAdapter` shape.

## §2 — Surprises during implementation

**`renameWithBackup` pattern reused via duplication, not extraction.** The v0.2.38 helper in `welcome.ts:renameWithBackup` already implements the collision-suffix + rename-with-fallback shape for vault-level directory backups. The new `migrateChipsMdToV2` re-implements the same pattern for file-level backups. Both are correct; the duplication isn't load-bearing (each operates on a different object kind — directory vs file), but a future refactor could extract a shared `backupWithCollisionSuffix(adapter, path, type: 'file' | 'dir')` helper. Not in scope for this drain.

**`classifyChipsMd` uses regex, not YAML parse.** The pure-core helper avoids dragging in `parseYaml` (which is Obsidian-coupled) and uses the same lightweight `^schema_version:\s*...$` regex pattern that `chips.ts:readFrontmatterField` uses. Tolerates quoted/unquoted scalar values and skips commented lines (`# schema_version: 2`). Tradeoff: doesn't catch every YAML-spec edge case (e.g. multi-line `>` folded scalars), but `_chips.md` files in cohort vaults never use those shapes — the regex is sufficient.

**Default backup name shape (`_chips.md.bak.v1`).** Per the prompt, this preserves the v1 file in-place under the `_meta/` directory rather than moving it elsewhere. Curator-side rationale: if a curator had hand-edited the v1 chips list (cohort vaults typically didn't, but Tamar's vault might have), the v1 backup is visible-via-Obsidian and diff-able against the v2 file. The `.v1` suffix marks the schema version of the backup, not the plugin version.

**Forge-music call site is intentionally a future no-op.** Today's forge-music has no `_meta/_chips.md` (per chip-palette-schema-v2-adoption feedback §4). The `migrateChipsMdToV2(adapter, 'forge-music')` call short-circuits at the `!exists(extractedPath)` gate. Wired in advance so when forge-music ships their v2 `_chips.md` and the bundle re-extracts it, future v1→v2 upgrades for forge-music happen without revisiting `welcome.ts`. Cheap forward-compat.

**No `forge-moda/forge.toml` bump.** Per the prompt's explicit don't-do list: the migration replaces the file at runtime; the bundled forge-moda content stays unchanged. Future content-only drains will follow the new cc-prompt-queue.md rule (mentioned in the prompt's Why section) to bump forge.toml so the standard re-extract path handles them — but this drain is the tactical unblock for the cohort already running v0.2.48-v0.2.51.

**v0.2.51's release.sh fix validated in production for the second time.** Pre-bumped manifest + SKIP_BUMP detection + zip build + zip upload all worked cleanly on this release. Total CC steps for the v0.2.52 release: `git commit + git push + bash scripts/release.sh 0.2.52 + bash install-latest.sh`. Compare to v0.2.50 and prior: bump-bisect mid-script + manual `npm run release-zip` + manual `gh release upload` + manual install. The toolchain debt fix from yesterday is paying off.

**Pure-core extraction No. 17.** Updates the count from the convention list in cc-prompt-queue.md's "Test-infrastructure conventions" section (validated across 16 prior extractions, this is the 17th). No-obsidian-import, regex/std-lib only, `node --test` runs without a shim, exercises the production path. Pattern continues to scale.

## §3 — User-side smoke checklist

The migration smoke has been auto-verified by CC end-to-end via `scripts/smoke-chips-md-migration.mjs` (§1.5 above). The user-side smoke confirms the wiring fires correctly under real Obsidian against your actual smoke vault. I've already restored your smoke vault's `forge-moda/_meta/_chips.md` to v1 shape (it was v2 from my mid-loop patch during v0.2.50 debugging); the upgrade path is now testable in your environment.

### Pre-conditions (already in place)

- `~/forge-vaults/smoke-v0.2.13/forge-moda/_meta/_chips.md` is v1 shape (no `schema_version: 2`). Verified.
- `~/forge-vaults/smoke-v0.2.13/forge-moda/_meta/` contains only `_chips.md` (no pre-existing `.bak.v1` files). Verified.
- v0.2.52 plugin installed at `~/forge-vaults/smoke-v0.2.13/.obsidian/plugins/forge-client-obsidian/`. Verified via install-latest.sh round-trip.

### Test A — migration fires on reload (1 min)

1. Open Obsidian on the smoke vault.
2. Cmd+P → "Reload app without saving".
3. Open the devtools console (Cmd+Option+I → Console tab).
4. **Expected console log**: `Forge: migrated forge-moda/_meta/_chips.md v1→v2; previous version backed up as _chips.md.bak.v1`
5. Check the file tree (Files panel in left sidebar):
   - `forge-moda/_meta/_chips.md` exists (v2 — `schema_version: 2` in frontmatter).
   - `forge-moda/_meta/_chips.md.bak.v1` exists (v1 — the previous file body verbatim).
6. **Pass:** console log present + both files exist.

### Test B — palette reflects v2 (1 min)

1. Open any forge-moda action snippet (e.g. `forge-moda/create_water_particles.md`).
2. Open the chip palette (right sidebar puzzle icon, or Cmd+P → "Forge: Open chips palette").
3. **Expected:** palette shows 16 curated moda chips in 5 groups (Setup, Click, Go, Particle actions, Temperature) — the v2 surface that was previously dead in your vault.
4. Click any chip → insertion lands in editor in B7.1-canonical form (`Do [[create_water_particles]]().`), NOT v1 form (`Call [[create_water_particles]].`).
5. **Pass:** B7.1 insertions + curated groups + group ordering matches the v2 `_chips.md` overrides.

### Test C — idempotency on second reload (30 sec)

1. Cmd+P → "Reload app without saving" (a second time).
2. Open devtools console.
3. **Expected:** NO migration log message this time (the file is now v2; the detector short-circuits).
4. **Expected:** no second `.bak.v1.2` file was created.
5. Check file tree: `forge-moda/_meta/` contains exactly `_chips.md` (v2) and `_chips.md.bak.v1` (original v1). Nothing else.
6. **Pass:** silent reload + no extra backup + file count unchanged.

### Test D — chip auto-discovery for a new snippet (2 min)

This validates the v2 surface's "lower floor" property — every action snippet you author becomes a chip automatically.

1. In Obsidian, create a new file `~/forge-vaults/smoke-v0.2.13/forge-moda/my_test_chip.md` with this content:

   ```markdown
   ---
   type: action
   inputs: []
   description: "Smoke Test D — auto-discovery surface check"
   ---

   # English

   Print "Smoke D".

   # Python

   ```python
   def compute(context):
       print("Smoke D")
   ```
   ```

2. Cmd+P → "Forge: Refresh chip palette".
3. **Expected:** chip palette now includes a `My test chip` chip in a `(library)` group at the end (since this snippet isn't in any v2 override).
4. Click the chip → `Do [[my_test_chip]]().` insertion lands in the currently-active action snippet.
5. Clean up: delete `forge-moda/my_test_chip.md`.
6. **Pass:** new snippet appears in palette without any `_chips.md` edit, B7.1 insertion form.

### Done criteria

- Test A passes → migration fires + backup preserved + v2 in place.
- Test B passes → v2 palette surface is live (the chip-palette-schema-v2 adoption finally works in cohort vaults).
- Test C passes → idempotency (no migration on subsequent reloads, no extra backups).
- Test D passes → auto-discovery works for new snippets (the "lower floor" Mission property).

If any test fails, paste the test letter + step number + what you saw vs expected.

### What this unblocks

The `chip-palette-schema-v2-adoption` feedback §4 cohort-vault gap is now closed. Every cohort student installing v0.2.52+ will see:
- The migration log on first boot post-upgrade (one-time).
- The v2 palette surface working (B7.1 insertions, curated groups, auto-discovery for their own snippets).
- Idempotent re-runs (no migration spam).

Students with hand-edited v1 `_chips.md` files (rare but possible — Tamar might be the only one) can diff `_chips.md.bak.v1` against the new v2 file and port any customizations into the v2 `overrides[]` block manually.

---

**Audit-trail close:** prompt moves to `prompts/done/`. Next drain is queue-driven.

**Standing followups (4 open):**
1. ~~chip-v2 cohort fix path~~ — DONE (this drain).
2. release.sh duplicate-invocation wart (add `git tag -l` short-circuit) — pending.
3. forge-music v2 `_chips.md` — their lane's drain.
4. percussion-lab PREVIEW disposition (forge-music + forge uncommitted state) — your call.

Plus (cc) glue-to-pure-core audit candidates flagged across the v0.2.4x arc.
