# v0.2.76 — Ship Tier 1: bundle forge-tutorial + auto-extract on first install

**Date queued**: 2026-06-07
**Driver**: forge-core (Oded)
**Target plugin version**: bump per placeholder — `{CURRENT} → {NEXT_PATCH}` (expected `0.2.75 → 0.2.76`). Read `~/projects/forge-client-obsidian/manifest.json` first per cc-prompt-queue.md §347; pause and flag if not at 0.2.75.
**Predecessor context**: forge-doc's proposal at `~/projects/forge-moda-bootstrap/messages/to-forge-core/done/2026-06-07-1744-proposal-tier1-ship-drain-bundle-and-auto-extract-tutorial.md`.

## §0 — Why this prompt exists

Tier 1 content is content-complete (forge-doc verified chapters 1-8 runnable; chapter 9 ready against v0.2.75-confirmed slot contract). Source vault at `~/projects/forge-tutorial/`. Currently invisible to cohort because there's no `forge-client-obsidian/assets/vaults/forge-tutorial/` bundled mirror and `welcome.ts` has no extract hook.

**This drain closes that gap** by mirroring the existing `forge-moda` bundling pattern: bundle the vault into plugin assets, add a sync script + drift detection (per cc-prompt-queue.md §112 bundle-subset rule), wire an `ensureBundledForgeTutorial` extract function in `welcome.ts`, gate the source-vault detection so the forge-tutorial repo itself doesn't get the bundle re-extracted into it, and update onboarding docs.

**Mechanism chosen**: option (b) welcome-style root extraction, NOT default-enabled domain. Rationale (per forge-core's 2026-06-07 architectural review):

- "domains" in current architecture (B9) governs engine globals + `/generate` prompt fragments. Tutorial content injects neither. Tagging it as a domain conflates two distinct concepts.
- Pattern match: `forge-moda` extraction is NOT domain-gated; it's the V1 default-on library via `ensureBundledForgeModa`. Tutorial is similarly default-on onboarding content. Mirror `ensureBundledForgeModa` directly.
- Opt-out: user deletes the `forge-tutorial/` folder; partial-deletion is respected per the existing pattern (the same way `forge-moda` deletions persist).
- Less surface: option (b) is purely additive; option (a) would require updating `ensureForgeTomlStub` to default `domains = ["tutorial", "moda"]`, affecting all new vaults' domain semantics.

## §1 — Investigation phase (brief, mostly verification)

Investigation-first per cc-prompt-queue.md §78 is light here because the territory is well-mapped (mirror of existing forge-moda pattern). CC verifies the pattern then proceeds to fix.

### §1.1 — Verify existing forge-moda bundle plumbing

Read end-to-end and cite line numbers:

- `~/projects/forge-client-obsidian/src/welcome.ts` `ensureBundledForgeModa` (~line 361). Inputs, outputs, source/target paths, version-drift logic, error handling.
- `~/projects/forge-client-obsidian/src/welcome.ts` `KNOWN_BUNDLED_LIBRARIES` (line 17). The set currently has `'forge-moda', 'forge-music'`. New entry: `'forge-tutorial'`.
- `~/projects/forge-client-obsidian/src/chips.ts` `KNOWN_BUNDLED_LIBRARIES` (line 65). Duplicate set; same addition needed.
- `~/projects/forge-client-obsidian/scripts/release.sh` — release-preflight drift check for bundled vaults. Identify how forge-moda's drift is detected and extend the same logic to forge-tutorial.
- `~/projects/forge-client-obsidian/scripts/` directory — locate the forge-moda sync script. CC searches; if no dedicated sync script exists (the bundle may be hand-synced or sync-script-deferred), surface that finding and decide whether to ship one for forge-tutorial AND retroactively for forge-moda, OR document the gap as known-tech-debt.
- `~/projects/forge-client-obsidian/assets/vaults/forge-moda/` — current bundled structure. forge-tutorial bundle mirrors this layout (forge.toml, _meta/, chapter directories, content files).

### §1.2 — Confirm forge-tutorial source structure

Read `~/projects/forge-tutorial/`. Expected:

- `forge.toml` — `name = "forge-tutorial"`, `version = "0.1.0"`, `domains = []` (core-only).
- `README.md`
- `_meta/_chips.md` (schema-v3 floor synthetics)
- Chapter directories `01-hello/` through `09-slots/`. Each has a title-named lesson note (`Hello.md`, etc.), one or more canonical snippets, a per-chapter `_chips.md`.

Confirm chapter count = 9, source vault is complete, no broken refs.

### §1.3 — Investigation commit

Title: `[2026-06-07-1900-tier1-ship-bundle-forge-tutorial-and-auto-extract] phase 1: verify bundle-subset plumbing for forge-tutorial`

Investigation note at `~/projects/forge/docs/investigations/v0.2.76-tier1-ship.md` (or omit the note if findings are entirely captured in commit body — CC's call given the light investigation scope).

## §2 — Implementation

### §2.1 — Bundle forge-tutorial into plugin assets

Create `~/projects/forge-client-obsidian/assets/vaults/forge-tutorial/` as a complete mirror of `~/projects/forge-tutorial/`:

- Copy: `forge.toml`, `README.md`, `_meta/_chips.md`, all 9 chapter directories with their full content (lesson notes, canonical snippets, per-chapter `_chips.md` files).
- Preserve directory structure exactly.

### §2.2 — Sync script

Create `~/projects/forge-client-obsidian/scripts/sync-forge-tutorial.sh` mirroring the forge-moda sync script (if one exists). Standard shape:
- Reads source from `~/projects/forge-tutorial/`
- Writes target at `assets/vaults/forge-tutorial/`
- `rsync` or equivalent with `--delete` so removed source files vanish from the bundle
- Idempotent — running twice in succession is a no-op when source is unchanged

If no forge-moda sync script exists today, CC creates one for forge-moda AS PART OF this drain (per cc-prompt-queue.md §112: bundle-subset patterns ship with their drift detection). Both scripts land together; the gap that forge-moda has carried for 60+ releases is closed.

### §2.3 — Release-preflight drift detection

Extend `scripts/release.sh` so the preflight check fails the release if `assets/vaults/forge-tutorial/` drifts from `~/projects/forge-tutorial/`. Mirror the forge-moda drift check. Error message points at the sync script:

```
ERROR: forge-tutorial bundle has drifted from source.
Run: bash scripts/sync-forge-tutorial.sh
```

If forge-moda's drift check is missing in current code (per §2.2 finding), add it in the same drain so both bundles have parity.

### §2.4 — `ensureBundledForgeTutorial` in `welcome.ts`

Add a new function paralleling `ensureBundledForgeModa`. Add to `runFirstRunCheck` after the forge-moda extract section, before the forge-music section. Same idempotency + partial-deletion-respect semantics. Source-vault gate fires (don't extract into source repo).

Insert into `runFirstRunCheck` (after the forge-moda block at welcome.ts:181-188):

```typescript
// v0.2.76: extract bundled forge-tutorial content on first install +
// on forge.toml version drift. Mirrors ensureBundledForgeModa
// (forge-tutorial is the V1 default-on Tier 1 tutorial library).
//
// v0.2.66 source-vault gate also applies: a vault that IS the
// forge-tutorial source repo doesn't get re-extraction into itself.
if (shouldSkipBundledExtract(sourceVaultName)) {
  console.log(
    `Forge: skipping forge-tutorial extraction — vault root declares ` +
    `itself as source repo for ${sourceVaultName}`,
  );
} else {
  await ensureBundledForgeTutorial(app);
}
```

Define `ensureBundledForgeTutorial` later in welcome.ts mirroring `ensureBundledForgeModa`'s signature, error handling, version-drift logic, and backup-on-drift semantics.

### §2.5 — `KNOWN_BUNDLED_LIBRARIES` expansion

Add `'forge-tutorial'` to BOTH:
- `~/projects/forge-client-obsidian/src/welcome.ts` line 17
- `~/projects/forge-client-obsidian/src/chips.ts` line 65

This ensures: (i) source-vault detection fires when the user opens `~/projects/forge-tutorial/` as a vault (per the existing `isSourceVault` machinery), and (ii) chip palette correctly identifies forge-tutorial as a known bundled library.

### §2.6 — Auto-re-extract on `forge.toml` version drift

Per v0.2.38 mechanism: when bundled forge-tutorial's `forge.toml` version differs from extracted version, plugin backs up old extracted vault to `forge-tutorial.bak.<old-version>/` and re-extracts. `ensureBundledForgeTutorial` inherits this logic from the forge-moda template.

### §2.7 — Onboarding doc pointer

Add ONE LINE to `~/projects/forge-moda-bootstrap/closed-beta-onboarding.md` §5 (the first-Forge-click section). Suggested text (CC may refine):

> After Forge-clicking `welcome.md`, open `forge-tutorial/README.md` and start with `01-hello/Hello.md` — a 9-chapter walk from your first Forge-click to composing your own snippets.

### §2.8 — INSTALL.md update + manifest bump

Per cc-prompt-queue.md §347. Manifest 0.2.75 → 0.2.76. INSTALL.md version pins (5 occurrences) updated.

## §3 — Tests (per cc-prompt-queue.md §120-129 for new-feature shape)

This is a new feature (additive ensureBundledForgeTutorial path + new bundled vault). New-feature shape per §120-129: tests required before declaring done, failing-first ordering NOT mandatory.

Test cases:

1. **`ensureBundledForgeTutorial` happy path**: stub adapter with empty vault. Function extracts all 9 chapter directories + README + forge.toml + _meta. Verify expected files exist post-extraction.
2. **`ensureBundledForgeTutorial` skip-existing**: stub adapter with vault already containing forge-tutorial/. Function detects + skips re-extract.
3. **`ensureBundledForgeTutorial` partial deletion respected**: stub adapter with forge-tutorial/ present but user deleted one chapter. Function does NOT re-extract (respects user intent).
4. **`ensureBundledForgeTutorial` source-vault gate**: stub adapter with forge.toml declaring `name = "forge-tutorial"`. `shouldSkipBundledExtract` returns true → function not invoked. (Test the gate path in runFirstRunCheck, not the function itself.)
5. **`ensureBundledForgeTutorial` version drift**: stub adapter with forge-tutorial/forge.toml at version 0.0.9, bundled at 0.1.0. Function backs up old → `.bak.0.0.9` + re-extracts.
6. **Sync script idempotence**: run sync-forge-tutorial.sh twice; second run is a no-op (no diff).
7. **Drift detection in release.sh**: artificially desync (edit a bundled file), run release.sh preflight, expect failure with sync-script pointer in error.

Test placement:
- `welcome.ts` integration tests at `~/projects/forge-client-obsidian/src/welcome.test.ts` (or extracted helper test if a pure-core extraction is needed for `ensureBundledForgeTutorial`).
- Sync script + drift detection tests as shell-script smoke or `tests/scripts/` invocations.

Plugin suite baseline post-v0.2.75: 499. New baseline: ~505 (+~6 new welcome tests).

## §4 — Release ship

Per cc-prompt-queue.md §339:

1. Bump `~/projects/forge-client-obsidian/manifest.json` per placeholder.
2. **forge-tutorial `forge.toml` bump**: NO bump needed for THIS drain (the bundled version starts at the source repo's current 0.1.0; future content updates trigger drift re-extract per §2.6).
3. `scripts/release.sh` per current automation — should pass with new drift check in place.
4. Tag pushed, GH release published.

No forge-transpile redeploy needed.

## §5 — User-side smoke (CC writes post-implementation)

Pre-spec'd Step 1 per cc-prompt-queue.md §187: install v0.2.76 into a fresh vault + verify forge-tutorial extracts.

```
# Step 1 — install into a fresh vault:
mkdir -p ~/forge-vaults/v0.2.76-tier1-smoke
VAULT=~/forge-vaults/v0.2.76-tier1-smoke bash ~/projects/forge-client-obsidian/scripts/install-latest.sh

# Step 2 — open vault in Obsidian. Verify in DevTools console:
#   Forge: extracted bundled forge-tutorial into vault
# (or: skip-existing if pre-existing extraction).

# Step 3 — verify forge-tutorial extracted to vault root:
ls ~/forge-vaults/v0.2.76-tier1-smoke/forge-tutorial/
# Expected: 01-hello/ through 09-slots/ + README.md + forge.toml + _meta/

# Step 4 — open forge-tutorial/README.md in Obsidian. Verify content renders.

# Step 5 — open forge-tutorial/01-hello/Hello.md. Follow chapter 1's first
# Forge-click instructions. Verify it works end-to-end.

# Step 6 — source-vault gate check: open ~/projects/forge-tutorial/ as a
# vault in Obsidian. Verify console shows:
#   Forge: skipping forge-tutorial extraction — vault root declares
#   itself as source repo for forge-tutorial
# (i.e., the forge-tutorial source repo doesn't get bundled-extract pollution.)

# Step 7 — partial-deletion respect: in the v0.2.76 smoke vault, delete one
# chapter (e.g., rm -rf forge-tutorial/05-conditionals). Reload Obsidian.
# Verify the chapter is NOT re-extracted (user intent respected).
```

Failure modes keyed by step.

Plus regression: existing forge-moda extraction still works on fresh vault.

## §6 — Auto-smoke CC must run

Per cc-prompt-queue.md §133-181:

1. `npm run build` exit 0.
2. `npm test` all green (new ~6 tests + baseline 499 = ~505).
3. `scripts/release.sh 0.2.76` clean, including new drift preflight passing for both forge-moda AND forge-tutorial.
4. Sync script smoke: run `bash scripts/sync-forge-tutorial.sh` from sandbox; verify the bundle matches source byte-for-byte after.
5. Clean-vault install smoke (per cc-prompt-queue.md §296): fresh test directory, install v0.2.76, verify forge-tutorial extracts as expected.

If any auto-smoke fails, fix and re-verify.

## §7 — Feedback file shape

Per cc-prompt-queue.md §30-46:

- §0 — release coordinates (manifest before/after, forge-tutorial first-bundled-version 0.1.0, commits, tag, GH URL, zip SHA, asset footprint delta).
- §1 — Investigation findings (per §1.1 — bundle-subset plumbing verification + sync-script existence finding).
- §2 — Implementation summary: new files, modified files, line counts. Especially: did CC also retroactively add a forge-moda sync script per §2.2 finding? Document the call.
- §3 — Tests (new-feature shape per cc-prompt-queue.md §120-129).
- §4 — User-side smoke checklist per §5 of this prompt.
- §5 — Auto-smoke results (auto-verified vs deferred-to-user split).
- §6 — Open follow-ups: e.g., (i) Tier-2 / Tier-3 tutorial bundling if/when authored, will follow this same pattern; (ii) any forge-moda sync-script gaps surfaced in §2.2.

Post the same report in chat per cc-prompt-queue.md §43.

## §8 — Self-contained context for CC

- Source vault: `~/projects/forge-tutorial/` — confirmed by driver to be content-complete (chapters 1-8 runnable; chapter 9 ready against v0.2.75 slot contract).
- forge-doc's proposal: `~/projects/forge-moda-bootstrap/messages/to-forge-core/done/2026-06-07-1744-proposal-tier1-ship-drain-bundle-and-auto-extract-tutorial.md`.
- Existing bundled-vault patterns to mirror: `welcome.ts` `ensureBundledForgeModa` (~line 361) + `ensureBundledForgeMusic` (~line 384). KNOWN_BUNDLED_LIBRARIES at welcome.ts:17 + chips.ts:65.
- Constitution: `~/projects/forge/docs/specs/constitution.md`. Mission preamble + S-series + B7.1 + B7.3 + B8 (recently amended for locked_english_hash). Forge-tutorial is core-only (`domains = []`); no B9 domain registration needed.
- Pure-core convention: cc-prompt-queue.md §86-118.
- Bundle-subset rule: cc-prompt-queue.md §112 — sync script + drift detection MUST land in the SAME prompt as the bundle.
- Version-bump sanity check: cc-prompt-queue.md §347.
- Default-on git ops: cc-prompt-queue.md §339.
- Closed-beta-onboarding doc to edit: `~/projects/forge-moda-bootstrap/closed-beta-onboarding.md` §5.
- "Assert cannot only with concrete error" HARD RULE: `~/projects/forge-moda-bootstrap/cowork-forge-protocol.md`.
- "Forge-core's CC-drain review is always-on" HARD RULE: same protocol file §77.

## §9 — Acceptance criteria

- `assets/vaults/forge-tutorial/` exists as complete mirror of source repo.
- Sync script at `scripts/sync-forge-tutorial.sh` (idempotent).
- Drift detection in `scripts/release.sh` (fails preflight on bundled-vs-source divergence, error message points at sync script).
- `ensureBundledForgeTutorial` in welcome.ts mirrors `ensureBundledForgeModa` semantics (extract on first install, version-drift re-extract, partial-deletion respected, source-vault gate fires).
- `KNOWN_BUNDLED_LIBRARIES` updated in both welcome.ts AND chips.ts.
- `closed-beta-onboarding.md` §5 one-line pointer added.
- All tests green (engine + plugin); ~+6 new plugin tests.
- v0.2.76 released cleanly via release.sh.
- Smoke checklist §5 ready for driver to run.

If investigation surfaces blocker (e.g., forge-moda sync script doesn't exist + retroactive addition expands scope substantially), STOP and route to `questions/`. Don't quietly expand scope without surfacing.
