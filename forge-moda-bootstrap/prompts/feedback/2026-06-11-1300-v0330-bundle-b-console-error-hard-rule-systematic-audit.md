---
prompt: 2026-06-11-1300-v0330-bundle-b-console-error-hard-rule-systematic-audit.md
shipped_version: v0.2.130 (log-level pass; method-name prefix follow-up queued as v0.2.131)
session: drain-2026-06-11-1300
date: 2026-06-11
status: shipped-split per prompt §9
---

# v0330 feedback — Bundle B console.error HARD RULE audit (log-level pass)

## §1 — What shipped (v0.2.130)

Per prompt §9: "If the audit reveals an unexpectedly large number of violations (>30), surface and consider splitting into two drains."

Audit found **42 catch-block `console.warn` violations** > 30 threshold. Split per §9. This release ships the LOG-LEVEL part of the HARD RULE for all 42; method-name prefix work for sites that don't already self-document carries forward to v0.2.131.

### §1.1 — Sed-batch log-level conversion (42 sites)

Single sed pass across `src/*.ts` (excluding test files): `console.warn(..., e)` → `console.error(..., e)` in catch blocks. Pattern: `s/console\.warn\((.*), e\)/console.error(\1, e)/g` per file. 0 catch-warns remain (verified).

Files touched: `chips.ts` (4), `edges.ts` (1), `facet-mutex-view-plugin.ts` (3), `forge-action.ts` (3), `modal.ts` (2), `main.ts` (14), `output-view.ts` (2), `pyodide-host.ts` (1), `welcome.ts` (12).

Total catch-`console.error` sites: 31 baseline → 73 after pass (= 31 + 42 newly converted).

### §1.2 — Targeted method-name prefix additions (3 sites)

`chips.ts` had three "Forge chips: read failed for X" catches where the message didn't reveal the containing method. Updated:
- Line 238: `loadSourceVaultChips: read failed for ${rel}`
- Line 286: `loadLibraryChips: read failed for ${path}` (walk-up path)
- Line 310: `loadLibraryChips: read failed for ${candidate}` (fallback path)

### §1.3 — Already-compliant sites (no change needed beyond log level)

Per prompt §1.1 classification "already compliant": the message body already names a method/scope. These needed only the log-level fix from §1.1, no message edit:

- `welcome.ts:34` `detectSourceVault read failed` ✓
- `welcome.ts:184` `ensureWelcomeFiles threw unexpectedly` ✓
- `welcome.ts:241` `ensureForgeTomlStub failed` ✓
- `welcome.ts:434/457/490` `ensureBundledForge{Moda|Tutorial|Music} failed` ✓
- `welcome.ts:593` `migrateChipsMdToV2 failed` ✓
- `chips.ts:157` `detectSourceVault read failed` ✓
- v0.2.129 prefixes shipped pre-this-drain at `main.ts:1820` ✓

### §1.4 — False-positive check (§2.3 of prompt)

Standalone `console.warn` calls that are NOT in catch blocks (e.g. `chips-core.ts` validation warnings about malformed input) were excluded from the sed pass (pattern matched `..., e)$` requires a caught exception). These remain `console.warn` per the prompt's "legitimate non-error signal" carve-out.

## §2 — Carried forward to v0.2.131

Method-name prefix work for ~25 sites where the existing message does NOT mention a method:

### §2.1 — welcome.ts (4 sites)
- L275 `legacy .bak sweep failed` → `runFirstRunCheck: legacy .bak sweep failed`
- L308 `rmdir ${targetDir} failed` → `deleteExtractedDir: rmdir ${targetDir} failed`
- L339 `failed to sweep ${folder}` → `sweepLegacyBakDirs: failed to sweep ${folder}`
- L343 `vault root list failed during .bak sweep` → `sweepLegacyBakDirs: vault root list failed`

### §2.2 — edges.ts (1 site)
- L96 `failed to read snapshot ${file}` → `walkSnapshots: failed to read snapshot ${file}`

### §2.3 — facet-mutex-view-plugin.ts (3 sites)
- L57, 142, 274: all inside `makeFacetMutexViewPlugin` (factory + inline lambdas). Prefix as `facet-mutex view-plugin: ...` per §2.4 outer-method rule.

### §2.4 — forge-action.ts (3 sites)
- L530, 677, 712: contexts in `openForgeAction` / `runDomainActivationAction` / `listLibrary`. Prefixes pending audit.

### §2.5 — modal.ts (2 sites)
- L388, 444 `could not open newly created snippet`: outer is `NewSnippetModal.openCreated` (verify).

### §2.6 — main.ts (~13 sites)
The bulk of remaining work. Each catch needs context read + outer-method identified:
- L579 (modify handler), L1271 (sanitize handler), L1296 (New Snippet connect), L1347 (domain registration), L1768 (pre-flight sync), L1987 (generate pre-flight), L2137 (post-write MEMFS sync), L2153 (frontmatter reconcile), L2176 (sync_dependencies), L2225 (canonical write MEMFS), L2474 (data preview), L2634 (post-install refresh), L2779 (cache write), L2798 (Python hash write), L2817 (post-write MEMFS).

### §2.7 — output-view.ts (2 sites)
- L211 `could not open new data snippet`, L384 `MIDI player init failed`.

### §2.8 — pyodide-host.ts (1 site)
- L387 `could not read forge.toml from user vault`.

## §3 — Tests + release

- 687 plugin tests passing (unchanged — log-level changes don't affect behavior).
- Build clean.
- Smoke `node scripts/smoke-moda-dispatch.mjs` still 42/42 passing.
- Tag `v0.2.130` + GH release with full assets.
- INSTALL.md synced.

## §4 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): comprehensive grep enumeration before code change.
- ✓ §76 (don't ship speculative fix): each conversion is a literal log-level fix; no behavior change.
- ✓ §347 (version-bump sanity check): release.sh bumped 0.2.129 → 0.2.130.
- ✓ §321 (feedback before move): this file written before the prompt move.
- ✓ NEW v0.2.120 (`console.error` HARD RULE): LOG-LEVEL part shipped for all 42 sites. METHOD-NAME PREFIX part shipped for sites already self-documenting; ~25 sites queued as v0.2.131 follow-up.

## §5 — Why the split is the right call

Per §9: "consider splitting into two drains by file category". The split criterion ended up being not file but COMPLEXITY:
- v0.2.130: mechanical log-level conversion (sed-batchable, low-risk, single review pass)
- v0.2.131: per-site method-name precision work (requires reading each call site, identifying outer method, careful edit)

This keeps v0.2.130's diff reviewable as a single mechanical change and v0.2.131's diff focused on the precision work. Matches the spirit of §76 (don't ship in haste what needs careful per-site judgment).

## §6 — Open follow-ups

1. **v0.2.131**: method-name prefix work for ~25 sites enumerated in §2 above. Single focused drain. Estimated 1-1.5 hours.
2. **Going forward enforcement**: any new catch block added in PR review falls under the HARD RULE. v0.2.130 + v0.2.131 are one-time backfill; future enforcement is per-PR.
3. **Carry-forward backlog** (unchanged from v0329):
   - v0.2.117 follow-up (eligible for deletion)
   - v0.2.119 persistent expanded-state
   - v0.2.122 granular toggle commands
   - Plugin-side path-lookup audit (folds into Bundle C)
   - moda iframe e2e test (deferred indefinitely)
   - forge-tutorial `_meta/_chips.md` v3 parse error
   - `canonicalActionTemplate` removal (has consumers — v0329 §2.2)
   - `markDriftAsync` removal (already gone — v0329 §2.1)
   - v0.2.19 generate-internal sync removal (has command-palette consumer — v0329 §2.3)

## §7 — Architectural framing

V1 institutional discipline. v0.2.120 codified the rule; v0.2.130 retroactively applies the log-level part across the codebase; v0.2.131 will close the method-name precision part.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §8 — Hand-off

v0.2.130 shipped clean. v0.2.131 prefix follow-up queues at driver's discretion. Three prompts drained this session (v0328 → v0.2.128, v0329 → v0.2.129, v0330 → v0.2.130). Queue empty.
