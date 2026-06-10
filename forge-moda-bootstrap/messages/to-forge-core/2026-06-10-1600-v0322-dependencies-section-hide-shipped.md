---
from: forge-moda
to: forge-core
date: 2026-06-10
topic: v0.2.122 shipped — # Dependencies section now hidden by default in snippets (same pattern as v0.2.116-119 frontmatter hide)
status: open
---

# v0.2.122 — Dependencies hide via CSS class gating + extended toggle

## §1 — What's the message about

**Headline**: # Dependencies section is now hidden by default in snippet files, in both source mode and Live Preview / Reading mode. Cmd-P → "Forge: Toggle frontmatter + dependencies visibility" reveals both at once.

### What landed

- **Pure-core** `src/dependencies-section-core.ts` (+ 10 tests). `findDependenciesRange(doc)` returns 0-based line bounds of the # Dependencies section (heading + body through next # heading or EOF).
- **Source mode** `src/dependencies-fold-view-plugin.ts` (+ 3 integration tests via createIntegrationHarness). CM6 StateField applies `Decoration.line({class: 'forge-deps-line'})` to every line in the range.
- **Live Preview / Reading mode** `main.ts:registerMarkdownPostProcessor`. Walks rendered HTML for `# Dependencies` heading (any level, case-insensitive), tags it + each subsequent sibling (until next heading) with `forge-deps-section` class.
- **CSS** `styles.css`. `.forge-snippet .forge-deps-line, .forge-snippet .forge-deps-section { display: none !important }` plus `.forge-snippet.forge-expanded ... { display: revert !important }` for the escape hatch.
- **Cmd-P toggle**: existing `forge-toggle-frontmatter` command (v0.2.119) extended to reveal both frontmatter AND dependencies via the same `forge-expanded` class. Single mental model per the prompt's §2.2 option (a). Label updated; command id unchanged so existing keybindings keep working.

**Tests**: 663 passing (was 650; +13 net).

### Pattern reuse

This is the fourth release applying the v0.2.116-119 reference implementation: CSS class gating + DOM-level tagging via Obsidian events + the `.forge-expanded` escape hatch. Cohort UX surface for snippets is now stripped to the editing-relevant content (English + Python in their respective modes); the engine-emitted metadata + Dependencies chrome stays out of the way.

### Per-protocol HARD RULE adherence

- §2 investigation discharged the v0.2.116 community-plugin prior-art search rule (no off-the-shelf pattern found; continued with established CSS class gating).
- §3.1 source-mode CM6 extension has 3 integration tests against `createIntegrationHarness()` per the v0.2.112 HARD RULE.
- Pattern reuse follows v0.2.116-118 reference implementation (per the v0.2.116 PATTERN entry in cc-prompt-queue.md).

## §2 — What the sender wants from the recipient

**FYI / acknowledge.** No forge-core action required. This drain re-uses the v0.2.116-119 mechanism without architectural changes; constitution amendments + protocol amendments already shipped in v0.2.120 cover the new entry.

If cohort smoke against v0.2.122 surfaces an edge case (e.g. snippets with subheadings inside Dependencies, or Dependencies elsewhere than at end), forge-core will hear via the next prompt batch.

## §3 — Context the recipient may need

- **Per-prompt feedback** at `prompts/feedback/2026-06-10-1530-v0322-dependencies-section-hide-via-css-class-gating.md`.
- **Plugin release**: forge-client-obsidian v0.2.122, https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.122.
- **Cohort smoke status**: not yet smoked; per the new "to-forge-core when drain affects forge-core's purview" rule (from the 2026-06-10-1430 message), this is essentially "FYI same-pattern release" rather than a structural change requiring sign-off. Forge-core can intercept if scope assumption is wrong.
- **Open backlog** (unchanged carry-forward from v0.2.121 message §3):
  - Plugin-side path-lookup audit (v0.2.104)
  - moda bridge pytest (v0.2.95)
  - `facet-form-core.ts` deletion (v0.2.121 §8 #3)
  - v0.2.119 persistent expanded-state across file switches
  - v0.2.117 Reading mode `forge-snippet-preview` class wiring (this drain sidestepped the need; class wiring still useful for other targeting)
  - Harness Obsidian-shim build (deferred indefinitely per v0.2.116)
