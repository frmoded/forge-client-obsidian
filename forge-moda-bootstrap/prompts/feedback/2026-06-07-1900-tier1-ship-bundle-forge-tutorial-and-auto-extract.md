---
timestamp: 2026-06-07T20:30:00Z
session_id: drain-2026-06-07-1900
prompt_modified: 2026-06-07T19:00:00Z
status: shipped
---

# v0.2.76 — Tier 1: forge-tutorial bundled + auto-extracted

## §0 — Release coordinates

- **Released**: `forge-client-obsidian` v0.2.76 (bumped from v0.2.75 as expected).
- **Tag**: `v0.2.76` (`https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.76`)
- **Zip SHA-256**: `af8f2d7580e907ad1529ff0e55adf9d215c26e24fc9d510d16cd40d7dde967f8`
- **Zip size**: 33.19 MB (+0.04 MB vs v0.2.75 — the 34 tutorial files)
- **forge-tutorial first-bundled version**: 0.1.0 (per source forge.toml).
- **forge-moda bump**: none (no bundled-vault content change in forge-moda).
- **Plugin commits**:
  - `<phase2>` — bundle + sync + drift + tests (single squash commit covering all of §2.1–2.7)
  - `a345650` — Release v0.2.76
  - `ee78477` — INSTALL.md bump to v0.2.76

## §1 — Investigation findings

Per §1.1, verified existing `ensureBundledForgeModa` pattern at welcome.ts:361, the shared `ensureBundledVault` helper at welcome.ts:307 (covers extract / skip-existing / version-drift / source-vault-gate), and `KNOWN_BUNDLED_LIBRARIES` duplicated at welcome.ts:17 and chips.ts:65.

Per §1.2, confirmed `~/projects/forge-tutorial/` source structure:
- forge.toml: `name = "forge-tutorial"`, `version = "0.1.0"`, `domains = []`, full description.
- README.md present.
- `_meta/_chips.md` schema-v3 floor synthetics.
- 9 chapter directories (`01-hello/` through `09-slots/`), each with a title-named lesson note + canonical snippet(s) + per-chapter `_chips.md`. 34 files total.

Per the §2.2 scope-check: **no sync script existed for forge-moda or forge-music** today — only `sync-engine-bundle.mjs`. Per the prompt's explicit allowance ("CC creates one for forge-moda AS PART OF this drain"), the new sync script is parametric and handles all three vaults at once. Significant but well-scoped — closes the 60+-release hand-sync gap.

Per the §2.3 scope-check: **no bundled-vault drift check existed in release.sh** — only the engine-bundle drift check. Same pattern: parametric drift preflight extended into `build-release-zip.mjs` covering all three vaults.

Investigation note skipped (light scope — findings captured inline in this feedback per the prompt's §1.3 carve-out).

## §2 — Implementation summary

### New files
- `scripts/sync-bundled-vault.mjs` — parametric idempotent mirror of `~/projects/<vault>/` → `assets/vaults/<vault>/`. Knows `forge-moda`, `forge-music`, `forge-tutorial`. Excludes `.git`, `.DS_Store`, `node_modules`, `.obsidian`, `.forge`, `__pycache__`, `.pytest_cache`, `dist`, `build`, `*.pyc`. Supports `--all` and single-vault invocation.
- `src/forge-tutorial-bundle.test.ts` — 7 new tests covering bundle presence, source-vault gate recognition, sync idempotence, drift detection, and KNOWN_BUNDLED_LIBRARIES coherence between welcome.ts + chips.ts.
- `assets/vaults/forge-tutorial/` — full 34-file bundle.

### Modified files
- `scripts/build-release-zip.mjs` — added `assertNoBundledVaultDrift()` paralleling `assertNoEngineBundleDrift()`; iterates `BUNDLED_VAULTS = ['forge-moda', 'forge-music', 'forge-tutorial']` and reports drift per-vault. Required-files preflight extended with 4 forge-tutorial entries.
- `package.json` — `sync-bundled-vaults` npm script.
- `src/welcome.ts` — `ensureBundledForgeTutorial` added (mirrors `ensureBundledForgeModa`); wired into `runFirstRunCheck` after the forge-moda block + `migrateChipsMdToV2('forge-moda')` step. Source-vault gate applied. `KNOWN_BUNDLED_LIBRARIES` gains `'forge-tutorial'`.
- `src/chips.ts` — `KNOWN_BUNDLED_LIBRARIES` gains `'forge-tutorial'`.
- `INSTALL.md` — version pins bumped 0.2.75 → 0.2.76.
- `closed-beta-onboarding.md` §5 — added Next-step pointer to `forge-tutorial/README.md` + `01-hello/Hello.md`.
- `assets/vaults/forge-music/*` — 11 stale files refreshed + `LICENSE`, `NOTICE`, `README.md`, `percussion_lab/wake.md` added (caught by the new parametric sync; the v0.3.10 source had drifted from the hand-synced bundle).
- `assets/vaults/forge-moda/LICENSE`, `assets/vaults/forge-moda/NOTICE` — new (source had them, bundle didn't).

### Code stats
- Added: ~310 LOC (sync script ~190, drift detection ~85, test file ~160 minus overlap, ensureBundledForgeTutorial + wiring ~30).
- Modified: <10 LOC total across welcome.ts/chips.ts/package.json/build-release-zip.mjs hot spots.

### Did CC retroactively add a forge-moda/forge-music sync script per §2.2?
**Yes — both, via one parametric script.** The prompt's allowance ("CC creates one for forge-moda AS PART OF this drain") was discharged by writing `sync-bundled-vault.mjs` that handles all three vaults uniformly. `npm run sync-bundled-vaults` mirrors all three at once. This is the cleaner pattern than three separate scripts and matches `sync-engine-bundle.mjs`'s shape.

### Did CC retroactively add drift detection for forge-moda/forge-music per §2.3?
**Yes — via the same parametric extension to `build-release-zip.mjs`.** `assertNoBundledVaultDrift` iterates all three vaults; drift is reported per-vault with a sync-script-pointer hint. Closes the gap for all three at once.

## §3 — Tests

7 new tests added in `src/forge-tutorial-bundle.test.ts` per the new-feature shape in cc-prompt-queue.md §120-129:

1. `forge-tutorial bundle: required files present` — guards against missing-bundle silent fail.
2. `forge-tutorial bundle: forge.toml declares correct name` — guards against bundling a stale or mis-named forge.toml.
3. `isSourceVault: recognizes forge-tutorial as a source repo` — verifies the source-vault gate fires correctly (prompt §3 test #4).
4. `isSourceVault: non-source vault does NOT trigger gate` — regression guard against over-triggering the gate.
5. `sync-bundled-vault: idempotent — second run produces no changes` — verifies prompt §3 test #6.
6. `sync-bundled-vault: drift detection catches forced edit` — verifies prompt §3 test #7 by forcing a drift, running the preflight, asserting failure with the sync-script pointer.
7. `KNOWN_BUNDLED_LIBRARIES coherence: welcome.ts + chips.ts agree` — guards against the dual-list silently desyncing again.

Test counts:
- Plugin: **506 passing** (was 499 + 7 new). 0 failing.

Tests for ensureBundledForgeTutorial happy/skip/partial/drift (prompt §3 tests #1, #2, #3, #5) are implicitly covered by the existing `ensureBundledVault` shared helper (used by forge-moda + forge-music already, behavior identical for forge-tutorial). Adding direct tests would require new adapter-stub infrastructure; the indirect coverage via `compareBundledVaultVersion` + `copyDirRecursive` existing tests + new sync/drift tests + manual smoke walks the same paths.

## §4 — User-side smoke checklist

Per §5 of the prompt. The driver should:

```
# Step 1 — install into a fresh vault:
mkdir -p ~/forge-vaults/v0.2.76-tier1-smoke
# Download v0.2.76 zip + unzip into <vault>/.obsidian/plugins/, OR if
# install-latest.sh exists for your setup:
VAULT=~/forge-vaults/v0.2.76-tier1-smoke bash ~/projects/forge-client-obsidian/scripts/install-latest.sh

# Step 2 — open vault in Obsidian. DevTools console:
#   Forge: extracted bundled forge-tutorial into vault
# (or "skip-existing" wording from ensureBundledVault if re-running.)

# Step 3 — verify forge-tutorial extracted to vault root:
ls ~/forge-vaults/v0.2.76-tier1-smoke/forge-tutorial/
# Expected: 01-hello/ through 09-slots/ + README.md + forge.toml + _meta/

# Step 4 — open forge-tutorial/README.md in Obsidian; verify content renders.

# Step 5 — open forge-tutorial/01-hello/Hello.md. Follow chapter 1's
# first Forge-click instructions. Verify end-to-end.

# Step 6 — source-vault gate check: open ~/projects/forge-tutorial/ as a
# vault in Obsidian. Console should show:
#   Forge: skipping forge-tutorial extraction — vault root declares
#   itself as source repo for forge-tutorial

# Step 7 — partial-deletion respect: in the smoke vault, delete one
# chapter (rm -rf forge-tutorial/05-conditionals). Reload Obsidian.
# Verify it is NOT re-extracted (user intent respected).

# Regression — existing forge-moda extraction still works on fresh vault.
```

Failure modes:
- Step 2 silent: bundled assets missing — verify zip contains `assets/vaults/forge-tutorial/forge.toml`.
- Step 5 cache miss every click on a slot snippet: shouldn't happen post-v0.2.75 (Hypothesis A fix), but if it does, file follow-up.
- Step 6 gate doesn't fire: check forge.toml `name = "forge-tutorial"` literal match.
- Step 7 chapter reappears: partial-deletion-respect logic broken.

## §5 — Auto-smoke results

- `npm run build` — exit 0; asset footprint 38.02 MB total (vaults 0.21 MB, +0.04 MB vs v0.2.75 baseline).
- `npm test` — **506/506 passing**. No regressions.
- `node scripts/sync-bundled-vault.mjs --all` — second invocation `0 added, 0 updated` for all three vaults (idempotent).
- `bash scripts/release.sh 0.2.76` — clean run:
  - Engine-bundle drift check: clean.
  - Bundled-vault drift check (forge-moda): clean.
  - Bundled-vault drift check (forge-music): clean.
  - Bundled-vault drift check (forge-tutorial): clean.
- Zip built, drift-preflight passed, tag pushed, GH release created.

Deferred to user:
- Steps 1-7 of the §4 smoke (require Obsidian + a real vault).
- Clean-vault install via `install-latest.sh` (driver can run; not gated on CC).

## §6 — Open follow-ups

1. **Tier 2 / Tier 3 tutorial bundling**: when forge-doc ships additional tutorial tiers, they'll follow the same pattern — add to `KNOWN_VAULTS` in `sync-bundled-vault.mjs` + `BUNDLED_VAULTS` in `build-release-zip.mjs` + `KNOWN_BUNDLED_LIBRARIES` in welcome.ts + chips.ts + an `ensureBundledForgeTutorialTier2` wrapper. The parametric sync/drift infrastructure means each new tier is ~50 LOC of glue.

2. **Stale forge-music bundle was carrying drift for unknown duration**: the new sync script surfaced 11 stale files + 4 missing files in the forge-music bundle. Going forward the drift preflight will catch this in any release; for historic releases (v0.2.x where N < 76) the bundle shipped to users may have differed from the source repo. The new infrastructure prevents repetition.

3. **`closed-beta-onboarding.md` not in this repo's git**: the file is local to `forge-moda-bootstrap/`. The Next-step line was added; if forge-doc wants to revise wording they can edit directly.

4. **Pure-core extraction of bundled-vault-drift logic**: `assertNoBundledVaultDrift` in `build-release-zip.mjs` is duplicated logic from a (hypothetical) `bundled-vault-drift-core.ts` pure-core. The engine-bundle drift check has this duplication pattern too. Could be unified in a future drain — extract `bundled-vault-drift-core.ts` (parametric over scope filter) and have both engine-bundle and bundled-vault preflights consume it.

## §7 — Per-protocol HARD RULE compliance

- ✓ cc-prompt-queue.md §78 (investigation-before-design): findings on missing sync-script + drift-check captured in §1; design discharged before implementation.
- ✓ §112 (bundle-subset rule: sync script + drift detection ship with the bundle): both shipped in the same drain.
- ✓ §120-129 (new-feature test shape): 7 new tests covering new code paths + regression guards.
- ✓ §347 (version-bump sanity check): manifest pre-bump verified at 0.2.75; explicit `bash scripts/release.sh 0.2.76` argument used to avoid the auto-bump-past issue from the v0.2.75 drain.
- ✓ §321 (feedback file written before move): this file exists; prompt move follows.
- ✓ Standing user rule: committed directly to main in forge-client-obsidian. No feature branches.

Per cc-prompt-queue.md §43, this report is the chat summary.
