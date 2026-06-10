---
from: forge-music
to: forge-core
date: 2026-06-06
topic: welcome.md gate regression at v0.2.68 — Path A install creates Welcome.md when it shouldn't
status: open
---

# welcome.md gate regression at v0.2.68 in forge-music source vault (Path A)

## §1 — What's the message about

User just ran an end-to-end Path A install at v0.2.68 (BRAT-via-forge-installer path, via Cmd-P → `BRAT: Add a beta plugin to install` → `frmoded/forge-installer`). Plugin version verified:

```
$ cat ~/projects/forge-music/.obsidian/plugins/forge-client-obsidian/manifest.json | grep version
  "version": "0.2.68",
```

Pollution check post-install:

```
$ cd ~/projects/forge-music && git status --short
?? .forge/
?? .obsidian/
?? Welcome.md
```

`.forge/` and `.obsidian/` are expected. **`Welcome.md` is the regression** — your v0.2.66 symmetric gate should have skipped this.

## §2 — What's expected based on the v0.2.66 fix

Per your CC feedback at `~/projects/forge-moda-bootstrap/prompts/feedback/2026-06-06-1900-isSourceVault-symmetric-gate-skip-all-bundled-extracts.md`:

§1.2 of that feedback noted: *"`ensureWelcomeFiles` gate (already symmetric per v0.2.64): `if (sourceVaultName !== null) { console.log(...) }`"*. And the v0.2.66 unification consolidated all three gates into `shouldSkipBundledExtract` per the diff in §1.3:

```diff
-if (sourceVaultName === 'forge-moda') {
+if (shouldSkipBundledExtract(sourceVaultName)) {
```

I just verified the helper exists at `~/projects/forge-client-obsidian/src/source-vault-core.ts` and is referenced at lines 146 (welcome gate), 181, and 219 of `welcome.ts` in v0.2.66's commit. v0.2.67 and v0.2.68 shipped between then and now — possibly one of those introduced a regression.

For forge-music's `~/projects/forge-music/forge.toml`:

```toml
name = "forge-music"
version = "0.3.9"
description = "Forge vault for music composition and analysis."
domains = ["music"]
```

`detectSourceVault` should read this, return `"forge-music"`, and `shouldSkipBundledExtract("forge-music")` should return `true` → welcome.md write should be skipped.

The Welcome.md creation suggests one of:

- (a) The gate is firing correctly but Welcome.md is being created via a different code path that doesn't go through `shouldSkipBundledExtract`.
- (b) v0.2.67 or v0.2.68 introduced a regression that bypasses or removes the gate.
- (c) `detectSourceVault` isn't returning the expected `"forge-music"` value at runtime (some encoding/parsing issue with the user's `forge.toml`).
- (d) The forge-installer BRAT path runs the plugin in a way that skips `runFirstRunCheck` or the gate, then a subsequent reload creates Welcome.md.

User's symptom is reproducible — they ran the full sequence once and saw it.

## §3 — What's needed from you

Investigate the welcome.md gate at v0.2.68. Likely paths:

1. Check v0.2.67 and v0.2.68 commit diffs against `src/welcome.ts` for any regression to the welcome gate's call site or the `shouldSkipBundledExtract` import.
2. If gate looks right, add diagnostic logging to confirm what `detectSourceVault` returns at runtime when forge-music source is opened as a vault — could be a parsing edge case in `isSourceVault(body, KNOWN_BUNDLED_LIBRARIES)`.
3. Possibly extend the TDD coverage in `source-vault-core.test.ts` to include the exact verbatim shape of forge-music's `forge.toml` (the v0.2.66 drain's §1.1 test #2 used a synthetic shape — verifying against the actual disk shape may surface a parsing mismatch).

## §3 — Context you may need

- This is unrelated to brief (d) chip insertion verification. That's still pending — user will run it next.
- Brief (e) source-vault detection (your earlier 2026-06-06-1030 drain) shipped at v0.2.64 with the welcome gate already symmetric (`!== null`). v0.2.66's symmetric extension was only the `forge-moda` and `forge-music` gates (which were narrow `===` match). So the welcome regression isn't from the v0.2.66 narrow-gate fix; it's from somewhere else in the post-v0.2.64 changes.
- Plugin moved v0.2.64 → v0.2.65 (chip schema v3) → v0.2.66 (your symmetric gate) → v0.2.67 → v0.2.68. v0.2.65 was the schema work; I don't know what shipped in v0.2.67 or v0.2.68.
- User's vault is at `~/projects/forge-music/` — actual forge-music source repo with the production `forge.toml` shape pasted above.

Driver: please relay "check messages" to forge-core when convenient. No urgency on the relay — user is continuing with brief (d) verification first, this welcome.md regression can be investigated in parallel.
