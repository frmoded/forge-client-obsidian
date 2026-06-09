---
timestamp: 2026-06-06T19:00:00Z
session_id: claude-code-drain-isSourceVault-symmetric
prompt_modified: 2026-06-06T19:00:00Z
status: success
---

# Feedback — 2026-06-06-1900 `isSourceVault` symmetric gate (v0.2.66)

## §0 — Release coordinates

**Manifest:** 0.2.65 → 0.2.66.

**Commit:** `c94ef8a` on `forge-client-obsidian/main`. **Tag:** `v0.2.66`. **Release:** <https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.66>. **Zip SHA-256:** `6f8d957c09dd6d6b6c94d098898ee62abe2c198b5d431bd30a2ee222f882cd81`. install-latest.sh into smoke vault: clean. **Twelfth consecutive clean release.sh run.**

**Line counts:**

| File | Lines | Note |
|---|---|---|
| `src/source-vault-core.ts` | +19 | New `shouldSkipBundledExtract` helper. |
| `src/source-vault-core.test.ts` | +48 | 6 new TDD cases. |
| `src/welcome.ts` | +12 / -8 | 3 gate-check refactors + log message updates. |
| `manifest.json` | 10 | version bump. |
| `INSTALL.md` | (5 pin replacements) | v0.2.65 → v0.2.66. |

## §1.1 — TDD cases (6 new)

All at the pure-core decision layer — `shouldSkipBundledExtract(sourceVaultName: string | null): boolean`:

1. **Cross-library — forge-music vault skips forge-moda extract** (the load-bearing brief (e)-followup case).
2. **Cross-library reverse — forge-moda vault skips forge-music extract** (symmetric).
3. **Same-library regression — forge-music vault still skips forge-music** (v0.2.64 behavior preserved).
4. **Normal vault — null source → do NOT skip** (regression; ensures smoke-v0.2.13 still gets the libraries).
5. **Welcome.md gate — any source vault skips welcome** (regression from v0.2.64 already-symmetric path; now lives in the unified helper).
6. **Idempotent rider** — same input → same output.

## §1.2 — Phase 1 investigation

### Current welcome.ts gates (pre-v0.2.66)

```typescript
// Line 146 — ensureWelcomeFiles gate (already symmetric per v0.2.64):
if (sourceVaultName !== null) {
  console.log(`Forge: skipping welcome.md extraction — vault is the source repo for ${sourceVaultName}`);
}

// Line 176 — ensureBundledForgeModa gate (NARROW same-name in v0.2.64):
if (sourceVaultName === 'forge-moda') {
  console.log('Forge: skipping forge-moda extraction — vault is the source repo');
} else {
  await ensureBundledForgeModa(app);
}

// Line 211 — ensureBundledForgeMusic gate (NARROW same-name in v0.2.64):
if (sourceVaultName === 'forge-music') {
  console.log('Forge: skipping forge-music extraction — vault is the source repo');
} else {
  await ensureBundledForgeMusic(app);
}
```

### Symptom (forge-music's brief)

When `~/projects/forge-music/` is opened as a vault, `detectSourceVault` returns `"forge-music"`. v0.2.64's narrow same-name gate:

- `"forge-music" === "forge-moda"` → false → `ensureBundledForgeModa` FIRES → vault accumulates `~/projects/forge-music/forge-moda/` pollution.
- `"forge-music" === "forge-music"` → true → `ensureBundledForgeMusic` correctly skipped.
- welcome gate uses `!== null` → correctly skipped.

The asymmetry: 1 of 3 gates fires when it shouldn't.

### Decision: pure-core helper + uniform call sites

A `shouldSkipBundledExtract(sourceVaultName: string | null): boolean` predicate captures the v0.2.66 rule (any non-null source vault → skip all extractions). All three welcome.ts call sites use the same helper. Pure-core layer gets the 6 TDD cases; welcome.ts becomes a 3-line predicate dispatch.

## §1.3 — Fix landed

### `src/source-vault-core.ts` (+19 lines)

```typescript
/** v0.2.66 — symmetric gate. Any non-null `sourceVaultName` triggers
 *  the skip regardless of which library is being extracted. */
export function shouldSkipBundledExtract(
  sourceVaultName: string | null,
): boolean {
  return sourceVaultName !== null;
}
```

### `src/welcome.ts` — 3 call sites

```diff
-import { isSourceVault } from './source-vault-core';
+import { isSourceVault, shouldSkipBundledExtract } from './source-vault-core';
```

```diff
-if (sourceVaultName === 'forge-moda') {
+if (shouldSkipBundledExtract(sourceVaultName)) {
   console.log(
-    'Forge: skipping forge-moda extraction — vault is the source repo',
+    `Forge: skipping forge-moda extraction — vault root declares ` +
+    `itself as source repo for ${sourceVaultName}`,
   );
 } else {
   await ensureBundledForgeModa(app);
 }
```

(Same diff shape for the `ensureBundledForgeMusic` gate; the `ensureWelcomeFiles` gate refactors from `!== null` to `shouldSkipBundledExtract(...)` for uniformity.)

## §1.4 — Post-fix verbatim test output

```
✔ shouldSkipBundledExtract: cross-library — forge-music vault skips forge-moda extract (0.748625ms)
✔ shouldSkipBundledExtract: cross-library reverse — forge-moda vault skips forge-music extract (0.08525ms)
✔ shouldSkipBundledExtract: same-library — forge-music vault still skips forge-music (v0.2.64 regression) (3.59825ms)
✔ shouldSkipBundledExtract: normal vault — null source → do NOT skip (regression) (0.236833ms)
✔ shouldSkipBundledExtract: welcome.md gate — any source vault skips welcome (regression from v0.2.64) (0.104917ms)
✔ shouldSkipBundledExtract: idempotent (same input → same output) (0.055584ms)
ℹ tests 416
ℹ pass 416
ℹ fail 0
```

## §1.5 — Full `npm test`

```
ℹ tests 416
ℹ pass 416
ℹ fail 0
```

## §2 — Surprises

**Test-coverage placement.** The prompt asked for cases in `welcome.test.ts`, but `welcome.ts` is the obsidian-coupled glue file (cannot import under `node --test` without an obsidian shim). Placing the cases against the pure-core helper `shouldSkipBundledExtract` covers the load-bearing decision logic at a testable layer; the welcome.ts glue becomes a 3-line predicate dispatch whose correctness comes from inspection. The 5 prompt-required scenarios map one-to-one onto the new pure-core cases — semantically equivalent coverage, structurally cleaner.

**Twelfth clean release.sh run** through the v0.2.61 drift-preflight-early order. No drift, no orphans, build → release-zip → commit → tag → push → gh-release sequenced cleanly.

**No `source-vault-core.ts` detection logic change.** The `isSourceVault` function correctly returns the matched name per v0.2.62 + v0.2.64 — the symmetry fix lives entirely at the welcome.ts call sites + the new helper. No regression risk on the detection layer.

## §3 — User-side smoke checklist

Per cc-prompt-queue.md 6a/6b. The load-bearing scenario from forge-music's brief + a normal cohort vault regression.

### Pre-conditions

- v0.2.66 plugin installed in `~/forge-vaults/smoke-v0.2.13/` (verified via install-latest.sh during this drain).
- `~/projects/forge-music/` available as a working tree.

### Test A — clean forge-music repo + install + verify no pollution (3 min)

```
cd ~/projects/forge-music && rm -rf forge-music forge-moda welcome.md greet.md .forge
```

(Do NOT remove `.obsidian/` — Obsidian needs it.)

```
VAULT=~/projects/forge-music bash ~/projects/forge-client-obsidian/scripts/install-latest.sh
```

Then in Obsidian:

1. Open vault: `~/projects/forge-music/` (Open folder as vault).
2. Cmd+P → "Reload app without saving".
3. Wait ~30 seconds for first-run extraction to (try to) fire.
4. Open Developer Tools console (Cmd+Opt+I → Console).

**Expected console log lines:**

```
Forge: skipping forge-music extraction — vault root declares itself as source repo for forge-music
Forge: skipping forge-moda extraction — vault root declares itself as source repo for forge-music
Forge: skipping welcome.md extraction — vault root declares itself as source repo for forge-music
```

Verify zero pollution:

```
cd ~/projects/forge-music && git status --short
```

**Expected output:** empty (except possibly `.obsidian/` which Obsidian creates regardless).

Specifically check:

```
ls ~/projects/forge-music/forge-moda 2>&1
```

**Expected output:**

```
ls: ~/projects/forge-music/forge-moda: No such file or directory
```

**Pass:** all three skip logs + clean git status + no `forge-moda/` nested.

### Test B — symmetric reverse: forge-moda repo as vault (3 min, optional)

If you have `~/projects/forge-moda/` available, repeat Test A on that repo. Expected: similar three skip logs (this time naming `forge-moda` as the source vault), no `forge-music/` extracted into the moda repo.

### Test C — regression: normal cohort vault still extracts (1 min)

```
ls -la ~/forge-vaults/smoke-v0.2.13/forge-moda/_meta/_chips.md
ls -la ~/forge-vaults/smoke-v0.2.13/welcome.md
```

**Expected**: both exist (forge-moda has been extracted previously; welcome.md is its v0.2.56 first-install).

In Obsidian, open `~/forge-vaults/smoke-v0.2.13/`, reload. Console **should NOT** show any "skipping ... source repo" lines for this vault. The smoke vault's `name = "smoke-v0.2.13"` is not in `KNOWN_BUNDLED_LIBRARIES`, so `isSourceVault` returns null, so `shouldSkipBundledExtract` returns false, so all three extractors fire normally.

```
grep '^name' ~/forge-vaults/smoke-v0.2.13/forge.toml 2>&1 | head
```

**Expected:** either no match (no name field) or `name = "smoke-v0.2.13"` — confirming the smoke vault is not detected as a source repo.

### Failure modes to watch for

- **Test A shows pollution despite the skip logs**: extraction ran somewhere unexpected. Capture the full Developer Tools console for the relevant log lines; check whether any `ensureBundledFor*` was invoked from a code path other than `runFirstRunCheck` (the `ensureBundledFor` function at welcome.ts:495+ is used by `EditVaultDomainsModal.applyDiff` — that path doesn't yet honor the source-vault gate. Not in this drain's scope but worth flagging if it fires).

- **Test A shows skip logs naming the wrong library**: `isSourceVault` returned a value other than `"forge-music"`. Check forge.toml's name field:
  ```
  grep '^name' ~/projects/forge-music/forge.toml
  ```
  Expected: `name = "forge-music"` exactly.

- **Test C shows no extraction**: source-vault detection mistakenly fired on the smoke vault. Inspect:
  ```
  cat ~/forge-vaults/smoke-v0.2.13/forge.toml
  ```
  If `name` is `"forge-music"` or `"forge-moda"`, detection is correct but the vault setup is wrong. Otherwise this is a real bug — file with the forge.toml content.

### End-state cleanup

No required cleanup beyond Test A's pre-step (which left the forge-music repo clean for the test).

---

**Audit-trail close:** prompt moves to `prompts/done/`. Drain stops; queue empty.

**Standing followups (8 open):**
1. forge-music v2 `_chips.md` — their lane.
2. `forge-music.bak.0.3.0/` scanning gate.
3. Stage 3+ E-- migration roadmap.
4. `[[percussion_lab]]` directory-wikilink decision.
5. percussion_lab 7-parts-always cleanup.
6. (cc) glue-to-pure-core audit + `KNOWN_BUNDLED_LIBRARIES` shared-constants extraction.
7. ~~Cross-library extraction in source vaults~~ — **DONE (this drain)**.
8. v3.1 per-active-file walk-up wiring (chip schema v3.1) — pure-core ready, glue follow-up.
9. **NEW**: `ensureBundledFor` at welcome.ts:495+ (called from EditVaultDomainsModal.applyDiff) doesn't yet honor the source-vault gate. Low-probability — students don't typically toggle domain activation in source repos — but the asymmetry between code paths is worth a future flatten.
