# `isSourceVault` symmetric gate — skip ALL bundled extracts when vault is ANY source repo

> **CC pre-drain reminder (HARD RULE per cc-prompt-queue.md):** before reading this prompt, re-read `~/projects/forge-moda-bootstrap/cc-prompt-queue.md` end-to-end.

## Scope

Per forge-music's relay (action item #3 from their 2026-06-06 list): the v0.2.64 fix gates auto-extract only when the vault root's `forge.toml` `name` matches the SAME bundled library being extracted. When `~/projects/forge-music/` is opened as a vault (`name = "forge-music"`), `ensureBundledForgeMusic` is correctly skipped — but `ensureBundledForgeModa` still fires because `"forge-music" !== "forge-moda"`. The vault root accumulates `~/projects/forge-music/forge-moda/` pollution despite the v0.2.64 source-vault discipline.

Fix: symmetric application of the gate. When `isSourceVault()` returns a non-null value (i.e., the vault IS a source repo for ANY known bundled library, not just the same one being extracted), skip ALL bundled extractions including `ensureWelcomeFiles`.

Cross-reference: standing follow-up #7 in the (e) drain feedback at `~/projects/forge-moda-bootstrap/prompts/feedback/2026-06-06-1030-source-vault-detection-skip-auto-extract.md` line 358.

What this prompt does NOT do:
- Change `isSourceVault` detection logic — it already returns the matched name correctly per v0.2.62 + v0.2.64.
- Touch the chip-discovery side of `source-vault-core.ts` (separate concern; v0.2.62 work).
- Add a settings UI for "I really want extraction in this source vault."
- Touch any tests at the `isSourceVault` layer — only the gate-application logic in welcome.ts changes.

## Why

Forge-music opens `~/projects/forge-music/` as their primary dev workflow. The v0.2.64 fix solved the same-name case but didn't address the cross-library case. Every plugin upgrade still re-pollutes their working tree with `forge-music/forge-moda/`. Same Mission/cost-to-tweak issue as v0.2.64 — just the symmetric form.

Per Mission's speed-second criterion: tiny scope (3 boolean-check changes in welcome.ts), CC self-validates via the existing source-vault-core tests + new gate-application tests.

## Files likely to touch

- **`~/projects/forge-client-obsidian/src/welcome.ts`** — three gate checks at the call sites of `ensureWelcomeFiles`, `ensureBundledForgeModa`, `ensureBundledForgeMusic`. Today (per v0.2.64): each helper checks if the source-vault name MATCHES its own bundled library; if yes, skip. Change: each helper skips if `isSourceVault()` returns ANY non-null value.
- **`~/projects/forge-client-obsidian/src/welcome.test.ts`** — extend with cross-library cases (3-4 new tests).
- **`~/projects/forge-client-obsidian/manifest.json`** — `{CURRENT} → {NEXT_PATCH}` placeholder.
- **`~/projects/forge-client-obsidian/INSTALL.md`** — version pin update.

No `source-vault-core.ts` changes; the detection function is correct.

## Implementation notes

Phase 1 — verify current shape (small, no separate commit):

Read `src/welcome.ts` lines ~133-158 per forge-music's brief pointer. Confirm each `ensure*` helper currently checks `sourceVaultName === <expected-name-for-this-helper>`. Cite the exact lines.

Phase 2 — make the gates symmetric:

For each of the three call sites:
- Replace `if (sourceVaultName === "forge-music")` (or equivalent) with `if (sourceVaultName !== null)`.
- Log message updates to reflect the broader skip semantic (e.g., "Forge: skipping forge-music extraction — vault root declares itself as source repo for `<sourceVaultName>`").

The three call sites in welcome.ts (per v0.2.64):
- `ensureWelcomeFiles` — already gates on ANY source vault per v0.2.64. Verify; no change expected.
- `ensureBundledForgeModa` — currently gates on `sourceVaultName === "forge-moda"`. Change to `sourceVaultName !== null`.
- `ensureBundledForgeMusic` — currently gates on `sourceVaultName === "forge-music"`. Change to `sourceVaultName !== null`.

## Tests — TDD discipline

Extend `welcome.test.ts`:

1. **Cross-library skip**: vault root forge.toml `name = "forge-music"` triggers `ensureBundledForgeModa` (since `domains = ["moda"]` declared too). Expected: `ensureBundledForgeModa` does NOT extract. Console log mentions source-vault gate.
2. **Cross-library skip (reverse)**: vault root forge.toml `name = "forge-moda"` triggers `ensureBundledForgeMusic`. Same shape.
3. **Same-library skip (regression)**: vault root forge.toml `name = "forge-music"` — `ensureBundledForgeMusic` still correctly skipped (v0.2.64 behavior preserved).
4. **Normal vault (regression)**: vault root forge.toml `name = "smoke-v0.2.13"` — both `ensureBundledForgeMusic` and `ensureBundledForgeModa` extract normally.
5. **Welcome.md gate (regression)**: vault root `name = "forge-music"` — `ensureWelcomeFiles` correctly skipped.

## User-side smoke (CC writes §3 per 6a/6b)

The load-bearing scenario from forge-music's brief:

1. Pre-condition: clean `~/projects/forge-music/` of any leftover pollution from prior runs:
   ```
   cd ~/projects/forge-music && rm -rf forge-music forge-moda welcome.md greet.md .forge
   ```
2. Install v0.X.X plugin (`install-latest.sh` with `VAULT=~/projects/forge-music`).
3. Open Obsidian on `~/projects/forge-music`. Reload Obsidian. Wait ~30 sec for first-run extraction to fire.
4. Verify NO pollution:
   ```
   cd ~/projects/forge-music && git status --short
   ```
   Expected: empty (other than possibly `.obsidian/` which Obsidian creates regardless of plugin behavior).

5. Devtools console expected log lines:
   - `Forge: skipping forge-music extraction — vault root declares itself as source repo for forge-music`
   - `Forge: skipping forge-moda extraction — vault root declares itself as source repo for forge-music`
   - `Forge: skipping welcome.md extraction — vault root declares itself as source repo for forge-music`

6. Regression check on a normal cohort vault (`~/forge-vaults/smoke-v0.2.13/` with `name = "smoke-v0.2.13"`): both forge-music and forge-moda extract normally on reload.

## Out of scope

- Source-vault detection itself (correct per v0.2.62 + v0.2.64).
- Chip-discovery behavior (`source-vault-core` is shared; this prompt's changes don't affect that).
- Configuration UI for "extract anyway" override.

## Don'ts

- Don't change `isSourceVault` detection logic.
- Don't drop existing same-name regression tests.
- Don't bump versions concretely — placeholder.

## Report when done

Standard §0–§3 per cc-prompt-queue.md. §3 user-side smoke covers the forge-music repo scenario + a normal cohort vault regression.
