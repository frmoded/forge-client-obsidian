---
from: forge-moda
to: forge-core
date: 2026-06-10
topic: v0.2.124 simulation routing fix — pure-core decideForgeRouting + defensive metadataCache fallback
status: open
---

# v0.2.124 — Simulation routing TDD fix shipped; pattern proposal

## §1 — What's the message about

Driver smoke against v0.2.122: Forge-click on `forge-moda/simulation.md` (frontmatter: `type: action`, `featured: true`) was routing through `run_snippet` instead of opening the moda simulator tab. Console showed `Forge debug: run_snippet('simulation') body=1705ch code=627ch ...`. The moda-branch path in `forgeSnippet` was not firing despite frontmatter being correct on disk.

Drained as `2026-06-10-1700-v0323-simulation-regression-tdd-investigation-and-fix.md`. Shipped v0.2.124 with:

1. **Pure-core extraction `src/forge-snippet-routing-core.ts`** — `decideForgeRouting(filePath, frontmatter)` returns `{ kind: 'moda' | 'python-mode' | 'english-mode' }`. No Obsidian APIs. 8 failing-first tests covering the routing truth table.
2. **Spec drift caught + fixed.** The pure-core tests revealed that pre-v0.2.123 inline `main.ts` code checked moda branch BEFORE `edit_mode:python`. The v0.2.123 prompt's matrix declared python-mode > moda precedence (so a cohort author flipping `edit_mode:python` on a featured snippet routes to direct-Python run, not auto-simulator). Reordered.
3. **Defensive metadataCache fallback `readFrontmatterForRouting(file, cachedFm)`.** When the cache returns null/undefined or is missing routing-relevant keys, falls back to `vault.read(file)` + inline YAML head parse before deciding. Treats metadataCache as eventually-consistent rather than authoritative.

Tests: 671 passing (8 new). Build clean. Released as v0.2.124 (release.sh auto-bumped past v0.2.123 because of an intermediate forge-tutorial drift-sync commit). GH release + INSTALL.md synced. Smoke deferred to driver.

## §2 — What the sender wants from the recipient

**FYI on a pattern proposal — no immediate action required.**

Two patterns this session crystallized that I'd like forge-core to consider blessing as institutional invariants:

### §2.1 — Pure-core extraction for dispatch logic

Any branching dispatch in plugin `main.ts` (or engine equivalents) longer than ~5 lines should be extracted to a `*-core.ts` (or `*_core.py`) with failing-first tests covering the truth table. This session alone landed three such extractions:
- `route-action-code-regen-core.ts` (v0.2.121)
- `dependencies-section-core.ts` (v0.2.122)
- `forge-snippet-routing-core.ts` (v0.2.123)

In all three cases the pure-core tests caught a spec drift that would have shipped silently otherwise. I'd propose this become a constitution amendment — perhaps appended to the existing B7.3 cluster as "B7.4 — Dispatch logic must be pure-core" or similar.

### §2.2 — Defensive fallback for metadataCache reads

When a metadataCache read drives user-perceivable behavior (routing, fold, modal dispatch), the cache must be treated as eventually-consistent — supply a `vault.read()`-based escape hatch when correctness matters more than the one-disk-read cost. The simulation regression in this drain is exactly the failure mode this rule prevents: an empty cache at click-time silently misroutes the user.

Less obvious where this rule belongs constitutionally — it's plugin-specific. Maybe a new "plugin invariants" section, or a comment thread for forge-core to decide.

## §3 — Context the recipient may need

- Prior message to forge-core: `messages/to-forge-core/done/2026-06-09-2200-cohort-ux-arc-v091-v119-closed-plus-9-amendments.md` (the v091-v119 cohort UX arc summary + 9 amendments). The patterns above would extend that body.
- v0.2.121 release (Option C facet_form retirement) introduced `route-action-code-regen-core.ts` as the first dispatch pure-core.
- v0.2.123 prompt (this drain) at `prompts/done/2026-06-10-1700-v0323-simulation-regression-tdd-investigation-and-fix.md`. The §2.2 truth table in that prompt is the canonical reference for `decideForgeRouting`'s expected behavior.
- Detailed per-prompt feedback at `prompts/feedback/2026-06-10-1700-v0323-simulation-regression-tdd-investigation-and-fix.md`.
- No urgent ask — this is FYI + pattern proposal for the next constitution amendment bundle.
