# Source-vault detection — skip auto-extract when source repo is opened as a vault

> **CC pre-drain reminder (HARD RULE per cc-prompt-queue.md):** before reading this prompt, re-read `~/projects/forge-moda-bootstrap/cc-prompt-queue.md` end-to-end. Re-read constitution V2a v9 and `~/projects/forge/docs/specs/chips-schema.md` for context.

## Scope

Per forge-music's Brief (e): when forge-music's source repo (`~/projects/forge-music/`) is opened directly as an Obsidian vault, the plugin's auto-extract logic treats it as a user vault wanting the music library, and extracts the bundled `forge-music` (and `forge-moda`) INTO the source repo's working tree. The source repo accumulates:

```
~/projects/forge-music/forge-music/    # nested duplicate (stale bundle)
~/projects/forge-music/forge-moda/     # bundled forge-moda
~/projects/forge-music/welcome.md      # welcome.md extraction
~/projects/forge-music/greet.md        # greet.md extraction
~/projects/forge-music/.forge/         # edge-snapshot dir
~/projects/forge-music/.obsidian/      # Obsidian config
```

Forge-music has been manually cleaning up the pollution after every plugin upgrade. The fix: a vault-root detection that skips auto-extract when the vault IS a source repo for a bundled library.

Fix shape (forge-music's leaned proposal, agreed): a pure-core `isSourceVault(rootTomlBody)` helper that returns the matching bundled-library name when the vault root's `forge.toml` `name` field matches a known bundled library, otherwise `null`. All auto-extract helpers gate on this check.

What this prompt does NOT do:
- Add a `.forgeignore` or per-repo configuration mechanism (over-architecture).
- Change Obsidian's `.obsidian/` directory creation (not our code).
- Change the `.forge/` snapshot directory creation (separate concern; useful even in source vaults during dev).
- Touch chip discovery (separate brief (c)). The same `isSourceVault` helper will be USED by brief (c)'s prompt — drain whichever ships first; the second drain extends if the helper exists.

## Why

Per Mission: every stray file the user has to clean up is friction. Forge-music's primary workflow (developing in source repo as a vault) is currently a footgun: every plugin upgrade re-pollutes their working tree. The fix is a silent guard that respects the explicit `name = "forge-music"` declaration.

Plus: this affects future contributors. Anyone who clones forge-music or forge-moda and opens it as a vault encounters the same footgun. Code-path fix is the right answer; process-doc workarounds will be forgotten.

## Phase shape — investigation-before-design rider

**Phase 1 — investigation**:

1. Read `~/projects/forge-client-obsidian/src/welcome.ts` and identify the auto-extract entry points: `ensureBundledForgeMusic`, `ensureBundledForgeModa`, `ensureWelcomeFiles`. Confirm they're all invoked from `runFirstRunCheck` (or equivalent).
2. Check if `source-vault-core.ts` already exists (brief (c)'s prompt may have shipped it as Pure-core extraction #23). If yes — extend it; if no — create it.
3. Read `~/projects/forge-music/forge.toml` and `~/projects/forge-moda/forge.toml` to confirm what's in `name` field and how it maps to bundled-library identity. Confirm `name = "forge-music"` matches the bundled library's identity.
4. Cite the line in welcome.ts where `ensureBundledForgeMusic` would benefit from the guard. Same for `ensureBundledForgeModa` and `ensureWelcomeFiles`.
5. Consider the "what if the user wants to OVERRIDE the source-vault detection" case (e.g., they're testing the plugin in their own source repo). Decide: either accept the override doesn't exist (silent guard is silent), OR add an opt-out frontmatter flag. My recommendation: silent guard; no opt-out. If they really want extraction, they can manually copy from the bundle.

**Phase 2 — fix**:

- Create or extend `source-vault-core.ts` with `isSourceVault` helper.
- Add the guard to `ensureBundledForgeMusic` (skip if `isSourceVault` returns `"forge-music"`).
- Add the guard to `ensureBundledForgeModa` (skip if returns `"forge-moda"`).
- Add the guard to `ensureWelcomeFiles` (skip if returns ANY non-null source-vault identity — source repos shouldn't get welcome files either).
- TDD coverage.

## Files likely to touch

Phase 1: read-only.

Phase 2:
- **`~/projects/forge-client-obsidian/src/source-vault-core.ts`** — NEW or EXTEND (depending on brief (c) drain order). Pure-core extraction #23 (or extended).
- **`~/projects/forge-client-obsidian/src/source-vault-core.test.ts`** — NEW. TDD cases.
- **`~/projects/forge-client-obsidian/src/welcome.ts`** — three call sites updated to gate on `isSourceVault`.
- **`~/projects/forge-client-obsidian/src/welcome.test.ts`** — extend with cases covering the guard.
- **`~/projects/forge-client-obsidian/manifest.json`** — `{CURRENT} → {NEXT_PATCH}` placeholder.
- **`~/projects/forge-client-obsidian/INSTALL.md`** — version pin update.

(No constitution touch — implementation detail; the existing welcome-flow extraction rules are unchanged for normal vaults.)

## Tests — TDD discipline

### `source-vault-core.test.ts`

1. `isSourceVault(null)` → `null`.
2. `isSourceVault("")` → `null`.
3. `isSourceVault('name = "forge-music"')` → `"forge-music"`.
4. `isSourceVault('name = "forge-moda"')` → `"forge-moda"`.
5. `isSourceVault('name = "my-cohort-vault"')` → `null`.
6. `isSourceVault('domains = ["music"]')` → `null` (no name field).
7. `isSourceVault` with multi-line `forge.toml` containing name field → returns matching name.
8. Names not in the known-bundled-library list → null.
9. Idempotent.

### `welcome.test.ts` extension

10. `ensureBundledForgeMusic` skips when vault root forge.toml `name = "forge-music"`. Console log "Forge: skipping forge-music extraction — vault is the source repo".
11. `ensureBundledForgeMusic` proceeds normally when vault root has `name = "test1"` and `domains = ["music"]`. Regression test for normal cohort vaults.
12. `ensureBundledForgeModa` skips when vault root forge.toml `name = "forge-moda"`.
13. `ensureWelcomeFiles` skips when vault root forge.toml `name` matches ANY known source. Console log "Forge: skipping welcome.md extraction — vault is a source repo for {name}".
14. `ensureWelcomeFiles` proceeds in a normal vault (regression).

## User-side smoke (CC writes §3 per 6a/6b)

Per cc-prompt-queue.md 6a/6b.

For forge-music's source repo (the brief's load-bearing scenario):

1. Pre-condition: `cd ~/projects/forge-music && git status --short` — capture current state. If there are leftover pollution items (`forge-music/`, `forge-moda/`, `welcome.md`, etc.), clean them up first:
   ```
   cd ~/projects/forge-music && rm -rf forge-music forge-moda welcome.md greet.md .forge
   ```
   (DO NOT remove `.obsidian/` — Obsidian needs it.)
2. Install v0.X.X plugin via install-latest.sh into `~/projects/forge-music/`.
3. Open `~/projects/forge-music/` as the vault in Obsidian. Reload Obsidian.
4. Wait ~30 seconds for first-run extraction to (try to) fire.
5. `cd ~/projects/forge-music && git status --short` — expect output is unchanged from the pre-condition (other than possibly `.obsidian/` which Obsidian creates regardless).
6. Verify devtools console shows the skip messages:
   - `Forge: skipping forge-music extraction — vault is the source repo`
   - `Forge: skipping welcome.md extraction — vault is a source repo for forge-music`

Negative case (normal cohort vault):
7. Install plugin in `~/forge-vaults/smoke-v0.2.13/` (which has `name = "smoke-v0.2.13"`, `domains = ["moda", "music"]`).
8. Reload Obsidian.
9. Verify forge-music, forge-moda, welcome.md all extract normally as before (regression).

Paste-able file checks: `ls -la ~/projects/forge-music/` should NOT show `forge-music/`, `forge-moda/`, `welcome.md`, `greet.md` post-extraction.

## Out of scope

- Chip discovery extension for Path A (brief (c); separate prompt, may share `source-vault-core.ts`).
- Chip insertion templating (brief (d); separate prompt).
- An opt-out flag for "I want extraction even in source vaults" (premature).
- Cleanup of EXISTING pollution in forge-music's repo (manual; one-time).
- Touching `.forge/` snapshot dir creation (separate concern).

## Don'ts

- Don't bump versions concretely — placeholder.
- Don't add destructive cleanup of pre-existing pollution. The guard is forward-only.
- Don't change Obsidian's `.obsidian/` directory behavior.
- Don't add a settings UI for the guard.
- Don't drain this AFTER brief (c) if brief (c) created `source-vault-core.ts` — coordinate the helper's location.

## Report when done

Standard §0–§3 per cc-prompt-queue.md with two-phase structure. §1.2 documents Phase 1's investigation. §3 user-side smoke includes both source-vault and normal-vault cases per the brief.

## Coordination note with brief (c)

If brief (c)'s drain (`prompts/2026-06-06-1000-chip-discovery-vault-root-as-library.md`) ships FIRST, it creates `source-vault-core.ts`. This drain (1030) extends the existing file.

If THIS drain (1030) ships first, it creates `source-vault-core.ts`. The 1000 drain consumes the existing helper.

Either order works; whichever ships second references the existing helper rather than re-creating it.
