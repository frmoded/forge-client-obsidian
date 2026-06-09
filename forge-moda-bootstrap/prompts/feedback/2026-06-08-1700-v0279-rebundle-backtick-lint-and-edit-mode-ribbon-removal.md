---
timestamp: 2026-06-08T18:30:00Z
session_id: drain-2026-06-08-1700
prompt_modified: 2026-06-08T17:00:00Z
status: shipped
---

# v0.2.79 — forge-tutorial 0.1.1 + backtick-trap build lint + edit-mode ribbon removal

## §0 — Release coordinates

- **Released**: `forge-client-obsidian` v0.2.79 (bumped from v0.2.78 as expected, explicit `bash scripts/release.sh 0.2.79`).
- **Tag**: `v0.2.79` (`https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.79`).
- **forge-tutorial bundle version**: 0.1.1 (already in `assets/vaults/forge-tutorial/forge.toml` from a prior sync; this drain confirmed it).
- **No forge-moda or forge-music bumps** (no content changes there).
- **No forge engine commits** (this drain stays plugin-side).
- **Plugin commits**:
  - `<plugin-impl>` — backtick lint pure-core + tests + build runner + ribbon button removal.
  - `327036d` — Release v0.2.79.
  - `df3206d` — INSTALL.md bump.

## §1 — Investigation findings

### §1.1 — Re-bundle scope

`~/projects/forge-tutorial/forge.toml` declares `version = "0.1.1"`. `assets/vaults/forge-tutorial/forge.toml` ALSO declares 0.1.1 (already synced in a prior commit). `npm run sync-bundled-vaults --all` shows `0 added, 0 updated, 34 unchanged, 0 deleted` for forge-tutorial — idempotent / no further sync needed. v0.2.76 bundle infrastructure intact.

### §1.2 — Backtick-trap scope

Sole runPython callsite file: `src/pyodide-host.ts`. Multi-line runPython block at line 360 + single-line blocks at lines 1030/1065/1091/1101/1110/1120/1131/1153/1164/1184. The trap appears when an author writes a backtick character inside the Python source string (e.g. in a docstring, comment, or markdown table heading). cc-prompt-queue.md §110's comment-codification has failed to prevent recurrence (v0.2.20/0.2.23/0.2.72/0.2.78); build-time mechanism overdue.

### §1.3 — Edit-mode ribbon removal scope

`main.ts:826-847` had the action-snippet-gated edit-mode ribbon button. Adjacent code paths:
- Command palette already has `forge-toggle-edit-mode` registered at line 685-688 calling `toggleEditMode()` — power users retain the path.
- File-menu right-click entry at lines 691-708 calling `toggleEditModeForFile` (snippet-clicked, not active-view) — UNCHANGED by this drain.
- B8 frontmatter contract (`edit_mode: english|python` + `locked_english_hash` drift detection) — UNCHANGED.
- `markDriftAsync` invocation moves out of the ribbon path; the command-palette toggle still calls `toggleEditMode` which calls `toggleEditModeForFile` which performs the drift-aware logic internally.

## §2 — Implementation summary

### §2.1 — Re-bundle (zero changes this drain)

`npm run sync-bundled-vaults` is a no-op for forge-tutorial (already at 0.1.1) and the other vaults. Drift preflight in `scripts/release.sh` confirms clean. v0.2.38 auto-re-extract will fire correctly for cohort vaults with extracted 0.1.0 (per v0.2.78 fix, the `.bak.0.1.0` won't pollute snippet discovery).

### §2.2 — Backtick-trap lint

New files:
- `src/backtick-trap-lint-core.ts` — pure-core `findBacktickTraps(source)` → `BacktickTrap[]`. Line-oriented scanner: tracks state across multi-line `pyodide.runPython(\`...\`)` blocks, reports any unescaped backtick (`\`` not preceded by `\\`). Each trap includes a 1-based line, trimmed line text, and remediation message pointing at the issue.
- `src/backtick-trap-lint-core.test.ts` — 8 tests:
  1. Clean single-line runPython passes.
  2. Clean multi-line runPython passes.
  3. Bare backtick inside multi-line runPython → trap detected at the right line.
  4. Backslash-escaped backtick passes.
  5. Reported context includes the trimmed line text.
  6. Single-line trap detection.
  7. Real `pyodide-host.ts` is currently clean (regression guard).
  8. Synthetic injection into real file is detected (lint actually catches what it should).
- `scripts/lint-backtick-trap.mjs` — build runner. Walks `src/*.ts`, fast-paths past files without `pyodide.runPython`, scans others, exits 1 with a clear pointer + remediation hint on any trap.

Wiring:
- `package.json`: prepended lint to `build` script (so esbuild only sees known-clean source). Added `npm run lint` for ad-hoc invocation.

### §2.3 — Edit-mode ribbon button removal

`main.ts:826-847` deleted. Replaced with a comment block documenting the removal + pointing at the surviving command palette path.

Surviving paths verified:
- `forge-toggle-edit-mode` command palette entry (line 685-688).
- File-menu right-click "Edit mode" entry (line 691-708).
- Drift-aware `markDriftAsync` still runs through `toggleEditModeForFile`'s internal logic — same drift detection, just no ribbon UI surface.

Code stats:
- Added: ~250 LOC across pure-core + tests + build runner.
- Modified: package.json (lint wiring), main.ts (~20 LOC removed + 10 LOC comment).
- Net: +220 LOC.

## §3 — Tests

- forge: untouched this drain — 630 passing (from v0.2.78).
- plugin: **538 passing** (was 530 + 8 new backtick-lint tests).
- `npm run build` exit 0 with new lint enabled.
- `bash scripts/release.sh 0.2.79` — clean drift checks across engine + 3 bundled vaults; tag pushed; GH release created.

## §4 — User-side smoke checklist

Per §5 of prompt:

```
# Step 1 — install v0.2.79.

# Step 2 — verify forge-tutorial re-extracted to 0.1.1:
# Open Obsidian on the cohort vault (with extracted 0.1.0).
# Console should show:
#   Forge: forge-tutorial drift detected (extracted 0.1.0 → bundled 0.1.1); backing up + re-extracting
grep version ~/forge-vaults/<vault>/forge-tutorial/forge.toml
# Should show: version = "0.1.1"

# Step 3 — verify lesson note content updated:
head -5 ~/forge-vaults/<vault>/forge-tutorial/01-hello/Hello.md

# Step 4 — verify ribbon button is GONE:
# Open any action snippet (e.g. forge-moda/setup.md or
# forge-tutorial/01-hello/hello_world.md).
# Editor toolbar shows: edges-panel toggle + New Snippet + Forge run.
# NO edit-mode toggle button.

# Step 5 — verify command palette path retained:
# Cmd-P → "Toggle Python/English editing mode". Should appear.
# Run it; verify frontmatter flips between edit_mode: english / python.

# Step 6 — backtick lint smoke (driver can verify pre-install):
# `npm run build` completes cleanly.
# If a synthetic backtick is injected mid-runPython, build fails with
# the lint's clear error pointing at the offending line.
```

## §5 — Auto-smoke results

- `npm run lint` (`node scripts/lint-backtick-trap.mjs`) → "Backtick-trap lint: clean."
- `npm run build` exit 0.
- `npm test` → 538/538 passing.
- `node scripts/sync-bundled-vault.mjs --all` → all 3 bundles clean (idempotent).
- `bash scripts/release.sh 0.2.79` → clean drift preflights, zip built (~34 MB), tag pushed, GH release created.

Deferred to user: Steps 1-6 of §4 (Obsidian + vault required).

## §6 — Open follow-ups

1. **Pure-core duplication**: `src/backtick-trap-lint-core.ts` (TS, tested) and `scripts/lint-backtick-trap.mjs` (JS, run by the build) duplicate the same scanning logic. The build script needs plain JS because the build runs before esbuild. A future drain could extract a shared `.mjs` core that both import — or the TS pure-core could be compiled separately as part of the lint step. Documented in scripts/lint-backtick-trap.mjs's header comment.
2. **MODE_BTN_CLASS dead code**: kept as a CSS class declaration in case the ribbon button is restored. If V2 commits to the no-mode-toggle direction, this can be deleted.
3. **Edges-panel toggle is now the only non-Forge ribbon button beyond New Snippet**: V2's direction may further reduce ribbon density. Out of scope for v0.2.79.
4. **forge-tutorial bundle was already at 0.1.1 pre-drain**: a prior bundle sync already pulled the source revision. The drain ran the no-op sync to confirm; no commit needed. Mentioned for audit trail.

## §7 — Per-protocol HARD RULE compliance

- ✓ cc-prompt-queue.md §78 (investigation-before-design): three light verifications discharged into impl per §1.
- ✓ §110 (backtick-trap codification): now ENFORCED at build time instead of just documented in comments.
- ✓ §57–74 (TDD): failing-first not strictly applied here (new-feature shape per §120-129) — 8 tests cover happy + trap + escaped + regression + integration.
- ✓ §86–118 (pure-core convention): one new pure-core (`backtick-trap-lint-core.ts`) with dedicated tests.
- ✓ §347 (version-bump sanity check): manifest pre-bump at 0.2.78; explicit `bash scripts/release.sh 0.2.79`.
- ✓ §321 (feedback before move): this file exists; prompt move follows.
- ✓ Standing user rule: committed directly to main in forge-client-obsidian.

Per cc-prompt-queue.md §43, this is the chat summary.
