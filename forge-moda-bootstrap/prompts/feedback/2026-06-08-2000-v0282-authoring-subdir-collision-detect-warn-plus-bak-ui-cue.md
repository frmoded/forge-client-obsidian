---
timestamp: 2026-06-08T21:00:00Z
session_id: drain-2026-06-08-2000
prompt_modified: 2026-06-08T20:00:00Z
status: shipped
---

# v0.2.82 — AUTHORING subdir collision warn + .bak directory UI cue

## §0 — Release coordinates

- **Released**: `forge-client-obsidian` v0.2.82 (bumped from v0.2.81 as expected).
- **Tag**: `v0.2.82` (`https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.82`)
- **forge-moda bump**: none.
- **forge-music bump**: none.
- **forge-tutorial bump**: picked up source 0.1.1 → 0.1.2 via the parametric sync (slots chapter content updates from the source-side bump).
- **forge commits**:
  - `0624adf` — Item A: AUTHORING-vault basename collision detect-and-warn + deterministic scan order.
- **forge-client-obsidian commits**:
  - `<plugin-bundle>` — engine bundle resync + Item B `.bak` path-core + Notice + CSS de-emphasis + forge-tutorial 0.1.2 pickup.
  - `5fdd5c2` — Release v0.2.82.
  - `9f96b4b` — INSTALL.md bump 0.2.81 → 0.2.82.

## §1 — Investigation findings

### §1.1 — Item A: collision detection site

Found at `_index_authoring_file` (snippet_registry.py:391). The function writes `_vaults[vault_name][bare_id] = entry` unconditionally — same-basename files in different subdirs (e.g. `notes/chorus.md` AND `songs/chorus.md`) silently shadow each other depending on directory traversal order. `os.walk`'s default order is filesystem-dependent, so the resolution was also non-deterministic across rescans.

### §1.2 — Item B: Obsidian file-tree DOM

Confirmed via grep against `obsidian.d.ts` — no documented hook for file-tree styling. The community-plugin pattern uses CSS attribute selectors against `.nav-folder-title[data-path*=...]` and `.nav-file-title[data-path*=...]`. These DOM nodes are stable across recent Obsidian 1.x versions per smoke verification. Per §2.2 of the prompt, "Manual visual check during cohort smoke catches it" if the DOM ever changes silently.

For the Notice trigger: `workspace.on('file-open', file => ...)` already used at line 320 of main.ts (the `maybePreviewDataSnippet` path). Mirrored the pattern.

### §1.3 — Cross-cutting

The pure-core `bak-path-core.ts` mirrors the engine-side `_BAK_DIR_PATTERN` regex (`\.bak\.`) exactly. Pattern matches both `<name>.bak.<ver>` and the v0.2.78 collision-suffix `<name>.bak.<ver>.<n>` variant — keeps the two layers in lock-step.

## §2 — TDD continuity

### Item A (engine)

1. **Failing tests first** (`tests/core/test_snippet_registry_collision.py`): 5 cases — no-collision, collision-fires-warning + first-match-wins, dedup-on-rescan, library-not-affected, multiple-collisions-each-warn-once.
2. **Pre-fix**: import error (`_collision_warning_set` not defined). After defining the module-scoped set: collision tests fail because no warning fires.
3. **Fix**: in `_index_authoring_file`, check `existing = self._vaults[vault_name].get(bare_id)` before write. When existing is non-None AND its `path` differs from the current `filepath` (via `os.path.abspath`), warn + return without overwriting. Same-path re-index (refresh_file path) bypasses the check. `_collision_warning_set` is keyed `(vault_name, bare_id)` for dedup.
4. **Determinism fix**: added `dirs.sort()` + `sorted(files)` to `scan()` so traversal order is deterministic across rescans. Otherwise first-match-wins isn't stable.
5. **Mid-fix regression**: `tests/core/test_refresh_file_library_vault_investigation.py::test_refresh_file_authoring_vault_top_level_file_still_refreshes_correctly` failed because the collision check fired on the legitimate refresh path. Resolved by abspath comparison.
6. **Post-fix**: 5/5 collision tests pass; 268/268 forge core tests pass.

### Item B (plugin)

1. **Failing tests first** (`src/bak-path-core.test.ts`): 16 cases — `isBakPath` (8: path-in-bak-dir, regular-dir, nested-bak-dir, file-with-bak-in-basename-only, empty/null/undefined, top-level-bak, collision-suffix), `bakDedupKey` (5), `baseLibraryName` (4).
2. **Pre-fix**: helpers don't exist, build fails.
3. **Fix**: `src/bak-path-core.ts` exports the three helpers. Pattern matches `\.bak\.` only in directory segments, not in file basenames.
4. **Wiring**: `main.ts` gets `_bakNoticeSeenSet: Set<string>` instance member + `maybeNotifyBakOpen(file)` handler bound to `workspace.on('file-open', ...)`. Dedup by `bakDedupKey(file.path)`. Notice text uses `baseLibraryName` to show the live counterpart path.
5. **CSS**: `styles.css` adds three rules — `.nav-folder-title[data-path*=".bak."]` + `.nav-file-title[data-path*=".bak."]` get opacity 0.55; folder gets " (backup)" suffix via `::after`; file gets strike-through.
6. **Post-fix**: 16/16 bak-path-core tests pass; plugin suite 554/554 passing (was 538 + 16 new).

## §3 — User-side smoke checklist (per §5 of prompt)

```
# Step 1 — install v0.2.82 zip into ~/forge-vaults/<vault>/.

# Step 2 — Item A reproduction (collision warn):
mkdir -p ~/forge-vaults/bluh/notes ~/forge-vaults/bluh/songs
printf '%s\n' '---' 'type: action' 'inputs: []' '---' '' '# English' '' 'First chorus.' \
  > ~/forge-vaults/bluh/notes/chorus.md
printf '%s\n' '---' 'type: action' 'inputs: []' '---' '' '# English' '' 'Second chorus.' \
  > ~/forge-vaults/bluh/songs/chorus.md
# Reload Obsidian; open DevTools console.
# Expected: ONE warning naming both files + which one wins.
# Click [[chorus]] → resolves to notes/chorus.md (alphabetical order).
# Reload → warning fires ONCE more (new session).

# Step 3 — Item B reproduction (.bak UI cue):
ls -d ~/forge-vaults/bluh/forge-tutorial.bak.* 2>/dev/null
# If absent, create one:
cp -r ~/forge-vaults/bluh/forge-tutorial \
      ~/forge-vaults/bluh/forge-tutorial.bak.0.1.0
# Reload Obsidian.
# Visual: forge-tutorial.bak.0.1.0/ in the file tree shows reduced
#   opacity + " (backup)" suffix. Files inside shown struck-through.
# Click any file under forge-tutorial.bak.0.1.0/.
# Expected: Notice fires ONCE explaining the backup. Click another
# file under the same .bak — Notice does NOT re-fire.

# Step 4 — cleanup:
rm ~/forge-vaults/bluh/notes/chorus.md ~/forge-vaults/bluh/songs/chorus.md
rmdir ~/forge-vaults/bluh/notes ~/forge-vaults/bluh/songs
# Leave .bak.* in place — v0.2.78's filter handles it.
```

## §4 — Auto-smoke results

- forge core: **268 passing** (was 263 + 5 new). Engine suite total: 642 passing (one flaky LLM-API test passes in isolation; transient external API issue, not related to this drain).
- plugin: **554 passing** (was 538 + 16 new).
- `npm run build`: exit 0; asset footprint 38.03 MB.
- `bash scripts/release.sh 0.2.82`: clean. Drift checks clean (engine + forge-moda + forge-music + forge-tutorial).
- Zip built, tag pushed, GH release created.

Deferred to user: Steps 2–3 of §3 (Obsidian + a real vault required for the visual + Notice verification).

## §5 — Open follow-ups

1. **Per-vault disambiguation prompt**: future enhancement for Item A — when user clicks `[[chorus]]` against an ambiguous basename, surface a chooser. Out of scope per prompt §6.1.
2. **Auto-purge `.bak.*` after N days**: deferred per v0.2.78 follow-up #1. If cohort accumulates many .bak directories, future drain considers auto-purge.
3. **CSS selector stability**: if Obsidian changes `.nav-folder-title`/`.nav-file-title`/`data-path` DOM structure, the styling rules break silently. Manual visual check during smoke catches it.
4. **`scan()` sort cost**: added `dirs.sort()` + `sorted(files)` per scan invocation. For a typical vault (≤ few hundred files) the cost is negligible (<1ms). If a future user has a vault with thousands of files, profiling may be needed. Not a concern today.

## §6 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §1 discharged before impl commits.
- ✓ §57–74 (TDD): failing tests first for both Item A + Item B.
- ✓ §86–118 (pure-core convention): `bak-path-core.ts` is the pure-core; Notice trigger in main.ts is the integration layer.
- ✓ §76 (don't ship speculative fix): both items have concrete user-facing justification.
- ✓ §347 (version-bump sanity check): manifest pre-bump verified at 0.2.81; explicit `bash scripts/release.sh 0.2.82` arg used.
- ✓ §321 (feedback file before move): this file exists; prompt move follows.
- ✓ Standing user rule: committed directly to main in both repos.

Per cc-prompt-queue.md §43, this is the chat summary.
