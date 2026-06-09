# v0.2.78 — Two vault-routing hotfixes: `.bak.*` library exclusion + freeze qualifier vault resolution

**Date queued**: 2026-06-07
**Driver**: forge-core (Oded)
**Target plugin version**: bump per placeholder — `{CURRENT} → {NEXT_PATCH}` (expected `0.2.77 → 0.2.78`). Read `~/projects/forge-client-obsidian/manifest.json` first per cc-prompt-queue.md §347. **Use explicit version arg** `bash scripts/release.sh 0.2.78` per the v0.2.75 lesson.

## §0 — Why this prompt exists

Mint-laptop smoke (2026-06-07) surfaced two real bugs, both in the vault-routing pattern. Both are V1-blocking for cohort first-impression:

- **Bug A — `.bak.*` directories scanned as libraries** (HIGH priority; affects every student on every plugin update with bundled-vault version drift). The v0.2.38 auto-re-extract mechanism renames the existing extracted library directory to `<library>.bak.<old-version>/` before re-extracting fresh. The SnippetRegistry then scans the .bak directory and indexes every snippet inside it with the .bak directory name as the library prefix. A student then opens a snippet from the .bak (Obsidian's file picker shows both fresh and .bak trees) and Forge-clicks — the plugin routes the click to a snippet with a `.bak.<version>` prefix that isn't a registered library. The resolver raises `SnippetResolutionError`. Concrete reproduction at the smoke (snippet_id observed: `forge-tutorial.bak.0.1.0/01-hello/hello_world`).

- **Bug B — freeze qualifier defaults to AUTHORING for library snippets** (Medium priority; freeze is "stretch but recommended for V1" per the smoke doc). The `_forge_qualify_snippet_id` helper called from `_forge_set_edge_state` (pyodide-host.ts:649) defaults bare snippet IDs to AUTHORING-vault qualification. Right-click freeze on a library snippet's wikilink (`[[chorus]]` inside `forge-music/blues/song.md`'s Dependencies) passes bare basenames; the qualifier turns them into `authoring/chorus` + `authoring/song`. Snapshot path becomes `.forge/edges/authoring/song/authoring/chorus.md` which doesn't exist (compute wrote it to the library-qualified path). FileNotFoundError. Reproduced at smoke Phase 8.4.

Both bugs share the same architectural pattern: **"default to AUTHORING for unknown vault membership."** v0.2.75 fixed the same shape in `refresh_file`; both A and B are sibling code paths that retained the defect.

## §1 — Investigation phase (commit before fix — per cc-prompt-queue.md §78)

Two bugs, each with their own hypothesis to pin.

### §1.1 — Bug A investigation

**Hypothesis**: SnippetRegistry's `scan()` (or equivalent vault-discovery method) walks every top-level directory in the user vault and treats each as a library candidate. The exclusion logic likely filters dot-prefixed directories (`.obsidian/`, `.forge/`) but does NOT filter `<library>.bak.<version>/` directories — they share the library naming pattern minus the `.bak.<version>` suffix.

Test the hypothesis concretely:

1. Read `~/projects/forge/forge/core/snippet_registry.py` `scan()` (or similar method) end-to-end. Identify the directory-discovery code path.
2. Identify the filter rules: does it use `KNOWN_BUNDLED_LIBRARIES` allowlist? Does it filter dot-prefixed? Does it filter `<name>.bak.*` pattern?
3. Confirm by constructing a stub vault tree: vault-root with `forge-tutorial/01-hello/hello_world.md` AND `forge-tutorial.bak.0.1.0/01-hello/hello_world.md`. Run `reg.scan(vault)`. Inspect `reg.list_snippets()`. Does the .bak entry appear as a library?
4. If yes → hypothesis A confirmed. If no → investigate where the `.bak.0.1.0/01-hello/hello_world` snippet_id was constructed by tracing the resolver call from the JS-side `computeSnippet` (the snippet_id is passed in from the editor's open-file path).

### §1.2 — Bug B investigation

**Hypothesis**: `_forge_qualify_snippet_id` in `~/projects/forge-client-obsidian/src/pyodide-host.ts` (~line 649 surrounding `_forge_set_edge_state`) defaults bare IDs to AUTHORING-prefixed even when the snippet is actually a library snippet.

Test:

1. Read `_forge_qualify_snippet_id` end-to-end. Identify the qualification logic.
2. Check whether it queries the SnippetRegistry to determine the actual vault membership of the bare ID, OR whether it unconditionally prepends `authoring/`.
3. Trace the smoke's reproduction: JS-side `setEdgeState('chorus', 'song', 'frozen')` → Python `_forge_set_edge_state` → qualifier → `authoring/chorus` + `authoring/song`. The compute path (which DID write the snapshot during the prior Forge-click on song.md) wrote it where? Read `write_snapshot` + `snapshot_path` (`~/projects/forge/forge/core/snapshots.py`) and identify the path scheme COMPUTE uses vs the path FREEZE uses.
4. If compute uses `forge-music/blues/song/forge-music/blues/chorus.md` and freeze uses `authoring/song/authoring/chorus.md` → bug B confirmed; freeze path qualifier is wrong.

### §1.3 — Investigation commit

Title: `[2026-06-07-2200-v0278-bak-dirs-and-freeze-qualifier-hotfix] phase 1: pin both vault-routing bugs from mint-laptop smoke`

Investigation note at `~/projects/forge/docs/investigations/v0.2.78-vault-routing.md`. For each bug: hypothesis pinning, concrete data, code citations.

**Failing reproduction tests** committed in this phase for BOTH bugs (one test per bug, asserting the bug shape against current code).

## §2 — Fix phase (TDD per cc-prompt-queue.md §57)

### §2.1 — Bug A fix: exclude `.bak.*` from library discovery

The fix is at the directory-discovery layer. Options:

- **(a) Filter by suffix pattern**: exclude any top-level directory matching `<base>.bak.<anything>` (regex). Robust to future bak naming variations.
- **(b) Allowlist-only**: scan only directories whose names appear in `KNOWN_BUNDLED_LIBRARIES`. Most restrictive but prevents future similar accidents.
- **(c) Filter `.bak.` substring**: exclude any directory containing `.bak.` (broader; might catch user-named files we don't want to catch).

CC picks based on the investigation finding. Probably (a) or (b). The forge-music + forge-moda + forge-tutorial allowlist already exists (KNOWN_BUNDLED_LIBRARIES); (b) might be the cleanest if scan() can also accommodate user-authored library directories (vaults the user creates that aren't in the known list).

**Failing test first**: assert that `reg.scan(vault_with_bak_dir)` does NOT index snippets from the .bak directory. Test against constructed stub vault.

Implement the chosen filter. Re-run. Full suite green.

Plus: extend the existing `forge-tutorial-bundle.test.ts` (from v0.2.76) to assert .bak exclusion as a regression.

### §2.2 — Bug B fix: freeze qualifier uses registry to determine vault

The fix is in `_forge_qualify_snippet_id` (or wherever the qualifier lives). Replace the "default to AUTHORING" with:

- Query the SnippetRegistry for the bare ID across all known vaults.
- If found in exactly one vault → use that vault's qualified ID.
- If found in multiple vaults (ambiguous) → prefer the vault matching the caller's context (the caller's vault), else raise a clear error.
- If found in zero vaults → fall back to AUTHORING ONLY if the caller is AUTHORING-scoped (or raise a clear error).

**Failing test first**: assert that `_forge_qualify_snippet_id('chorus')` against a registry where chorus is at `forge-music/blues/chorus` returns `forge-music/blues/chorus`, NOT `authoring/chorus`.

Implement, re-run, full suite.

Plus extend the v0.2.75 refresh_file investigation tests (`tests/core/test_refresh_file_library_vault_investigation.py`) with parallel assertions for the qualifier — they're sibling code paths and the regression tests should cover the same pattern.

### §2.3 — Cross-cutting: audit for other "default to AUTHORING" sites

The pattern keeps surfacing (v0.2.75 refresh_file, Bug A registry scan, Bug B qualifier). CC searches for other sites in the codebase that share the pattern:

```
grep -rn "AUTHORING\|authoring/" forge/core/ src/pyodide-host.ts src/main.ts
```

For each site, evaluate: does it default to AUTHORING for unknown? If yes, is it correct (e.g., user-authored vault-root files genuinely are AUTHORING) or is it the same defect pattern?

Surface findings in §5 of feedback. Fix only Bugs A + B in this drain unless other sites are clearly buggy in the same shape (in which case bundle the fix).

This audit is the cross-cutting work my V1 retrospective item (xxvii) anticipated. Doing it here surfaces the full extent of the pattern before V1 cohort exposure.

## §3 — Release ship

Per cc-prompt-queue.md §339:

1. Bump manifest per placeholder.
2. NO bundled-vault forge.toml bumps (no bundled content changed).
3. `bash scripts/release.sh 0.2.78` (explicit version arg).
4. Tag pushed, GH release published.

## §4 — User-side smoke (CC writes post-implementation)

Pre-spec'd steps per cc-prompt-queue.md §187:

```
# Pre-conditions: clean test vault.

# Step 1 — install v0.2.78:
VAULT=~/forge-vaults/v0.2.78-smoke bash ~/projects/forge-client-obsidian/scripts/install-latest.sh

# Step 2 — Bug A reproduction:
# Manually create a .bak directory in the test vault (simulating a prior re-extract):
cp -r ~/forge-vaults/v0.2.78-smoke/forge-tutorial ~/forge-vaults/v0.2.78-smoke/forge-tutorial.bak.0.1.0
# Open Obsidian. Open ~/forge-vaults/v0.2.78-smoke/forge-tutorial/01-hello/hello_world.md.
# Forge-click. Expected: hello, world (success).
# Open ~/forge-vaults/v0.2.78-smoke/forge-tutorial.bak.0.1.0/01-hello/hello_world.md.
# Forge-click. Expected: same hello, world (the .bak file is NOT indexed as a library
# snippet; it's a regular markdown file that the engine treats as an authoring-vault
# snippet, OR shows a "no snippet here" notice).
# Specifically: the snippet_id when Forge-clicking the .bak file should NOT be
# 'forge-tutorial.bak.0.1.0/01-hello/hello_world'.

# Step 3 — Bug B reproduction:
# Open ~/forge-vaults/v0.2.78-smoke/forge-music/blues/song.md.
# Verify Dependencies block with [[chorus]] wikilinks present.
# Forge-click song.md to capture edges. Wait for render.
# Right-click [[chorus]] in the Dependencies block.
# Click "Forge: Freeze edge song → chorus".
# Expected: toast "Forge: frozen song → chorus". NO FileNotFoundError.

# Step 4 — Regression: Tier 1 hello_world still works:
# Open forge-tutorial/01-hello/hello_world.md (the fresh one, not .bak).
# Forge-click. Expected: hello, world.
```

Failure modes keyed by step.

## §5 — Feedback file shape

Per cc-prompt-queue.md §30-46 + §66-74:

- §0 — release coordinates.
- §1 — Investigation findings:
  - §1.1 — Bug A pinning (concrete data + code citations).
  - §1.2 — Bug B pinning.
  - §1.3 — Cross-cutting audit findings (per §2.3): what other sites share the pattern? Listed even if not fixed in this drain.
- §2 — TDD continuity for Bug A (5 checkpoints).
- §3 — TDD continuity for Bug B (5 checkpoints).
- §4 — User-side smoke per §4 of this prompt.
- §5 — Auto-smoke results.
- §6 — Follow-ups noted but not built (any cross-cutting AUTHORING-default sites flagged for future drains).

Post the same report in chat per cc-prompt-queue.md §43.

## §6 — Self-contained context for CC

- v0.2.75 vault-routing fix (refresh_file): `~/projects/forge-moda-bootstrap/prompts/feedback/2026-06-07-1800-cache-miss-on-consistent-state-investigate.md`. Same architectural pattern; sibling code paths.
- v0.2.76 Tier 1 ship feedback (forge-tutorial bundled): `~/projects/forge-moda-bootstrap/prompts/feedback/2026-06-07-1900-tier1-ship-bundle-forge-tutorial-and-auto-extract.md`. Sets the v0.2.38 auto-re-extract context.
- Engine: `~/projects/forge/forge/core/snippet_registry.py` (scan() + vault routing). `~/projects/forge/forge/core/snapshots.py` (snapshot_path + set_snapshot_state).
- Plugin: `~/projects/forge-client-obsidian/src/pyodide-host.ts` `_forge_qualify_snippet_id` (~line 649) + `_forge_set_edge_state`.
- KNOWN_BUNDLED_LIBRARIES at `welcome.ts:17` + `chips.ts:65`: forge-moda, forge-music, forge-tutorial.
- v0.2.38 auto-re-extract mechanism that creates `.bak.<version>/` directories: at `welcome.ts` `ensureBundledVault` (shared helper).
- "Assert cannot only with concrete error" HARD RULE: `~/projects/forge-moda-bootstrap/cowork-forge-protocol.md`.
- "Forge-core's CC-drain review is always-on" HARD RULE: same protocol file §77.

## §7 — Acceptance criteria

- Bug A: SnippetRegistry does NOT index snippets from `.bak.*` directories. Filter applied at scan() or equivalent. Test asserts the exclusion against a stub vault with a .bak dir.
- Bug B: `_forge_qualify_snippet_id` for a library snippet's bare ID returns the library-qualified ID (e.g., `forge-music/blues/chorus`), NOT `authoring/chorus`. Test asserts against a stub registry. Freeze affordance works on library-snippet edges per the smoke Step 3.
- Cross-cutting audit findings reported in §1.3 of feedback (even if not fixed).
- All tests green (engine + plugin suites).
- v0.2.78 released cleanly via release.sh.
- Smoke checklist §4 ready.

If investigation surfaces that one of the two bugs is more complex than the prompt anticipated (e.g., Bug A requires a SnippetRegistry refactor rather than a simple filter), STOP and route that sub-fix to questions/ separately. The other sub-fix may still ship in v0.2.78 if independently mergeable.
