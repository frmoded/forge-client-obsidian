# v0.2.79 — Polish bundle: re-bundle forge-tutorial 0.1.1 + backtick-trap lint + edit-mode ribbon removal

**Date queued**: 2026-06-08
**Driver**: forge-core (Oded)
**Target plugin version**: bump per placeholder — `{CURRENT} → {NEXT_PATCH}` (expected `0.2.78 → 0.2.79`). Read `~/projects/forge-client-obsidian/manifest.json` first. **Use explicit version arg** `bash scripts/release.sh 0.2.79`.

## §0 — Why this prompt exists

Three small, unrelated, low-risk polish items bundled into one drain. All driver-authorized after V1 closed-beta gate cleared at v0.2.78.

1. **forge-tutorial 0.1.1 re-bundle** (forge-doc rewrote all 9 lesson notes per driver "as simple as possible" feedback; snippet files unchanged; only title-named lesson notes updated; forge-tutorial `forge.toml` bumped 0.1.0 → 0.1.1 so v0.2.38 auto-re-extract fires for cohort vaults).

2. **Backtick-trap build-time lint** (cc-prompt-queue.md §110 trap has now fired FOUR TIMES — v0.2.20, v0.2.23, v0.2.72, and v0.2.78. Codification-as-comment has failed to prevent recurrence. Build-time lint is overdue).

3. **Edit-mode ribbon button removal** (driver-authorized 2026-06-08 — moves V1 closer to V2's gestural model; primary audience rarely uses Python mode; UI cleanup; power users retain command-palette access for the override case).

## §1 — Investigation phase (light)

Investigation-first per cc-prompt-queue.md §78 is light because all three items are well-bounded.

### §1.1 — Re-bundle scope check

Confirm forge-tutorial source state:
- `~/projects/forge-tutorial/forge.toml` has `version = "0.1.1"` (per forge-doc's bump).
- 9 chapter directories present with rewritten lesson notes.
- Snippet files unchanged (forge-doc confirms this; spot-check if curious).

Confirm v0.2.76 bundle infrastructure still operational:
- `scripts/sync-bundled-vault.mjs` exists.
- `npm run sync-bundled-vaults` mirrors source → bundle.
- `scripts/release.sh` drift preflight (extended in v0.2.76) catches any divergence.

### §1.2 — Backtick-trap scope

Identify the trap: embedded Python in TS template literals inside `src/pyodide-host.ts` (and possibly elsewhere). Backticks in Python docstrings or comments terminate the outer JS template literal, causing build errors.

Past occurrences:
- v0.2.20: original occurrence in `_forge_run_snippet` docstring.
- v0.2.23: recurrence after a Python helper edit.
- v0.2.72: third occurrence in `computeViaEngineWithPython` doc string (per cc-prompt-queue.md §110 codification).
- v0.2.78: fourth occurrence per the v0.2.78 feedback §6.4.

The lint shape: scan `src/pyodide-host.ts` (and any TS file containing embedded Python — grep for `runPython\(` or `pyodide.runPython\(` callsites) for backticks inside multi-line strings that are themselves Python source. Fail the build if found.

### §1.3 — Edit-mode ribbon removal scope

Read `~/projects/forge-client-obsidian/src/main.ts:826-841` end-to-end. Identify:
- The `if (fm?.type === 'action')` gate at line 826 (post-v0.2.77 Forge-button gating; correct).
- The edit-mode toggle button code inside the gate.
- Any callers / commands that target this button's handler (`toggleEditMode` or `toggleEditModeForFile`).

Verify the command palette path:
- Does `addCommand` register a command for edit-mode toggle? Search for `toggleEditMode` registrations.
- If yes, the command-palette path remains; we just remove the ribbon button (the visual surface).
- If no, ADD a command palette command in this drain so power users retain a path.

The frontmatter contract (B8 `edit_mode: english | python` + `locked_english_hash` drift detection) is unchanged. Only the ribbon button is removed.

## §2 — Implementation

### §2.1 — Re-bundle forge-tutorial 0.1.1

```bash
cd ~/projects/forge-client-obsidian
npm run sync-bundled-vaults  # mirrors all 3 bundled vaults; forge-tutorial picks up the 0.1.1 changes
```

Verify the resulting `assets/vaults/forge-tutorial/` matches `~/projects/forge-tutorial/` (the sync script should report `<n> updated, 0 added, 0 removed` for forge-tutorial; other vaults clean).

Verify `assets/vaults/forge-tutorial/forge.toml` declares `version = "0.1.1"`.

Test that the drift preflight (in `scripts/release.sh`) reports clean after the sync.

### §2.2 — Backtick-trap lint

Implementation options:

**Option A** (preferred — build-step grep): add a check in `package.json`'s `prebuild` or directly in `scripts/build-release-zip.mjs`'s preflight that greps `src/pyodide-host.ts` for backticks inside runPython template literals. Pattern roughly:
```
# Find all `pyodide.runPython(`...`)` blocks and inspect their content.
# Backticks inside those blocks (excluding the outer fences) are the trap.
```

The lint can be heuristic: scan for runPython() callsites, find the matched template literal, check for backticks inside. Fail the build with a clear error message pointing at the line.

**Option B** (alternative — pure-core extraction): extract a helper that detects "Python code containing backticks" and is callable from the build script. Tests verify it catches known traps + doesn't false-positive on real code.

Option A is simpler and CC's call.

Add a failing-first test (synthetic): construct a TS source with an embedded backtick in runPython, run the lint, assert failure with a useful message.

### §2.3 — Edit-mode ribbon removal

In `~/projects/forge-client-obsidian/src/main.ts:826-841`:
- Remove the edit-mode toggle button code.
- Preserve the `if (fm?.type === 'action')` gate (the Forge run button continues to be gated by it from v0.2.77).
- Verify the Forge run button (line 847) and New Snippet button (line 843) are unaffected.

Ensure the command palette path:
- If `toggleEditMode` is already registered as a command (search for `addCommand` or similar), no action needed — power users retain the path.
- If not, add it: `this.addCommand({ id: 'forge-toggle-edit-mode', name: 'Forge: Toggle edit mode (English / Python)', editorCallback: async (editor) => { /* call toggleEditMode */ } })`.

The frontmatter field (`edit_mode: python`), drift detection (`locked_english_hash`), and engine behavior are all unchanged. This is purely a UI surface change.

Migration: vaults with existing snippets in `edit_mode: python` continue to work identically. The toggle button just isn't on the ribbon anymore.

## §3 — Tests

### §3.1 — Re-bundle

The existing `src/forge-tutorial-bundle.test.ts` tests (from v0.2.76) verify bundle presence and structure. Re-run them; they should pass with the 0.1.1 content.

Plus: assert that `assets/vaults/forge-tutorial/forge.toml` declares `version = "0.1.1"`.

### §3.2 — Backtick lint

New test in `src/backtick-trap-lint.test.ts` (or wherever the lint helper lives):

```typescript
test('lint catches backtick in embedded Python', () => {
  const trap = 'pyodide.runPython(`def f():\\n    """has \\`backtick\\` in docstring"""`)';
  assert.throws(() => runBacktickLint(trap), /backtick/i);
});

test('lint passes on clean Python', () => {
  const clean = 'pyodide.runPython(`def f():\\n    return 42`)';
  assert.doesNotThrow(() => runBacktickLint(clean));
});

test('lint catches multi-line docstring with backtick', () => {
  const trap = 'pyodide.runPython(`def f():\\n    """\\n    Description with \\`backtick\\`\\n    """`)';
  assert.throws(() => runBacktickLint(trap), /backtick/i);
});
```

Plus an integration test that runs the lint against the actual `src/pyodide-host.ts` and asserts no trap is present (regression guard — ensures we don't ship a trap and the lint catches it).

### §3.3 — Edit-mode ribbon removal

Verify by inspection:
- `grep -c "edit-mode\|toggleEditMode" src/main.ts` shows the gate-wrapped block at 826 no longer adds a ribbon button (only the gate remains, plus the Forge run button + New Snippet button inside it).

Plus a smoke check: after install, the snippet's editor toolbar shows Forge run + New Snippet buttons but NOT the edit-mode toggle button. The command palette still lists "Forge: Toggle edit mode."

## §4 — Release ship

Per cc-prompt-queue.md §339:

1. Bump `manifest.json` per placeholder (`0.2.78 → 0.2.79`).
2. **forge-tutorial `forge.toml` is at 0.1.1** (already bumped by forge-doc); no further bump needed.
3. **No forge-moda or forge-music bumps** (no content changes there).
4. `bash scripts/release.sh 0.2.79` (explicit version arg).
5. Tag pushed, GH release published.

The v0.2.38 auto-re-extract fires for cohort vaults that have forge-tutorial extracted at 0.1.0: backup to `forge-tutorial.bak.0.1.0/` + re-extract fresh content. Per v0.2.78, the `.bak` is now excluded from snippet discovery — no Phase 9.3 regression.

## §5 — User-side smoke

Pre-spec'd steps per cc-prompt-queue.md §187:

```
# Step 1 — install v0.2.79.

# Step 2 — verify forge-tutorial re-extracted to 0.1.1:
# Open Obsidian. Console should show:
#   Forge: forge-tutorial drift detected (extracted 0.1.0 → bundled 0.1.1); backing up + re-extracting
# Verify in Terminal:
grep version ~/forge-vaults/<vault>/forge-tutorial/forge.toml
# Should show: version = "0.1.1"

# Step 3 — verify lesson note content is the updated version (driver vs forge-doc spot-check).
head -5 ~/forge-vaults/<vault>/forge-tutorial/01-hello/Hello.md

# Step 4 — verify ribbon button is gone:
# Open any action snippet (e.g. forge-moda/setup.md or hello_world.md).
# Editor toolbar shows Forge run button + New Snippet button. NO edit-mode toggle.

# Step 5 — verify command palette path retained:
# Cmd-P → "Forge: Toggle edit mode". Should appear in palette results.
# Run it; verify edit_mode flips between english and python (frontmatter changes).

# Step 6 — backtick lint smoke (CC can verify pre-ship):
# `npm run build` should complete cleanly (no backtick trap currently in src/pyodide-host.ts).
# If CC injects a synthetic backtick during testing, build should fail with the lint's error.
```

## §6 — Auto-smoke

Per cc-prompt-queue.md §133-181:

1. `npm run build` exit 0 (with new backtick lint enabled).
2. `npm test` all green.
3. `pytest -q` on forge all green.
4. `bash scripts/release.sh 0.2.79` clean (engine + bundled vault drift all clean; forge-tutorial bundle has 0.1.1).
5. `npm run sync-bundled-vaults` second run is a no-op (verifies sync idempotence after re-bundle).

## §7 — Feedback file shape

Per cc-prompt-queue.md §30-46:

- §0 — release coordinates.
- §1 — Investigation findings (per §1.1 / §1.2 / §1.3 — light).
- §2 — Implementation summary for each sub-item.
- §3 — Tests (regression for re-bundle; new tests for backtick lint).
- §4 — User-side smoke per §5 of this prompt.
- §5 — Auto-smoke results.
- §6 — Follow-ups noted but not built (likely: V2 direction blocks any further `edit_mode` work; UI for `.bak` directories surfaced in v0.2.78 §6.1 stays open).

## §8 — Self-contained context for CC

- forge-doc's re-bundle request: `~/projects/forge-moda-bootstrap/messages/to-forge-core/done/2026-06-07-2109-rebundle-request-plus-chapter9-transpile-vs-compute-question.md`.
- forge-tutorial source: `~/projects/forge-tutorial/` (version 0.1.1).
- v0.2.78 feedback §6.4 (backtick trap recurrence flag): `~/projects/forge-moda-bootstrap/prompts/feedback/2026-06-07-2200-v0278-bak-dirs-and-freeze-qualifier-hotfix.md`.
- cc-prompt-queue.md §110 (backtick trap codification): `~/projects/forge-moda-bootstrap/cc-prompt-queue.md`.
- v0.2.77 Forge-button gating: `~/projects/forge-moda-bootstrap/prompts/feedback/2026-06-07-2030-v0277-bundle-positional-foot-gun-modal-canonical-forge-button-gate.md`.
- main.ts edit-mode toggle code: `~/projects/forge-client-obsidian/src/main.ts:826-841`.
- V2 direction context (informational; this drain stays V1): `~/projects/forge/docs/v2-direction.md`. v0.2.79 is V1 polish; V2 edit_mode → `source` migration is a later commitment.

## §9 — Acceptance criteria

- Re-bundle: `assets/vaults/forge-tutorial/forge.toml` at 0.1.1; lesson notes match source. `sync-bundled-vaults` idempotent post-run.
- Backtick lint: build step catches embedded-Python backticks; passes on current `src/pyodide-host.ts`; fails with useful message on synthetic injection.
- Ribbon removal: edit-mode toggle button not added to editor toolbar; command palette path retained; frontmatter contract unchanged.
- All tests green.
- v0.2.79 released cleanly via release.sh.
- Smoke checklist §5 ready.

If any sub-item surfaces unexpected scope expansion, ship the others; route the affected one to questions/.
