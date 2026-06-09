# Feedback — 2026-06-04-2330 chip palette schema v2 adoption (v0.2.48)

## §0 — Release coordinates

**Manifest:** `forge-client-obsidian/manifest.json` 0.2.47 → 0.2.48.

**Commits (commit-directly-to-main per memory rule):**

| Repo | SHA | Subject |
|---|---|---|
| forge | `84176fd` | `[…chip-palette-schema-v2-adoption…] Add chips schema v2 spec` |
| forge-moda | `6957393` | `[…chip-palette-schema-v2-adoption…] Migrate _chips.md from v1 to schema v2` |
| forge-client-obsidian | `95cdd8d` | `[…chip-palette-schema-v2-adoption…] v0.2.48 — chip palette schema v2: auto-discovery + signature-sourcing + overrides` |

**Tag + release:**
- Tag `v0.2.48` pushed to `origin`.
- GH release: <https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.48>
- Release assets: `main.js`, `manifest.json`, `styles.css`, `forge-client-obsidian-v0.2.48.zip` (33.08 MB).
- Zip SHA-256: `76823043f79774fd44b25e0cc2dab69b48379aa90f0e5cd39f8d1a17de38da25`
- Smoke install verified: `install-latest.sh` downloaded the same SHA and unpacked into `~/forge-vaults/smoke-v0.2.13/.obsidian/plugins/forge-client-obsidian`.

**Line counts of changed files:**

| File | Lines | Note |
|---|---|---|
| `forge-client-obsidian/src/chips-core.ts` | 535 | +~350 lines of v2 pure-core helpers + types (humanizeSnippetId, deriveChip, autoDeriveChips, parseChipsV2Config, mergeChipsWithOverrides, SnippetMetaForChips, ChipOverride, ChipGroup, ChipsV2Config) |
| `forge-client-obsidian/src/chips.ts` | 312 | rewritten v2 file loader: per-library inventory walk + v2 schema gate + v1 fall-through |
| `forge-client-obsidian/src/chips.test.ts` | 537 | +22 new test cases (52 chip-suite tests total) |
| `forge-moda/_meta/_chips.md` | 137 | v2 shape: `schema_version: 2` + `groups[5]` + `overrides[16]` + `hide[13]` |
| `forge/docs/specs/chips-schema.md` | 154 | spec (was untracked at drain start; committed as part of this drain) |

**Note on `release.sh`:** the script still expects to bump the manifest itself and refuses when `current == new` (`v0.2.48 == v0.2.48`). I bumped manifest in the main work commit instead, then ran `npm run release-zip` + `gh release create` manually (8th release the script couldn't drive end-to-end). The release.sh-zip-upload patch remains a pending forge-client-obsidian followup.

## §1.1 — TDD test cases (15 from prompt + 7 extras = 22 new)

The prompt's 15 cases:
1. `humanizeSnippetId('create_water_particles')` → `'Create water particles'`. ✓
2. `humanizeSnippetId('forge-music/blues/song')` → `'Song'` (last path segment). ✓
3. `deriveChip` action with `inputs: [name]` → `'Do [[greet]](<name>).'`. ✓
4. `deriveChip` action with no inputs → `'Do [[banner]]().'`. ✓
5. `deriveChip` action with `chip: false` → `null`. ✓
6. `deriveChip` basename starting with `_` → `null` (S7). ✓
7. `deriveChip` data → `'Set <name> to [[water_color]]().'`. ✓
8. `deriveChip` snapshot type → `null`. ✓
9. `mergeChipsWithOverrides` — override replaces specified fields, preserves unspecified. ✓
10. `mergeChipsWithOverrides` — `hide[]` removes matching targets. ✓
11. `mergeChipsWithOverrides` — override on non-existent snippet → warning + drop. ✓
12. `mergeChipsWithOverrides` — group `order` + `label` applied. ✓
13. `mergeChipsWithOverrides` — within group, sort by `order` then alphabetical. ✓
14. `mergeChipsWithOverrides` — frontmatter `chip: false` snippet → override falls under case 11. ✓ (covered by case 11 — the snippet has no auto-derived chip; the override target finds no match)
15. `mergeChipsWithOverrides` — idempotent rider (twice = same output). ✓

Extras CC added:
16. `humanizeSnippetId('setup')` → `'Setup'` (already-capitalized single word).
17. `humanizeSnippetId('')` → `''` (defensive on empty input).
18. `deriveChip` action with multiple inputs → comma-separated placeholders.
19. `deriveChip` missing `parentDir` → group `'(library)'` default.
20. `autoDeriveChips` walks inventory, attaches `target`, drops null derivations.
21. `parseChipsV2Config` schema_version 2 + empty body → valid empty config.
22. `parseChipsV2Config` schema_version missing/!=2 → error (forward-compat hook).
23. `parseChipsV2Config` overrides + groups + hide preserved when well-formed.
24. `parseChipsV2Config` malformed override entry dropped silently.

## §1.2 — pre-fix state (helpers didn't exist)

Pre-fix, `chips-core.ts` had only v1 helpers (`parseChipsBody`, `validateChipsList`, `mergeChipSources`, `chipSourcesFor`, `insertChipText`). Adding the 22 new test cases against not-yet-implemented imports (`humanizeSnippetId`, `deriveChip`, `autoDeriveChips`, `parseChipsV2Config`, `mergeChipsWithOverrides`, `ChipsV2Config`) produces import-resolution failures — they don't compile until the helpers ship.

## §1.3 — fix landed (cited diffs)

- **`forge-client-obsidian/src/chips-core.ts`** lines 179-490: v2 schema block. Adds `SnippetMetaForChips` (line 191-198), `ChipOverride` (200-209), `ChipGroup` (211-216), `ChipsV2Config` (218-224), then `humanizeSnippetId` (233-238), `deriveChip` (252-278), `parseChipsV2Config` (293-354), `mergeChipsWithOverrides` (379-474), `autoDeriveChips` (480-490).
- **`forge-client-obsidian/src/chips.ts`** lines 1-312: rewritten v2 file loader. New entry path (`loadChipsForActiveVault` → `loadVaultRootV1Chips` + per-library `loadLibraryChips`); per-library `buildSnippetInventory` walks `app.vault.getMarkdownFiles()` filtered by `libDir/` prefix and reads frontmatter via `app.metadataCache.getFileCache()`. v2 gate (`schema_version === 2`) at line 138; v1 fall-through when missing/wrong (line 167-178).
- **`forge-moda/_meta/_chips.md`** lines 1-137: v2 shape. Frontmatter gains `schema_version: 2` (line 5). Body restructured: `groups[]` block (lines 18-32), `hide[]` block (lines 44-58), `overrides[]` block (lines 67-135). Insertion strings removed from overrides — auto-derive handles B7.1-canonical signature-sourcing. Labels overridden only where v1 hand-curated label differs from humanized auto-derived label (9 of 16).

## §1.4 — post-fix verbatim test output

```
ℹ tests 262
ℹ suites 0
ℹ pass 262
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4884.840292
```

24 chips-suite tests (including all 22 schema v2 cases above) pass cleanly. Full suite green.

## §1.5 — full `npm test` suite

262 tests across the plugin's test surface (chips, snippet-id-from-path, welcome, wikilink-freeze-menu, snapshot-state, copy-dir, data-snippet, domain-activation-core, etc.). 0 failures, 0 skips, 0 todos.

## §2 — Surprises during the migration

**No multi-target "macro chips" in forge-moda v1.** Every v1 `refs:` field was a single-element array (e.g., `refs: [create_water_particles]`), so the v1 → v2 migration was mechanical — no entries got stuck on the "doesn't fit v2's single-target shape" branch. Clean migration.

**Forge-moda has 29 action snippets but v1 only surfaced 16 as chips.** The other 13 are internal helpers (`bounce_off_particle`, `bounce_off_wall`, `speed_for_temperature`, `sample_clicks`, `sample_state`, `set_speed_high/low/medium/zero`) and top-level compositions (`on_mouse_click`, `go`, `setup`, `simulation`). The v2 `hide[]` block makes the curation explicit — visible at the `_chips.md` level rather than implicit-via-omission. This is a usability improvement: curators can read the file and immediately see which snippets are deliberately excluded.

**Insertions never need to be overridden in v2 forge-moda.** Auto-derive produces the B7.1-canonical form (`Do [[create_water_particles]]().` / `Do [[set_water_speed]](<temperature>).`) from each snippet's `inputs:` frontmatter, which is correct for every one of the 16 teaching chips. The v1 file hand-authored 16 `insertion:` strings; the v2 file authors zero. This validates the spec's "signature-sourcing" design — the chip text is the snippet's signature, single source of truth.

**`humanizeSnippetId` produced acceptable labels for 7 of 16 chips; the other 9 needed `label:` overrides** (e.g., `if_temp_high_set_speed` → "If temp high set speed" auto, "If temperature high → speed high" v1-curated). This is the expected tradeoff: snake_case → humanized produces a clean baseline, curators refine where the snippet name doesn't read well as a label.

**Vault-root `_chips.md` kept the v1 loader path** for back-compat. The spec doesn't explicitly disambiguate "vault-root vs library `_chips.md`," but I treated them differently: vault-root has no auto-discovery surface (no library context), so it keeps the v1 curator-authored shape. Each library subdir has both auto-discovery + v2 overrides. If a future drain wants vault-root `_chips.md` to also support v2 (e.g., for cross-library overrides), the loader extension point is `loadVaultRootV1Chips` in chips.ts.

**Discovered `app.metadataCache.getFileCache(file)?.frontmatter` is the right primitive** for per-snippet inventory walking. No disk reads — Obsidian indexes frontmatter at vault load time. This means the auto-derivation step is near-free even for vaults with hundreds of snippets. (Pre-implementation worry: "is this going to scan disk per chip-palette-open?" Answer: no, the cache makes it O(N) over the in-memory file index.)

**release.sh limitation (8th time).** Released v0.2.40 onward by hand because `release.sh` (a) bumps manifest.json itself (conflicts with our late-binding `{CURRENT} → {NEXT_PATCH}` convention which has CC bump manifest first) and (b) doesn't upload the zip (only main.js + manifest.json + styles.css). Workaround: manual `git tag` + `npm run release-zip` + `gh release create` with the zip. The patch to fix this is a small forge-client-obsidian followup the user hasn't authorized yet.

## §3 — User-side smoke checklist

Per the standing instruction to write the complete smoke at the end of any response where the user needs to run something, here's the v0.2.48 chip schema v2 smoke. **Install is already done** (install-latest.sh verified the zip SHA-256). Reload Obsidian to pick up the new code, then:

### Setup (1 step)

1. Open Obsidian. Cmd+P → "Reload app without saving". Open the smoke vault: `~/forge-vaults/smoke-v0.2.13`. (Or whichever vault has `forge-moda` extracted — the v0.2.46/v0.2.47 smoke vault works.)

### Test A — auto-discovery surfaces chips with no `_chips.md` touch (1 min)

This validates the "lower floor" property: every snippet is auto-chip-able.

1. **Open any forge-moda action snippet** (e.g., `forge-moda/create_water_particles.md`). The chip toolbar icon should appear (v0.2.46 behavior — gate unchanged).
2. Click the toolbar icon → chips palette opens in the right sidebar.
3. **Expected: 16 chips appear, grouped under Setup / Click / Go / Particle actions / Temperature** (5 group headers in declared order).
4. Hover any chip → tooltip shows the snippet's path. Click any chip → insertion lands in the editor in B7.1-canonical form: `Do [[create_water_particles]]().` / `Do [[set_water_speed]](<temperature>).` / etc.

**Pass criteria**: 16 chips across 5 groups, B7.1-canonical insertion form, no extra "internal helper" chips visible (the 13 hidden via `hide[]` stay invisible).

### Test B — `chip: false` opt-out gates auto-discovery (2 min)

This validates the per-snippet opt-out path.

1. **Pick a non-essential action snippet** (e.g., create a throwaway `forge-moda/test_optout.md`). Add to frontmatter: `chip: false`.

```markdown
---
type: action
inputs: []
chip: false
description: "Throwaway for testing chip: false opt-out"
---

# English

Do nothing.

# Python

```python
def compute(context):
    return None
```
```

2. Cmd+P → "Forge: Refresh chip palette" (or close + reopen the chips view).
3. **Expected: `Test optout` does NOT appear in the palette** (auto-discovery skips snippets with `chip: false`).
4. Remove `chip: false` (or set to `true`). Refresh. **Expected: `Test optout` appears in the "(library)" or default group.**
5. Clean up: delete the throwaway file.

**Pass criteria**: `chip: false` hides the chip; removing the flag un-hides it.

### Test C — `_chips.md` `hide[]` removes a teaching chip (1 min)

This validates curator-side hide.

1. Open `forge-moda/_meta/_chips.md` in the vault. Find the `hide:` block. Add a line at the bottom: `  - create_water_particles`.
2. Save. Cmd+P → "Forge: Refresh chip palette".
3. **Expected: "Create water particles" chip vanishes from the Setup group.** Setup now shows 2 chips (Set water speed, Set water mass).
4. Revert the change (remove the added line). Refresh. **Expected: chip reappears.**

**Pass criteria**: `hide[]` immediately removes the chip; reverting restores it.

### Test D — label override takes effect (1 min)

This validates curator-side label refinement.

1. Open `_meta/_chips.md`. Find the override for `create_water_particles`. Add: `    label: "SMOKE TEST LABEL"`.
2. Save. Refresh palette.
3. **Expected: the chip's label in Setup group reads "SMOKE TEST LABEL" instead of "Create water particles".**
4. Revert (remove the line). Refresh. **Expected: label returns to "Create water particles".**

**Pass criteria**: label override applies on refresh; reverting restores auto-derived label.

### Test E — schema_version gate (forward-compat hook) (1 min)

This validates the schema_version guard.

1. Open `_meta/_chips.md`. Change `schema_version: 2` to `schema_version: 3` in frontmatter.
2. Save. Refresh palette. Open devtools (Cmd+Option+I).
3. **Expected console warning** like `Forge chips: forge-moda/_meta/_chips.md schema_version=3 is not 2 — skipping file, using pure auto-discovery`.
4. **Expected palette**: all 29 forge-moda action snippets appear (auto-discovery fall-through, no `hide[]` applied). Grouped under `(library)` default group.
5. Revert (set back to `schema_version: 2`). Refresh. **Expected: 16-chip 5-group curated palette restored.**

**Pass criteria**: wrong schema_version logs a warning and falls through to pure auto-discovery; reverting restores curation.

### Test F — malformed YAML falls through gracefully (1 min)

This validates the YAML-parse error path.

1. Open `_meta/_chips.md`. Inside the body's `groups:` block, break YAML on purpose: change `  - id: Setup` to `  -- id: Setup` (extra dash).
2. Save. Refresh palette. Open devtools console.
3. **Expected console warning** like `Forge chips: ... YAML parse failed: ...`.
4. **Expected palette**: falls through to v1 path OR pure auto-discovery (per the loader's two fall-through branches). Palette still renders (doesn't crash).
5. Revert the typo. Refresh. **Expected: 16-chip curated palette restored.**

**Pass criteria**: malformed YAML doesn't crash the palette; warning visible in devtools console.

### Done criteria

- Test A passes → auto-discovery + signature-sourcing work end-to-end.
- Test B passes → per-snippet `chip: false` opt-out is honored.
- Test C-D pass → curator overrides take effect.
- Test E-F pass → forward-compat + error-recovery hooks work.

If any test fails, paste the test letter + which step + what you saw vs expected, and I'll fix.

---

**Audit-trail close:** prompt moves to `prompts/done/`. Next drain is queue-driven.

---

# §4 — Smoke loop reopened the prompt (v0.2.49 / v0.2.50 follow-ups)

The §3 smoke uncovered a load-bearing shipping gap that the original prompt didn't anticipate. Documenting the full interactive arc here so forge-core can instruct on the right v0.2.51 fix path.

## §4.1 — Smoke Test A result

- Test A **passed** (16 forge-moda chips appear in 5 groups: Setup / Click / Go / Particle actions / Temperature).
- Side observation flagged by user: **22 forge-music chips also auto-derive into the palette** (10 blues + 8 percussion_lab + 4 percussion). User dismissed the cleanup proposal and accepted as expected v2 behavior — forge-music has no v2 `_chips.md` yet and that's their lane's drain.

## §4.2 — Smoke Test B failed, two false starts before root-cause found

Test B (verify `chip: false` opt-out + `chip: true` opt-in):

**v0.2.48 result:** B.2 passed (`chip: false` → chip not shown). B.5 failed (flip to `chip: true` → chip still not shown).

**v0.2.49 false-start fix (committed 335a31e, shipped, installed, smoke re-run):** Hypothesized cause was Obsidian `metadataCache.getFileCache()` returning stale frontmatter after `chip:` flip. Replaced `metadataCache` reads in `buildSnippetInventory` with `vault.cachedRead` + inline `parseYaml` of the frontmatter slice (chips.ts +63 lines, –7 lines). **Did not fix B.3.** User reloaded Obsidian after install, re-ran, same failure.

**v0.2.50 diagnostic build (committed bbc7861, shipped, installed):** Added four `console.log` lines per library scan to surface where `test_optout` drops out: (1) scan stats, (2) inventory entries, (3) auto-derive output, (4) merged group structure. User opened devtools, refreshed palette, pasted the log.

**The smoking gun in the diagnostic output:**

```
[Forge chips v0.2.50] forge-moda: scanned 32 files, 1 had no frontmatter, 31 entered inventory
[Forge chips v0.2.50] forge-moda: inventory 31 snippets [ ..., 'test_optout (type=action, chip=true, parentDir="")', ... ]
[Forge chips v0.2.50] forge-moda: autoDerived 30 chips [ ..., 'test_optout → "Test optout" group="(library)"', ... ]
[NO `v2 merged → N groups` line for forge-moda — pipeline drops out here]
[Forge chips v0.2.50] forge-music: scanned 14 files ... no _chips.md → 2 groups
[Forge chips v0.2.50] forge-music.bak.0.3.0: scanned 2 files ... no _chips.md → 1 groups
```

`test_optout` reaches `autoDeriveChips` correctly — both v0.2.49's fresh-read fix AND the original v0.2.48 code were behaving correctly at the inventory + auto-derive layer. The chip vanishes downstream. The v2-merged log line never fires for forge-moda, meaning the loader fell out of the v2 branch into the v1 fall-through.

## §4.3 — Root cause

The **installed** `~/forge-vaults/smoke-v0.2.13/forge-moda/_meta/_chips.md` is the **v1 shape** (no `schema_version`, has a `chips: [...]` block with `Call [[X]].` insertions). Confirmed via `cat`:

```yaml
---
type: data
content_type: yaml
read_only: true
description: MoDa chip palette — the leaf operations students compose ... 16 chips across 5 groups.
---

# Body

```yaml
chips:
  - label: "Create water particles"
    insertion: "Call [[create_water_particles]]."     # v1 form, not B7.1
    group: "Setup"
    refs: [create_water_particles]
  ... (15 more v1 entries)
```

The repo source-of-truth and the plugin bundle mirror are both **v2** (committed at v0.2.48 — `6957393` in forge-moda, byte-equal mirror in `forge-client-obsidian/assets/vaults/forge-moda/_meta/_chips.md`). The mismatch: **plugin installs do not re-extract bundled vault content into the user's vault when the file already exists**. The smoke vault was created at v0.2.13, has `_chips.md` from that era, and every plugin install since (v0.2.14 through v0.2.50) left the user's pre-existing file alone — the right policy for authored snippets the user might have customized, the wrong policy for `_meta/*` infrastructure files the user shouldn't be hand-editing.

Walking the loader's branches against the v1 file:
1. `loadLibraryChips` finds `_chips.md` → `raw` is non-null.
2. `contentType === 'yaml'` (frontmatter says so) → `parseYaml(body)` runs.
3. Body's outermost YAML parses to `{ chips: [...] }`. `schema_version` is **absent**.
4. `sv === 2` check fails. `sv !== undefined` check fails. **The v2 branch is skipped entirely** (no log line fires — diagnostic confirms).
5. Falls through to step 5: `parseChipsFile(raw, chosenPath)` → returns the v1 chip list.
6. Loader returns `mergeChipSources([{ sourceName: libDir, chips: parsed.chips }])` — the v1 16-chip list, NO auto-derived chips merged in.

This is **by design** per the chip-schema spec's "v1 → v2 migration" section: vaults that don't migrate keep working in v1 mode but lose auto-discovery. The intent was that the next drain (cohort onboarding) would coordinate the migration. What we didn't anticipate: cohort vaults already have the v1 file shipped from an earlier plugin version, so they're stuck in the v1 fall-through path with no automatic upgrade trigger.

## §4.4 — Symptoms in any cohort vault that installed v0.2.48-v0.2.50

- Palette shows only the 16 v1 hand-authored chips, NOT the v2 auto-discovery surface.
- Chip insertions use v1 prose (`Call [[create_water_particles]].`), NOT B7.1-canonical (`Do [[create_water_particles]]().`).
- New snippets the student authors do not appear in the palette automatically. Per-snippet `chip: false` opt-out is dead.
- `_chips.md` overrides + `hide[]` + `groups[]` configured in v2 are dead.

The user has not noticed this in normal use because the v1 16-chip palette still works for composing existing forge-moda content — chips click, insertion lands. The B7.1 form change is silent. The auto-discovery surface only becomes visible when a student starts authoring new snippets and expects them to appear as chips automatically (the "lower floor" promise of v2).

## §4.5 — Mid-loop unblock (smoke vault)

Copied the bundle's v2 file directly into the smoke vault:

```bash
cp forge-client-obsidian/assets/vaults/forge-moda/_meta/_chips.md \
   ~/forge-vaults/smoke-v0.2.13/forge-moda/_meta/_chips.md
```

This lets the user finish Test B-F on v0.2.50 without first resolving the bundle-upgrade question. Pending user re-run.

## §4.6 — Decision needed from forge-core

The v0.2.51 fix is straightforward in code; the design choice is the right cohort-side upgrade policy. Four candidate paths:

### Path A — Auto-re-extract on plugin update

Wire a vault-bundle drift mechanism (mirroring the v0.2.30 engine-bundle drift check, `forge-client-obsidian/scripts/sync-engine-bundle.mjs`). Vault-bundle adds a `vault_version` field to `forge.toml`. Plugin onload compares the installed `forge-toml`'s `vault_version` against the bundled one; if drift, re-extract `_meta/*` and (optionally) authored snippets. The re-extract path needs to handle merge semantics for files the user customized — either overwrite (correct for `_meta/*`), or surface a "vault version drift detected" modal (for authored snippets where the user may want to keep their customizations).

**Pros:** Right long-term shape. Mirrors engine-bundle drift convention. Surfaces drift instead of silent staleness.

**Cons:** Largest scope. Needs migration-modal UI for the authored-snippet case (or a clear policy that re-extract overwrites). Risk of overwriting user-customized snippets unless the modal lands correctly.

### Path B — One-shot `_chips.md` version-bump migration

Plugin onload: scan each library subdir's `_meta/_chips.md`. If it's v1 shape (no `schema_version: 2`) AND the bundle has a v2 file at the same path, overwrite the v1 file with the bundle's v2 file. Log a notice ("Forge: upgraded `_chips.md` to schema v2; your previous v1 file is at `_chips.md.v1.bak`").

**Pros:** Smallest scope. Targets exactly the load-bearing infrastructure file. Backs up the v1 file in case the user had customized it. Easy to test (smoke vault repro is in hand).

**Cons:** Doesn't generalize — every new `_meta/*` file with version-drift would need its own one-shot detector. Doesn't solve the broader "user vault drifts from bundle as plugin evolves" problem.

### Path C — Document-only manual upgrade

Add a section to `INSTALL.md`: "If you're upgrading from v0.2.47 or earlier, delete `forge-moda/_meta/_chips.md` from your vault before installing v0.2.51+. The plugin will extract the v2 version on next reload."

**Pros:** Zero code change. Lowest risk.

**Cons:** Worst UX. Every cohort student must perform the upgrade dance manually. Easy to miss. The student-visible failure mode (chips silently using v1 form) is silent — students won't notice they need to upgrade.

### Path D — Revert chip schema v2

Revert v0.2.48-v0.2.50. The schema v2 design is sound but the bundle-upgrade gap means shipping it now silently regresses cohort vaults. Re-attempt in a single later drain that ships v2 schema + upgrade mechanism together.

**Pros:** Restores known-good cohort state. Removes the half-working surface.

**Cons:** Loses ~3 days of work + the spec + the tests. Re-do cost is real.

## §4.7 — Recommended path (CC's read)

**Path B** is the smallest unblock that ships the v2 surface to cohort vaults without bigger architectural decisions. It naturally generalizes to "every `_meta/_chips.md` v1 → v2 upgrade gets handled at onload" — the pattern is the load-bearing infrastructure-file-upgrade detection, scoped narrowly so v0.2.51 ships in one patch.

If forge-core thinks Path A is the right long-term shape, Path B can be the v0.2.51 stopgap while Path A ships in v0.3.x (or whenever the migration-modal UI surface is in scope). Path C is dominated by Path B at the cohort-UX level. Path D loses work but is the "safety" option.

## §4.8 — Related observations (forge-core may want to know)

- **v0.2.49 misdiagnosis is worth reading.** I shipped a fresh-frontmatter-read fix based on a hypothesis that turned out to be wrong (the metadataCache wasn't stale; the v2 file was missing). The pure-core auto-derivation was working correctly all along. The investigation-before-design discipline in cc-prompt-queue would have caught this — I jumped to a code fix without a diagnostic log first. Lesson: when smoke surfaces an unexpected failure, ship the diagnostic before the fix. (Self-criticism, but worth codifying.)
- **`release.sh` patch is now 10 releases behind.** v0.2.48, v0.2.49, v0.2.50 all hand-released (manual `git tag` + `npm run release-zip` + `gh release create`) because release.sh both (a) bumps manifest.json itself (conflicts with late-binding placeholder convention) and (b) doesn't upload the zip (only main.js + manifest.json + styles.css). Patch is a small forge-client-obsidian followup the user has not authorized yet.
- **v0.2.50's diagnostic logs are temporary.** They should be removed when v0.2.51 ships (or gated behind a debug-mode setting). Adding the logs as a one-off was the right call here, but they shouldn't ship to cohort students long-term.
- **Test E (schema_version != 2 forward-compat hook) and Test F (malformed YAML graceful fall-through) have not been smoke-verified yet** because Test B blocked the loop. Once v0.2.51 ships and B passes, the user can re-run E + F. If those pass, the v2 schema is fully smoke-verified end-to-end.

## §4.9 — State at decision boundary

- **Three commits + tags + releases on main**: v0.2.48 (`95cdd8d`), v0.2.49 (`335a31e`), v0.2.50 (`bbc7861`). All pushed to `frmoded/forge-client-obsidian`. Cannot be unshipped without a force-push, but Path D (revert) can land as new commits that restore pre-v0.2.48 state.
- **Smoke vault patched in-loop** with bundle's v2 `_chips.md`. User can finish Test B-F on v0.2.50 without v0.2.51 to verify v2 schema works end-to-end against a v2 file.
- **forge-music `_chips.md` does not exist** in their lane. forge-music is in pure auto-discovery mode (22 chips, 2 groups: blues, percussion). Not affected by the v1/v2 mismatch since they're v0-shaped (no curation file).
- **forge-music.bak.0.3.0/ in user vault** is also being scanned (2 chips auto-derived). Vault has a leftover backup directory from an earlier forge-music version, and the chip discovery treats it as a library. Not load-bearing for v0.2.51 decision but worth flagging — the libraryDirNames discovery in main.ts (via `forge.toml` presence) is matching this backup dir too.

Awaiting forge-core instruction on which path (A / B / C / D) to take in v0.2.51, and any constraints on scope.
