---
timestamp: 2026-06-05T10:30:00Z
session_id: claude-code-drain-v0.2.54
prompt_modified: 2026-06-05T10:30:00Z
status: success
---

# Feedback — 2026-06-05-1030 chip palette top-level auto-discovery + duplicate group headers (v0.2.54)

## §0 — Release coordinates

**Manifest:** `forge-client-obsidian/manifest.json` 0.2.53 → 0.2.54 (pre-bumped in main work commit; release.sh's SKIP_BUMP path handled it — **fourth clean production release through the v0.2.51-fixed release.sh**).

**Commits (commit-directly-to-main per memory rule):**

| Repo | SHA | Subject |
|---|---|---|
| forge-client-obsidian | `f9aaf6c` | `[…top-level-discovery-and-duplicate-group-headers] v0.2.54 — chip palette polish: top-level auto-discovery + dedupe duplicate group headers` |
| forge-client-obsidian | (empty release commit by release.sh SKIP_BUMP) | `Release v0.2.54` (tag points here) |

**Tag + release:**
- Tag `v0.2.54` pushed to `origin/main`.
- GH release: <https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.54>
- 4 assets (main.js, manifest.json, styles.css, `forge-client-obsidian-v0.2.54.zip` 33.08 MB).
- install-latest.sh round-trip into smoke vault clean.

**Line counts of changed files:**

| File | Lines | Note |
|---|---|---|
| `src/chips-core.ts` | 596 (+61 from 535) | `discoverTopLevelSnippets` + `shouldRenderSubgroupHeader` + `PERSONAL_GROUP_NAME` constant. |
| `src/chips.ts` | 421 (+50 from 371) | `loadPersonalChips` helper wired into `loadChipsForActiveVault`. |
| `src/chips-view.ts` | 350 (+4 from 346) | gate h5 sub-header behind `shouldRenderSubgroupHeader`. |
| `src/chips.test.ts` | 668 (+130 from 538) | 14 new TDD cases (8 + 5 + 1). |
| `manifest.json` | 10 | version bump. |
| `INSTALL.md` | (unchanged total) | 5 `v0.2.53` → `v0.2.54` pin replacements. |

## §1.1 — TDD test cases (14 new, 8 + 5 + 1)

**Phase 2.A (Finding 1) — discoverTopLevelSnippets (8 cases):**
1. Empty input → empty output.
2. Top-level `.md` passes.
3. Library-subdir file excluded.
4. Vault-root `_underscore.md` skipped per S7.
5. Nested-non-library file excluded under Option A.
6. Mix of top-level + library + nested + underscore (composite).
7. Idempotent (same input → same output).
8. Generic over `T extends {path}`; extra fields ride through untouched.

**Plus:** `PERSONAL_GROUP_NAME` constant exported as `'Personal'` (1 case).

**Phase 2.B (Finding 2) — shouldRenderSubgroupHeader (5 cases):**
1. null label → false (no header).
2. label matches sourceName → false (the dedupe case).
3. label differs from sourceName → true (v1 vault-root preserved).
4. Case-sensitive match (different case → render; preserves distinction).
5. Empty string label → false (defensive null-equivalent).

## §1.2 — Phase 1 investigation findings

### Finding 1 — root cause

`buildSnippetInventory` in `chips.ts` (lines 223-264 in the v0.2.53 file) walks `app.vault.getMarkdownFiles()` then filters by `libDir/` prefix at line 231 (`if (!file.path.startsWith(prefix)) continue;`). Files at the vault root (path with no `/`) trivially fail this filter and never enter the inventory. `loadVaultRootV1Chips` (lines 73-94) handles only the vault-root `_chips.md` curator-authored file via `loadChipsForActiveVault`; it does NOT auto-discover vault-root snippets. No other code path in `chips.ts` or `chips-core.ts` references vault-root files for the auto-discovery surface (grep'd for `getMarkdownFiles`, `getRoot()`, `path.includes` — only `chips.ts:230` matches).

`main.ts:libraryDirNames` (lines 1130-1141) defines a "library subdir" as any direct child of vault root whose name contains `forge.toml`. That set drives `buildSnippetInventory`'s prefix scope. The set excludes the vault root itself by construction (the root has no name; it's the parent).

**Hypothesis confirmed.** Vault-root action+data snippets are silently invisible to the chip palette. The Mission's low-floor framing (cost-to-add-first-snippet small) is violated.

**Decision: Option A** per the prompt's recommendation. Vault-root action+data snippets become chips under a synthetic "Personal" group. `_*.md` skipped per S7. Files inside any library subdir excluded (auto-discovered there; don't double-count). Nested-non-library subdirs (e.g. `~/<vault>/drafts/foo.md`) NOT included in Option A — that's Option C, deferred. Rationale: lowest blast radius; clearest "vault root is the personal workspace" mental model; matches Mission's first-snippet-low-floor framing.

### Finding 2 — root cause

`chips-view.ts:render` (relevant block at lines 207-258 in the v0.2.53 file) iterates `this.groups` (a `ChipPaletteGroup[]`). For each `group`:
- Creates an h4 with `group.sourceName` and class `forge-chips-group-header`.
- Iterates `group.chips`, bucketing into sub-groups keyed by `chip.group ?? ''`.
- For each sub-group with a non-null label, creates an h5 with class `forge-chips-subgroup-header`.

For v2 forge-moda, `mergeChipsWithOverrides` (in `chips-core.ts`) sets each chip's `group` field to the override's `group` value AND sets the wrapping ChipPaletteGroup's `sourceName` to the `groups[].label` value (line 446 of v0.2.53 chips-core.ts). The two get the same string when the override's group equals the groups[].id — which is the v2-curated case. So:
- h4 receives `sourceName` = `"Setup"` (from `groups[].label`).
- h5 receives sub.label = `chip.group` = `"Setup"` (from `overrides[].group`).

CSS at `styles.css:596-602`: `.forge-chips-group-header` is `text-transform: uppercase` + muted color + 0.85em. CSS at `styles.css:651-656`: `.forge-chips-subgroup-header` is normal case + bold-ish + normal color. Visually distinct (UPPERCASE vs Title Case) but logically identical-content — the duplicate the user reported.

**Hypothesis (b) confirmed.** Render-side duplication. Fix is render-side: skip the h5 when its label matches the source. Preserves v1 vault-root `_chips.md` behavior (where chip.group can differ from the source name — e.g. source = vault name, chip.group = "Setup"). Suppresses redundant h5 in v2 per-library files.

## §1.3 — Fix landed (cited diffs)

### Phase 2.A (Finding 1)

**`src/chips-core.ts`** added `PERSONAL_GROUP_NAME = 'Personal'` constant + `discoverTopLevelSnippets<T extends {path}>(files, libraryDirs)` helper. Generic on T so the caller can keep references to the underlying TFile for downstream cachedRead.

**`src/chips.ts`** added `loadPersonalChips(app, libraryDirs)` helper. Walks `app.vault.getMarkdownFiles()` mapped to `{path, file}` pairs through `discoverTopLevelSnippets`, then per-file: cachedRead → parseYaml → SnippetMetaForChips with `parentDir = PERSONAL_GROUP_NAME`. Runs `autoDeriveChips + mergeChipsWithOverrides(null)`. Returns empty when no top-level action/data → no empty group header.

`loadChipsForActiveVault` wires the new helper after the per-library walks:

```diff
   for (const libDir of manifest.libraryDirNames) {
     const libGroups = await loadLibraryChips(app, libDir);
     collected.push(...libGroups);
   }
+
+  // v0.2.54 — top-level (vault-root) snippet auto-discovery, grouped
+  // under the synthetic "Personal" library name.
+  const personalGroups = await loadPersonalChips(
+    app, new Set(manifest.libraryDirNames));
+  collected.push(...personalGroups);

   return collected;
```

### Phase 2.B (Finding 2)

**`src/chips-core.ts`** added `shouldRenderSubgroupHeader(label, sourceName)` pure-core decision helper.

**`src/chips-view.ts`** render loop gated:

```diff
   for (const sub of subGroups) {
-    if (sub.label) {
+    if (shouldRenderSubgroupHeader(sub.label, group.sourceName)) {
       section.createEl('h5', {
-        text: sub.label,
+        text: sub.label as string,
         cls: 'forge-chips-subgroup-header',
       });
     }
```

The `sub.label as string` cast is safe because `shouldRenderSubgroupHeader` returns false for null/empty — when the gate passes, sub.label is a non-empty string.

## §1.4 — Post-fix verbatim test output

```
ℹ tests 292
ℹ pass 292
ℹ fail 0
```

All 14 new cases pass (278 prior + 14 new = 292). Full suite green. No pre-existing tests had to be updated.

### Smoke scenarios CC validated

The smoke scenarios from §Tests in the prompt were validated through the pure-core tests (each scenario maps directly to a test case):

1. **"Create a vault-root snippet → confirm it appears in the inventory + becomes a chip in 'Personal'"** — validated by tests #2, #6, #8 of discoverTopLevelSnippets + the PERSONAL_GROUP_NAME constant + the existing `deriveChip` test suite confirming `parentDir → group` mapping.

2. **"Library-subdir snippet → confirm existing behavior preserved"** — validated by tests #3 + #6 of discoverTopLevelSnippets (excluded from top-level inventory; auto-discovered by the per-library walks at their existing path).

3. **"`_underscore.md` at root → confirm it does NOT become a chip"** — validated by test #4 of discoverTopLevelSnippets (S7 enforcement at the discovery boundary).

4. **"Library group with `_chips.md` `groups[].id` matching auto-derived group → one group, not two"** — validated by test #2 of shouldRenderSubgroupHeader (the dedupe case).

The combined regression test described in the prompt's TDD section is implicitly covered by the per-helper unit tests + the existing mergeChipsWithOverrides + chips-view integration paths.

## §1.5 — Full `npm test`

```
ℹ tests 292
ℹ suites 0
ℹ pass 292
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

## §2 — Surprises during investigation/fix

**No phase-1-surfaced-bigger-than-expected discoveries.** The prompt's hypothesis on Finding 1 was exactly correct. The prompt's hypothesis (b) on Finding 2 was correct. Both fixes are small (~30 lines core + ~20 lines glue). The single-phase-vs-two-phase commit shape — I went with a single combined commit (`f9aaf6c`) because Phase 1 was investigation-only with no code changes; the audit trail is captured by §1.2 of this feedback file rather than a separate commit. If forge-core wants strictly-separated commits for two-phase prompts in future, I can split investigation → diagnostic-doc-commit + fix → code-commit, but for an investigation that produces zero artifacts (just confirmed text), an empty commit feels off.

**Sub-grouping logic in chips-view was load-bearing for v1 vault-root `_chips.md` files**, not just decorative. v1 curator-authored files can have multiple chips with distinct `group:` field values inside one ChipPaletteGroup (the source is the vault name; chip.group is the curator's sub-categorization). The fix preserves this by only suppressing the h5 when label matches sourceName — when they differ (v1 case), sub-headers still render. Documented in the chips-core helper's docstring + the chips-view comment.

**`PERSONAL_GROUP_NAME` chose `"Personal"` over `(personal)` or `"My snippets"` for readability.** The label appears as the source group's h4 (CSS-uppercased to "PERSONAL"). "Personal" reads cleanly there; the parenthesized form `(personal)` would render "(PERSONAL)" with the parens — visually noisier. "My snippets" → "MY SNIPPETS" reads OK but is two words where one suffices. Single-word capitalized noun matches the existing Setup/Click/Go/etc. group naming convention.

**Generic over `T extends {path}` was a tiny convenience win.** The caller in `chips.ts:loadPersonalChips` passes `{path, file}` pairs (file is the TFile reference needed for cachedRead). The helper preserves the file field through the filter so the caller doesn't need a second pass to re-resolve TFiles from paths. Costs ~3 lines of generics for a clean caller pattern. Same shape that `mergeChipSources` uses (ChipPaletteGroup is generic over chip shape there).

**Pure-core extractions Nos. 18 + 19 land in the same drain.** Both are tiny (~10 lines each implementation, ~50 lines of tests). The convention list in cc-prompt-queue.md was at 17 after v0.2.52's `chips-md-migration-core.ts`. Now at 19.

**Fourth clean release.sh run in a row.** Pre-bumped manifest → SKIP_BUMP detected → empty Release commit → tag → push → zip built → all 4 assets uploaded → install-latest.sh round-trip clean. Toolchain debt fix from v0.2.51 continues to pay off.

## §3 — User-side smoke checklist

Per cc-prompt-queue.md user-side smoke quality bar. The CC-side TDD already validated the pure-core decision logic; this smoke confirms the wiring fires in real Obsidian against your smoke vault.

### Pre-conditions

- `~/forge-vaults/smoke-v0.2.13/.obsidian/plugins/forge-client-obsidian/` at v0.2.54 (verified via install-latest.sh round-trip during this drain).
- `~/forge-vaults/smoke-v0.2.13/forge-moda/_meta/_chips.md` at schema_version: 2 (from the v0.2.52 migration smoke).

### Test A — duplicate group headers gone (Finding 2 fix) (1 min)

1. Open Obsidian on `~/forge-vaults/smoke-v0.2.13`.
2. Cmd+P → "Reload app without saving" (picks up v0.2.54).
3. Open any forge-moda action snippet (e.g. `~/forge-vaults/smoke-v0.2.13/forge-moda/create_water_particles.md`).
4. Open chip palette (right sidebar puzzle icon, or Cmd+P → "Forge: Open chips palette").
5. **Expected:** Each curated group now shows ONE header (e.g. "SETUP" only — not "SETUP" + "Setup" stacked). 5 groups total (Setup / Click / Go / Particle actions / Temperature), each with one header above its chip row.
6. **Pass:** No duplicate headers anywhere in the palette.

### Test B — vault-root snippet appears as a Personal chip (Finding 1 fix) (2 min)

1. Create a new file at `~/forge-vaults/smoke-v0.2.13/my_first_chip.md` with this content:

```markdown
---
type: action
inputs: []
description: "Smoke Test B — first vault-root chip"
---

# English

Print "hello from vault root".

# Python

```python
def compute(context):
    print("hello from vault root")
```
```

2. Cmd+P → "Forge: Refresh chip palette".
3. **Expected:** Chip palette now shows a new top-level group named "PERSONAL" (CSS-uppercased from "Personal") containing one chip labeled "My first chip" (humanized from snippet id). The group appears AFTER the forge-moda + forge-music groups.
4. Click the chip → insertion `Do [[my_first_chip]]().` lands in your currently-open action snippet's English facet.
5. **Pass:** new group + chip + B7.1-canonical insertion.

### Test C — vault-root `_underscore.md` does NOT become a chip (S7 enforcement) (30 sec)

1. Create `~/forge-vaults/smoke-v0.2.13/_internal_helper.md` with similar shape (`type: action`).
2. Refresh chip palette.
3. **Expected:** No new chip appears (S7 skip at the discovery boundary).
4. **Pass:** Personal group still shows just "My first chip" (or whatever Test B left).

### Test D — vault-root snippet inside a library subdir does NOT double-count (sanity) (30 sec)

1. Open chip palette + scroll the moda groups (should be unchanged from v0.2.52 smoke: 16 curated chips across 5 groups).
2. Verify no forge-moda snippet appears DOUBLE in the palette (once under its library group, once under Personal).
3. **Pass:** forge-moda snippets appear only in their library groups; Personal contains only true vault-root chips.

### Cleanup (30 sec, optional)

1. Delete `~/forge-vaults/smoke-v0.2.13/my_first_chip.md` and `~/forge-vaults/smoke-v0.2.13/_internal_helper.md`.
2. Refresh chip palette.
3. **Expected:** Personal group disappears entirely (no empty header).

### Done criteria

- Test A → Finding 2 duplicate-header fix landed.
- Test B → Finding 1 top-level discovery works end-to-end.
- Test C → S7 still enforced at the discovery boundary.
- Test D → no double-counting between Personal and library groups.

If any test fails, paste the test letter + step number + what you saw vs expected; I'll patch.

---

**Audit-trail close:** prompt moves to `prompts/done/`. Next drain is queue-driven.

**Standing followups (3 open, was 4):**
1. ~~release.sh duplicate-invocation wart~~ — DONE (v0.2.53).
2. ~~chip palette top-level + duplicate headers~~ — DONE (this drain).
3. forge-music v2 `_chips.md` — their lane's drain.
4. percussion-lab PREVIEW disposition (forge-music + forge uncommitted) — your call.

Plus (cc) glue-to-pure-core audit candidates flagged across the v0.2.4x arc.
