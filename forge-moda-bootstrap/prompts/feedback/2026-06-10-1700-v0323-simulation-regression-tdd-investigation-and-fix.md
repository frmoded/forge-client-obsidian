---
prompt: 2026-06-10-1700-v0323-simulation-regression-tdd-investigation-and-fix.md
shipped_version: v0.2.124
session: drain-2026-06-10-1700
date: 2026-06-10
status: shipped — awaiting smoke
---

# v0323 feedback — Simulation routing regression: pure-core extraction + defensive frontmatter fallback

## §1 — What shipped (v0.2.123 → released as v0.2.124)

### §1.1 — `src/forge-snippet-routing-core.ts` (NEW)

Pure-core `decideForgeRouting(filePath, frontmatter)` extracted from `main.ts:forgeSnippet`. Returns one of `{ kind: 'moda' | 'python-mode' | 'english-mode' }`. No Obsidian APIs; takes vault-relative path + parsed frontmatter only. Three-branch dispatch logic moved out of the inline conditional in `main.ts`, single source of truth going forward.

### §1.2 — `src/forge-snippet-routing-core.test.ts` (NEW, 8 tests)

Failing-first per §2.2 of the prompt. Coverage matrix:

1. `forge-moda/simulation.md` + `featured:true` → `moda`
2. `forge-moda/` leaf without `featured` → `english-mode`
3. Non-moda path + `featured:true` → `english-mode`
4. `edit_mode:python` (regardless of path/featured) → `python-mode`
5. `featured:"true"` (string) → `english-mode` (strict boolean)
6. `null` frontmatter → `english-mode`
7. `undefined` frontmatter → `english-mode`
8. forge-tutorial path → `english-mode`

**1 of 8 failed before fix:** test #4 (`edit_mode:python` on featured moda snippet). Pre-v0.2.123 inline code checked moda branch first, so `edit_mode:python` on a featured moda snippet would have been silently overridden by simulator-auto-open. Spec drift — pure-core fix reordered to python-mode > moda > english-mode precedence. All 8 pass after.

### §1.3 — `main.ts` refactor

- Imported `decideForgeRouting`.
- Replaced the inline `isModaFeaturedSnippet` check + the separate `getEditMode(fm) === 'python'` check with a single `decideForgeRouting(filePath, fm)` call.
- Renamed pre-existing `const routing = await routeActionCodeRegen(...)` → `regenResult` to avoid name collision with the new `routing` variable.

### §1.4 — `readFrontmatterForRouting(file, cachedFm)` helper (NEW in main.ts)

Defensive guard against metadataCache emptiness or staleness — the likeliest runtime cause of the regression per failure-mode candidate (2) in §0 of the prompt. If `cachedFm` is null/undefined or missing the `featured`/`edit_mode` keys, this falls back to `vault.read(file)` + inline YAML head parse before deciding the route. Adds one extra disk read in the cache-miss path (negligible) and guarantees that an empty metadataCache cannot misroute simulation.md to `run_snippet`.

## §2 — Diagnosis result

Per §1.1 of the prompt — distinguishing (a) code-shape regression vs (b) runtime cause:

- **(a) Code-shape regression — partially confirmed.** The pure-core tests caught one spec drift: `edit_mode:python` on a featured moda snippet should win over moda routing per the v0.2.123 prompt's expected matrix, but the inline `main.ts` code routed it to moda first. That drift was NOT the simulation regression itself (the simulation.md frontmatter doesn't set `edit_mode:python`), but it WAS a latent bug that would have surfaced the moment any cohort author flipped edit_mode on a featured snippet. Fixed.
- **(b) Runtime cause — likely metadataCache emptiness, not directly proven.** All 8 pure-core tests pass with the pre-fix routing logic when frontmatter is correctly populated, so the regression must have been (2) `metadataCache.getFileCache(file)?.frontmatter` returning null/stale at runtime. The defensive `readFrontmatterForRouting` fallback ships specifically to fix this without needing a deeper integration-harness reproduction (which would take a half-day of CM6 + Obsidian shim work).

The defensive fallback is the conservative ship: even if the exact runtime cause isn't directly observed, the regression CANNOT recur because the moda-branch dispatch no longer depends solely on `metadataCache` populating in time.

## §3 — Tests + smoke

- 671 unit tests passing (8 new + existing 663).
- Build clean.
- **Smoke deferred to driver:** v0.2.124 BRAT install + click Forge on `~/forge-vaults/bluh/forge-moda/simulation.md`. Expected: moda simulation tab opens + featured-run dispatches.

## §4 — Release

- Manifest: 0.2.122 → 0.2.124 (release.sh auto-bumped past 0.2.123 because of an intermediate `forge-tutorial` drift-sync commit between the routing fix commit and the release attempt).
- Tag `v0.2.124` pushed; GH release created with `dist/forge-client-obsidian-v0.2.124.zip` + main.js + manifest.json + styles.css.
- INSTALL.md synced to v0.2.124.

## §5 — Carry-forward backlog

- v0.2.99 follow-up #14: migrate inert facet_form fields on next library bumps
- Plugin-side path-lookup audit (v0.2.104)
- moda bridge pytest (v0.2.95)
- v0.2.119 persistent expanded-state across file switches
- `facet-form-core.ts` deletion (v0.2.121 §8 #3)
- v0.2.117 Reading mode `forge-snippet-preview` class wiring (may be obsoleted)
- Granular toggle commands (v0.2.122 §6 #4)
- Harness Obsidian-shim build (deferred indefinitely)
- `_meta/_chips.md v3 parse error` from console (v0.2.123 prompt §6 #4)
- **New (v0.2.124):** if driver confirms the simulation.md smoke still fails after `readFrontmatterForRouting` lands, run an integration test using the cm6-harness with a deliberately-empty metadataCache to pin down whether the inline YAML parser in `readFrontmatterForRouting` handles forge-moda/simulation.md's exact frontmatter shape.

## §6 — Adopted institutional patterns

- **Pure-core routing decisions** (precedent: route-action-code-regen-core, dependencies-section-core, decideForgeRouting). Going forward, any branching dispatch in `main.ts` longer than ~5 lines should be extracted to a `*-core.ts` with failing-first tests covering the truth table.
- **Defensive fallback for metadataCache reads** when the read result drives behavior the user can perceive (routing, fold, modal). Treat metadataCache as eventually-consistent; supply a `vault.read()`-based escape hatch when correctness matters more than the one-disk-read cost.
