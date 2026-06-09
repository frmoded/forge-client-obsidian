---
timestamp: 2026-06-07T23:00:00Z
session_id: drain-2026-06-07-2200
prompt_modified: 2026-06-07T22:00:00Z
status: shipped
---

# v0.2.78 — vault routing hotfixes (bak-dir exclusion + freeze qualifier)

## §0 — Release coordinates

- **Released**: `forge-client-obsidian` v0.2.78 (bumped from v0.2.77 as expected; explicit `bash scripts/release.sh 0.2.78`).
- **Tag**: `v0.2.78` (`https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.78`)
- **Zip SHA-256**: `b2fe62e6fd786534e5bd9bee7429201e517eb1b5b623585fe543acd4d40b7c81`
- **forge-moda bump**: none.
- **forge-tutorial bump**: none.
- **forge commits**:
  - `<phase1-investigation>` — failing reproduction tests + investigation note.
  - `39aa725` — phase 2 engine fix (Bug A + Bug B + new helper).
- **forge-client-obsidian commits**:
  - `67b7d5d` — engine bundle resync + qualifier switches to `find_qualified_by_bare`.
  - `b21c1ef` — manifest 0.2.78 bump.
  - `1d4308e` — Release v0.2.78.
  - `6e773af` — INSTALL.md bump.

## §1 — Investigation findings

### §1.1 — Bug A: `.bak.*` directories scanned as libraries

`_detect_library_vaults` (snippet_registry.py:254-262 pre-fix) iterated every top-level subdir whose `forge.toml` existed. No filter for `<base>.bak.<version>/` patterns. v0.2.38's auto-re-extract creates these backups via `welcome.ts:renameWithBackup`; each retains an intact `forge.toml` (literal directory copy), satisfying the discovery filter.

Two distinct symptoms confirmed by reproduction test:
1. **Library-name collision**. `forge-tutorial/forge.toml` and `forge-tutorial.bak.0.1.0/forge.toml` both declare `name = "forge-tutorial"`. `_scan_library_vault` writes entries to `_vaults["forge-tutorial"]`; the second scan (alphabetically after the fresh one) overwrites overlapping sub-path keys with STALE bodies. Reproduction test asserts `fresh["body"]` contains `FRESH BODY` after scan; pre-fix it contains `STALE BODY`.
2. **Plugin-side snippet_id unrouteable**. The plugin computes snippet_id from the clicked file's path: clicking `forge-tutorial.bak.0.1.0/01-hello/hello_world.md` produces `forge-tutorial.bak.0.1.0/01-hello/hello_world`. This vault name isn't registered → `SnippetResolutionError`.

### §1.2 — Bug B: `get_bare` misses library sub-path entries

`get_bare` (snippet_registry.py:181-187 pre-fix) walked the resolution order with direct-key lookup only. Library entries are stored under sub-path keys (`_vaults["forge-music"]["blues/chorus"]`), so `get_bare("chorus")` returned None. `pyodide-host.ts:_forge_qualify_snippet_id` falls through; `set_snapshot_state` looks at `.forge/edges/chorus/song.md` (doesn't exist). Capture had written it at `.forge/edges/forge-music/blues/song/forge-music/blues/chorus.md` per the qualified snippet_id. `FileNotFoundError` on freeze of any library wikilink.

Reproduction test confirms `get_bare("chorus")` returns None pre-fix; post-fix the new `find_qualified_by_bare("chorus")` returns the library entry with qualified id `forge-music/blues/chorus`.

### §1.3 — Cross-cutting AUTHORING-default audit

Per prompt §2.3, surveyed sites for the same "default to AUTHORING / bare" pattern:

- `forge/core/snippet_registry.py` — AUTHORING default in `scan` (correct: authoring IS the vault root), `refresh_file` (v0.2.75 fixed), `_detect_library_vaults` (Bug A, this drain), `get_bare` (Bug B, this drain).
- `src/pyodide-host.ts:_forge_qualify_snippet_id` (Bug B downstream — fixed here by switching to `find_qualified_by_bare`).
- `src/main.ts` editor toolbar paths — no AUTHORING-default sites; uses metadataCache + per-file frontmatter for type. Already correct.

**Conclusion**: bugs A + B exhaust the known pattern at this audit depth. No additional buggy sites surfaced.

## §2 — Bug A TDD continuity

1. **Failing reproduction test**: `test_bug_a_scan_excludes_bak_directories_from_library_discovery` in `test_v0_2_78_vault_routing.py`. Builds a vault with both `forge-tutorial/` (FRESH BODY) and `forge-tutorial.bak.0.1.0/` (STALE BODY) and asserts (i) fresh body is preserved post-scan, (ii) `forge-tutorial.bak.0.1.0` does not appear as a vault in `list_snippets`.
2. **Pre-fix output**: fails on (i) — fresh body was overwritten by .bak (`AssertionError: Fresh entry should have FRESH BODY but has: '# English\n\nSTALE BODY...'`).
3. **Fix**: `_BAK_DIR_PATTERN = re.compile(r"\.bak\.")` filter applied in both `_detect_library_vaults` (skip .bak as library candidate) and `scan`'s authoring traversal (prune .bak from dirs[]).
4. **Post-fix**: 1/1 passing.
5. **Full suite**: 630 forge tests passing.

## §3 — Bug B TDD continuity

1. **Failing reproduction tests**: 3 cases in `test_v0_2_78_vault_routing.py`:
   - `test_bug_b_qualifier_resolves_library_subpath_basename` (FAIL pre-fix)
   - `test_bug_b_qualifier_basename_resolution_does_not_break_authoring_top_level` (PASS pre-fix — regression guard)
   - `test_bug_b_qualifier_basename_resolution_ambiguity_prefers_first` (FAIL pre-fix)
2. **Pre-fix output**: `get_bare('chorus')` returns None for sub-path-keyed library entries; non-resolution-order vaults are never scanned.
3. **Fix**: New `find_qualified_by_bare(bare_id)` helper does 3-pass scan — direct-key in resolution-order vaults, direct-key in other vaults, basename scan across sub-path keys (resolution-order first). `get_bare` keeps strict direct-key semantics for the existing A4 walking contract. Plugin's `_forge_qualify_snippet_id` switched to `find_qualified_by_bare`.
4. **Post-fix**: 3/3 fixed tests now pass; the regression-guard test still passes (no shadowing of authoring direct-key semantics).
5. **Full suite**: 630 forge + 530 plugin passing.

## §4 — User-side smoke checklist

Per §4 of prompt:

```
# Step 1 — install v0.2.78 into a fresh vault.
mkdir -p ~/forge-vaults/v0.2.78-smoke
# Unzip the v0.2.78 release into .obsidian/plugins/.

# Step 2 — Bug A reproduction:
cp -r ~/forge-vaults/v0.2.78-smoke/forge-tutorial \
      ~/forge-vaults/v0.2.78-smoke/forge-tutorial.bak.0.1.0
# Reload Obsidian.
# Open forge-tutorial/01-hello/hello_world.md. Forge-click → "hello, world".
# Open forge-tutorial.bak.0.1.0/01-hello/hello_world.md. Forge-click.
# Expected: snippet_id is NOT `forge-tutorial.bak.0.1.0/01-hello/hello_world`;
# the .bak isn't a registered vault. Either a "no snippet here" notice OR
# routing to a same-basename match elsewhere (per A4) — NOT
# SnippetResolutionError on the .bak prefix.
# Also: the fresh forge-tutorial/01-hello/hello_world body should still
# be FRESH (not overwritten by .bak via scan-order collision).

# Step 3 — Bug B reproduction:
# Open forge-music/blues/song.md (declares music domain so it extracts).
# Verify Dependencies block with [[chorus]].
# Forge-click song.md to capture edges.
# Right-click [[chorus]] in Dependencies. Click "Forge: Freeze edge song → chorus".
# Expected: "Forge: frozen song → chorus" toast. NO FileNotFoundError.

# Step 4 — Regression: Tier 1 hello_world still works.
# Step 5 — Regression: existing forge-moda snippets unchanged.
```

## §5 — Auto-smoke results

- forge: `.venv/bin/pytest` → **630 passing** (was 626 + 4 new).
- plugin: `npm test` → **530 passing** (no plugin test changes).
- `npm run build` exit 0.
- `bash scripts/release.sh 0.2.78` clean after fixing an embedded-Python backtick that broke the TS template literal (caught immediately by build; amended into the prior commit before re-running release).
- All drift preflight checks clean (engine + forge-moda + forge-music + forge-tutorial).
- Zip built (33.19 MB), tag pushed, GH release created.

## §6 — Open follow-ups

1. **Plugin-side cleanup for orphan .bak directories**: the engine fix excludes .bak from indexing, but Obsidian still shows the directory tree. The user's file picker will surface .bak files. A future drain could add a UI cue (subdued/struck-through styling for .bak) OR auto-purge .bak directories older than N days. Not in scope for v0.2.78.

2. **Per-vault `find_qualified_by_bare` ambiguity policy**: current first-match-wins behavior matches existing A4 semantics, but for freeze on a wikilink that resolves to multiple sub-path entries (e.g. both forge-moda/scenes/song and forge-music/blues/song exist), the user might prefer prompting. The freeze modal could use the existing `decideWikilinkFreezeMenu` helper that already handles ambiguity. Out of scope; flagged.

3. **Snapshot path qualifier symmetry on capture side**: capture writes using `snippet["snippet_id"]` (always qualified). Freeze now resolves bare → qualified. There's no remaining defect, but the helpers could be co-located (`forge.core.qualify`) to make the symmetry explicit.

4. **Build-time validation that embedded Python in pyodide-host.ts has no backticks**: the v0.2.78 hotfix-of-the-hotfix (`67b7d5d` backtick removal) cost one failed release.sh attempt. A trivial lint rule on `pyodide-host.ts` Python strings would catch this. Out of scope.

## §7 — Per-protocol HARD RULE compliance

- ✓ cc-prompt-queue.md §78 (investigation-before-design): Phase 1 investigation commit lands before Phase 2 fix.
- ✓ §57 (failing-first TDD): all 4 fix tests fail pre-fix, pass post-fix.
- ✓ §76 (don't ship speculative fix): both bugs concretely reproduced + verified by tests.
- ✓ §2.3 (cross-cutting audit): completed, findings reported in §1.3 above.
- ✓ §347 (version-bump sanity check): manifest pre-bump at 0.2.77; explicit version arg used.
- ✓ §321 (feedback file before move): this file exists; prompt move follows.
- ✓ Standing user rule: committed directly to main in forge + forge-client-obsidian. No feature branches.

Per cc-prompt-queue.md §43, this is the chat summary.
