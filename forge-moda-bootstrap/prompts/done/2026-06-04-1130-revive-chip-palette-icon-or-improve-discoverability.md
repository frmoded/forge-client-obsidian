# Revive a dedicated chips-palette affordance (icon or equivalent prominent surface)

## Scope

The chips palette view (`src/chips-view.ts`, `CHIPS_VIEW_TYPE = 'forge-chips'`) is currently reachable via two paths only: the consolidated Forge ribbon icon (`main.ts:320` — a "package" icon that opens a menu, with "Open chips palette" as one menu item), and a command-palette command (`main.ts:360` — `forge-open-chips`). The user reports the dedicated chip icon used to exist and now feels missing — discoverability dropped enough that the palette feels gone even though it isn't. Per the constitution's V2a v6 Mission (constructionism: composing snippets is one of the four load-bearing properties; the chips palette IS the composition affordance), the discoverability gap is a play-loop cost worth fixing.

Two-phase per the investigation-before-design rider:

**Phase 1** — investigation: when did the dedicated chip icon get removed, what was its shape, what was the rationale, was it intentional consolidation or accidental drift? Read git log on `src/main.ts` and grep history for `addRibbonIcon` + chips-related identifiers. Land findings as a feedback-only commit (no code change) before Phase 2.

**Phase 2** — implementation: based on Phase 1 findings, ship ONE of:

a. **Revive the dedicated chip ribbon icon.** If Phase 1 finds the icon was removed in a "single Forge ribbon icon" consolidation (per the comment at `main.ts:325`), reviving means adding a second `addRibbonIcon` call specifically for chips, with a distinct icon glyph. Conflicts with the consolidation rationale, so the prompt prefers (b) unless Phase 1 finds the consolidation was actually an accidental loss.

b. **Improve the existing Forge-ribbon-menu discoverability for chips.** Surface "Open chips palette" more prominently in the menu (top item, distinct styling, or icon prefix). Optionally also add an editor-toolbar button when the active file is an action snippet. Lower architectural risk; respects the consolidation rationale; closes the perceived gap.

c. **Editor-toolbar button instead of (or in addition to) ribbon.** When the active file is an action snippet, the editor toolbar gets a chips icon at the top of the editor (next to the Forge button if one exists). Inline-with-the-work surface; matches the v0.2.12 expand-sidebar-on-Forge-click work. Strongest constructionism alignment (the chip palette appears where the user is editing, not where they ALSO have to navigate to).

Phase 1's job is to pick between (a)/(b)/(c) based on the data. If unclear, default to (c) — editor-toolbar button — because it's the most play-loop-aligned shape.

What this prompt does NOT do:
- Re-architect `chips-core.ts` or `chips.ts`. Existing pure-core logic is correct (per the v0.2.x chips-poc/v2/v3 work). This is a UI-affordance restoration.
- Change what chips do when clicked. Current behavior (insert call into the active editor) stays per `insertChipText`.
- Add new chip categories or types. Pure UI-surface change.

## Why

The chips palette IS the composability affordance — clicking a chip inserts a `[[snippet]](args)` call into the active snippet's body, letting the user compose without typing snippet names from memory. Per the constitution V2a v6 Mission, composability is one of the four load-bearing properties of snippets-as-blocks. If the composition affordance has dropped in discoverability such that the user perceives it as "gone," then the composability promise of the mission is undelivered in practice.

This is also a small instance of the lifecycle-assumption / regression pattern that motivated cowork-protocol's lifecycle-assumption review rule and v1-audit items (cc)/(dd): a UI affordance changed shape across drains, no test guarded it, and the perceived loss surfaced months later via user complaint. The retroactive (cc) glue-to-pure-core audit will likely catch the chips ribbon registration as one of the candidates; this prompt is the immediate fix for one instance.

## Files likely to touch

For Phase 1 (investigation):
- `src/main.ts:320` (current Forge ribbon registration).
- `src/main.ts:325` (the "ribbon icons consolidated" comment).
- `src/main.ts:755` (Open chips palette menu item).
- Git log on `src/main.ts`, `src/chips-view.ts`, `src/chips.ts` — find the commits that touched ribbon registrations near the chips work.

For Phase 2 (per chosen approach):
- **(a) ribbon icon revival**: `src/main.ts:onload` — add `this.addRibbonIcon('layout-grid', 'Open chips palette', ...)` (icon glyph is CC's call from Obsidian's lucide-icons palette; `layout-grid` is one candidate that visually suggests "tiles/chips/palette").
- **(b) menu discoverability improvement**: `src/main.ts:755` and surrounding menu-build code — promote the chips item, add visual distinction.
- **(c) editor-toolbar button**: NEW `src/chip-toolbar-button.ts` (or extension of existing toolbar code) — pure-core helper for "should this file get the chip toolbar button?" (active snippet, has English facet, chips inventory non-empty for active vault). Pure-core extraction No. 15.
- `~/projects/forge-client-obsidian/manifest.json` — `{CURRENT} → {NEXT_PATCH}` per the late-binding placeholder convention.

## Tests

### Auto-verifiable by CC

For Phase 2 (a)/(b): manual smoke only; no automated test surface (ribbon icon presence isn't unit-testable without an Obsidian stub).

For Phase 2 (c) — pure-core extraction enables tests:
- `chip-toolbar-button-core.test.ts` — `shouldShowButton({activeFile, manifest, chipsCount}) → boolean`. Cases: active file is action snippet + chips exist → true; data snippet → false; non-snippet markdown → false; no chips for vault → false. ~5 cases.

`npm test` → expect `X/X` with new tests if going with (c); unchanged otherwise.

### Deferred to user (CC writes the §3 checklist post-implementation per protocol)

CC writes the smoke checklist following the cc-prompt-queue.md "User-side smoke checklist" quality rules. Exercises:
- Fresh-vault install with v0.2.46 (or whatever NEXT_PATCH lands).
- Open an action snippet.
- Find and click the chips affordance via the chosen path (ribbon icon / menu item / editor-toolbar button).
- Confirm chips view opens with available chips for the active vault.
- Click a chip → verify the `[[snippet]](args)` call inserts at cursor.
- Negative case: open a non-snippet markdown file; confirm the affordance is appropriately hidden or disabled.

## Out of scope

- Changing chip behavior when clicked.
- Adding new chip categories.
- Modifying `chips-core.ts` or `chips.ts`.
- Touching forge-music or forge-moda.
- The (cc) glue-to-pure-core retroactive audit (separate larger drain post-V1).

## Don'ts

- **Don't ship without Phase 1 investigation.** The rationale for the consolidation (per the existing comment) is a real input; if Phase 1 finds the consolidation was deliberate and well-reasoned, reviving the dedicated ribbon icon (a) conflicts with that and (b)/(c) become preferred.
- **Don't add ribbon icons proliferatively.** The "single Forge ribbon icon" consolidation comment suggests previous experience that too many icons clutters Obsidian's ribbon. Honor that lesson — if (a) is chosen, it's an explicit re-evaluation.
- **Don't break the existing Cmd-P "Forge: Open chips palette" command** (`main.ts:360`). Whichever new affordance lands, that command stays.
- **Don't change `CHIPS_VIEW_TYPE`** ('forge-chips') — it's the workspace-leaf identifier; renaming would orphan any user layouts that have the view pinned.
- **Don't bump versions concretely** — `{CURRENT} → {NEXT_PATCH}` placeholder.
- **Don't batch feedback at end of multi-phase drain** — Phase 1 feedback committed before Phase 2 starts.

## Report when done

Standard §0–§3 with the two-phase structure:

- **§0** — manifest before/after, commit SHAs (Phase 1 + Phase 2), push, tag, release URL, SHA round-trip.
- **§1.1** — TDD test cases (if Phase 2 (c) — the pure-core extraction); N/A if (a) or (b).
- **§1.2** — Phase 1 investigation findings: when was the dedicated chip ribbon icon (if any) removed; commit SHA + bracket-tag of the removal; the rationale stated in the commit message or surrounding comments. Decision (a)/(b)/(c) with reasoning.
- **§1.3** — Phase 2 fix landed: cited line-number diffs.
- **§1.4** — Post-fix verbatim test output (if (c)); N/A otherwise.
- **§1.5** — Full `npm test`.
- **§2** — Anything surprising. Specifically: was the original removal a lifecycle-assumption-pattern instance (e.g., the icon registration was conditional on some state that changed)? If so, flag for the (cc) audit's eventual sweep.
- **§3** — User-side smoke checklist per the quality bar.
