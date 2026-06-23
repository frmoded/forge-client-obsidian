---
prompt: 2026-06-25-1200-v0334-small-bugs-bundle-basename-audit-plus-chip-indent-plus-tutorial-chips-parse.md
shipped_version: v0.2.135
session: drain-2026-06-25-1200
date: 2026-06-25
status: shipped
---

# v0334 feedback — small bugs bundle: tutorial chips parse + chip indent + basename audit

## §1 — Section C (forge-tutorial _chips.md parse) — diagnosed + fixed

### Root cause

`parseChipsV2Config` (chips-core.ts:342) reads `schema_version` from the parsed YAML body, NOT from the file's frontmatter. The forge-tutorial's `_meta/_chips.md` had `schema_version: 3` in frontmatter but the body YAML started directly with `synthetic_chips:`.

The flow:
1. `extractDataBody(raw)` strips frontmatter + extracts the fenced YAML body.
2. `parseYaml(body)` parses → `{ synthetic_chips: [...], groups: [...] }` (no `schema_version` key).
3. `parseChipsV2Config` checks `r.schema_version !== 2 && r.schema_version !== 3` → ERROR: `schema_version must be 2 or 3, got undefined`.
4. The error path in `chips.ts:340-344` logs `console.warn` and falls through to auto-discovery only, silently dropping the entire synthetic-chip palette.

Confirmed by reading the moda `_chips.md` for comparison — its body also starts with `schema_version: 2` as the first line of the YAML, matching what the parser expects.

### Fix (Option A per §3.2)

Added `schema_version: 3` to the YAML body of `forge-tutorial/_meta/_chips.md` as the first line (with a comment explaining the parser contract). Bundle synced via `npm run sync-bundled-vault.mjs forge-tutorial`. Both source and bundle copies now have the line.

Committed to forge-tutorial repo separately (commit `e8c7f47`).

## §2 — Section B (multi-line chip indentation) — fixed

### New pure-core helpers (chips-core.ts)

- `applyIndentToChipBody(chipBody, leadingWhitespace)` — prefixes lines 2..N with the leading whitespace; single-line chips and column-0 cursors return unchanged. Preserves true-blank lines (doesn't synthesize whitespace-only lines).
- `extractLeadingWhitespace(line)` — extracts spaces/tabs from a line's start; defensive against null/undefined.

### Wiring (insertChipTextAtLine)

Detected leading whitespace from `cursorLineContent` once, then applied to the chip via `applyIndentToChipBody` BEFORE both insertion branches (empty-line replace AND below-cursor append).

### Tests (13 new)

- 6 `applyIndentToChipBody` cases: single-line passthrough, column-0 passthrough, 4-space indent, tab indent, true-blank preservation, 3-line indent.
- 5 `extractLeadingWhitespace` cases: empty, null, 4 spaces, mixed tab+space, no leading.
- 2 integration `insertChipTextAtLine` cases: indent applied to non-empty cursor line, indent applied to whitespace-only cursor line (replace polish).

## §3 — Section A (basename-match audit) — documented as safe-by-construction

Filtered grep with `grep -rn "\.basename\s*[!=]==" src/*.ts | grep -v ".test.ts" | grep -v ".generated"` → only **2 comparison sites**:

### Site 1 — main.ts:794 (qualifyBareIdAll callback)

The loop's PURPOSE is to find cross-domain basename collisions for the multi-match wikilink freeze menu. The collision-finding IS the feature. The engine handles disambiguation downstream. SAFE BY DESIGN; documentation comment added citing v0334 §1.2.

### Site 2 — main.ts:2162 (writeGeneratedCode fallback)

The find-by-basename fallback only fires when path lookup for the qualified id fails. Bare-id callers in current code are legacy root-level snippets (welcome.md, greet.md) with no cross-domain collisions. Future-proofing: if a future caller passes a bare id that DOES collide, migrate to qualified id (the v0.2.104 pattern). SAFE BY CONSTRUCTION + future migration path documented.

No code changes needed; 2 documentation comments added. No regression tests because no fix shipped.

## §4 — Tests + release

- 710 plugin tests passing (697 baseline + 13 new).
- Build clean.
- Tag `v0.2.135` + GH release with `dist/forge-client-obsidian-v0.2.135.zip` + main.js + manifest.json + styles.css.
- INSTALL.md synced.
- forge-tutorial `_meta/_chips.md` committed + pushed to its own repo.

## §5 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): Section C diagnosed by running parser against actual file content; Section A confirmed by grep before documenting; Section B confirmed via reading insertChipTextAtLine flow.
- ✓ §57–74 (TDD): 13 new failing-first tests for Section B.
- ✓ §86–118 (pure-core convention): Section B extracted both new helpers as pure-core (`applyIndentToChipBody`, `extractLeadingWhitespace`).
- ✓ §76 (don't ship speculative fix): Section C concrete repro; Section B driver-flagged; Section A audit-gated.
- ✓ §347 (version-bump sanity check): release.sh bumped 0.2.134 → 0.2.135.
- ✓ §321 (feedback before move): this file written before the prompt move.
- ✓ v0.2.120 console.error HARD RULE: no new catch blocks.
- ✓ v0.2.131 inlined-version preflight: release.sh's new check passed cleanly for v0.2.135.

## §6 — User-side smoke (deferred to driver)

Per §6 of prompt:
1. **Section C**: Open forge-tutorial vault. Open chip palette. Expected: synthetic chips ("print", "Set", "Give back", "If", "Otherwise", "For each") appear in palette; no console.error for `_meta/_chips.md` parse.
2. **Section B**: Open any snippet with an indented context (e.g. inside a list item or fenced block). Place cursor on an indented line. Insert a multi-line chip via palette ("If" or "For each"). Expected: all lines of inserted chip body share the cursor-line's leading indent.
3. **Section A**: no user-visible change.

## §7 — Open follow-ups (per prompt §7 + new)

Carry-forward survivors (unchanged):
- v0.2.91 + v0.2.92 CDN resilience (3 items — bundle as publish-readiness prompt)
- v0.2.119 persistent expanded-state across file switches (QoL)
- v0.2.122 granular toggle commands (QoL)
- v0.2.131 §4 #2 status-bar persistent indicator (defer until cohort signal)
- SELECTION-based chip insertion (QoL)
- Cohort staleness signal for slot-free `# Python` (publish-readiness UX)
- v0333 Section A method-name prefix bulk sweep (~28 sites in 8 files) — still queued

Closed in this drain:
- ~~v0.2.104 basename-match audit~~ → Section A (documented as safe)
- ~~Driver-flagged multi-line chip indent~~ → Section B (fixed)
- ~~forge-tutorial `_meta/_chips.md` v3 parse error~~ → Section C (fixed)

## §8 — Architectural framing

V1 institutional hygiene + cohort first-impression defense. The tutorial chips fix closes a bad-first-impression risk before the publish push (synthetic chips were silently absent for any forge-tutorial user). The chip indent fix removes a daily authoring friction. The basename audit confirms the v0.2.104 pattern is structurally bounded — the comparison surface is small (2 sites) and both are reasoned safe.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §9 — Hand-off

v0.2.135 ships the small bugs bundle. Queue empty after this drain. v0333 Section A bulk sweep remains queued.
