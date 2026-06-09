# Freeze affordances: (a) wikilink right-click context menu + (b) graph view edge styling

## Scope

Build two user-facing freeze surfaces that bypass the modal's bare-ID-typing UX:

**(a) Wikilink context menu**: right-click on any wikilink inside a Forge snippet's body → context menu offers "Freeze edge" / "Unfreeze edge" → fires immediately with caller (the current snippet) + callee (the wikilink target), both qualified automatically. No modal opens. Works on wikilinks in the `# Dependencies` section AND elsewhere in the snippet body, gated on the wikilink target being a known snippet.

**(b) Graph view edge styling**: in Obsidian's native Graph View, edges between Forge snippets are colored / weighted by freeze state (live edges one style, frozen edges another). Where feasible per Obsidian's plugin API (see Phase 1), clicking an edge offers freeze/unfreeze. Where not feasible, document the constraints and ship (a) only, queueing (b) as a v1-audit item.

Hard precondition: this prompt drains **after** the URGENT v0.2.40 freeze-capture fix (engine-side `set_snapshot_state` auto-qualifies bare IDs). Both UX surfaces submit through `freezeEdge` / `_forge_set_edge_state`, which won't work end-to-end until the engine fix lands. If v0.2.40 is not yet in main when this drain starts, pause and move this prompt to `questions/`.

Two-phase shape per the investigation-before-design rider:

- **Phase 1**: investigate Obsidian's graph view extension API. Determine feasibility of (b). Document findings concretely (citations to `obsidian.d.ts`, any DOM probing).
- **Phase 2**: implement (a) always; implement (b) per Phase 1 findings (full / partial / deferred-with-reasoning).

What this prompt does NOT do:
- Re-architect the snippet body / Dependencies section.
- Replace the existing Cmd+P "Freeze edge" command — modal stays as the fallback for caller/callee combos the user has in their head but not visible in a wikilink view.
- Build a custom Forge graph view (the v1.0+ "ForgeEdgeView" item from the prior design conversation). That's a separate prompt if/when prioritized.
- Bundle the new affordances into forge-music or forge-moda.

## Why

The modal-typing UX surfaced its first real failure today (URGENT v0.2.40): user typed bare IDs (`hello_random`, `random_name`), engine tries to freeze at a bare-path snapshot file that doesn't exist (capture uses qualified IDs). Even after the engine-side fix lands, the modal-typing UX remains fragile: users have to remember snippet names exactly, type qualified IDs when ambiguous, etc.

Two surfaces sidestep the typing entirely:
- (a) wikilink right-click — the user clicks a thing they can see; caller and callee are inferred from context; zero typing.
- (b) graph view edge — visual identification of the edge to freeze; matches how the user thinks about the compute graph.

(a) is cheap and self-contained. (b) is potentially expensive depending on what Obsidian's API allows.

## Files likely to touch

- **`forge-client-obsidian/src/main.ts`** — `editor-menu` event handler (already exists, line 493) extends with wikilink-target detection + freeze/unfreeze menu items.
- **NEW: `forge-client-obsidian/src/wikilink-freeze-menu-core.ts`** — pure-core helper deciding when to surface the freeze menu given (current file, clicked wikilink target, snippet registry). Pure-core extraction No. 12. Tests in `wikilink-freeze-menu-core.test.ts`.
- **NEW (conditional on Phase 1): `forge-client-obsidian/src/graph-view-freeze-overlay.ts`** — the (b) implementation if feasible. Pure-core extracted where possible.
- **`forge-client-obsidian/manifest.json`** — `{CURRENT} → {NEXT_PATCH}` per the late-binding placeholder convention. CC reads at drain start. (v0.2.40 should be current by then; this lands v0.2.41 — confirm.)
- **`forge-client-obsidian/INSTALL.md`** — version pin update.

## Phase 1 — investigation

### Phase 1.A — wikilink context-menu feasibility (quick check)

Read `node_modules/obsidian/obsidian.d.ts` for:
- `editor-menu` event signature (current handler at `main.ts:493` already uses this).
- `EditorPosition` / `MarkdownView.editor` APIs for inspecting the token under cursor.
- Whether the event delivers enough context to detect "user right-clicked on a wikilink" vs other tokens.

Expected outcome: feasible. The existing `editor-menu` handler already runs; extending it to detect wikilinks is a small change. Capture verbatim in feedback §1.2 the API surfaces you'll use.

### Phase 1.B — graph view extension feasibility (the load-bearing investigation)

Read `obsidian.d.ts` for:
- Any `GraphView`, `GraphLeaf`, or graph-related types.
- Any `workspace.on('graph-*')` events.
- Any `registerView('graph', ...)` overrides (almost certainly not available — graph is built-in).
- DOM-level: when graph view is open, what's the DOM structure? Can a plugin's onload code attach `MutationObserver` to the graph SVG and inject styles based on freeze state?

Three possible findings, each leading to a different Phase 2:

1. **Feasible via public API** (unlikely based on prior grep — `obsidian.d.ts` shows no graph-related types). Phase 2 implements (b) using the documented hooks.
2. **Feasible via DOM injection but undocumented/brittle.** Phase 2 implements (b) defensively (feature-detect at runtime; degrade gracefully if Obsidian changes the DOM). Document the brittleness in code comments + INSTALL.md note.
3. **Not feasible.** Phase 2 ships (a) only. Document constraints in feedback §2 and add a v1-audit deferral for "(b) requires a custom Forge graph view, separate larger drain."

**Investigation deliverables for §1.2:**
- Verbatim `obsidian.d.ts` grep results for graph-related types.
- A devtools / DOM probe: with a real Obsidian instance running (CC can't do this, but CC can simulate by reading the graph view's CSS class names from Obsidian's public stylesheets or the Obsidian community plugins ecosystem where some community plugins HAVE tried to extend graph view).
- A one-paragraph diagnosis: which of the three findings above applies, with concrete evidence.

**If finding is (3) — not feasible**: do NOT speculatively implement a brittle DOM hack. Ship (a) only; document why (b) defers. Cowork makes the call on whether to pursue the custom-graph-view approach in a future prompt.

## Phase 2 — implementation

### (a) Wikilink context menu — TDD discipline

**Step 1 — failing test first.** `wikilink-freeze-menu-core.test.ts` cases:

1. `wikilink target is a known snippet → menu offered with caller + callee` — pass current-file path + wikilink-target string + a fake registry; assert helper returns `{showMenu: true, caller: <qualified>, callee: <qualified>}`.
2. `wikilink target is NOT a known snippet → menu suppressed` — same shape but registry doesn't contain the target; assert `{showMenu: false}`.
3. `current file is NOT a snippet (e.g., user opened a plain markdown note) → menu suppressed` — pass a non-snippet caller; assert no menu.
4. `wikilink target is the current file (self-reference) → menu suppressed` — defensive case; freezing self-edges is undefined.
5. `wikilink target is ambiguous (matches two snippets) → menu offers a "Choose which" sub-flow OR suppresses with a note` — design call: defer to v1-audit (ambiguity handling) or implement a sub-menu. CC's call; document in §2.

Run before fix → all 5 fail (the helper doesn't exist yet). Capture verbatim in §1.2.

**Step 2 — implement.** Pure-core helper + glue in `main.ts:editor-menu` handler. The glue layer:
- Detects right-click position is on a wikilink token (use `editor.getTokenAt(...)` or equivalent).
- Calls the pure-core helper to decide whether to show the menu.
- If shown: menu items "Freeze edge" / "Unfreeze edge" → fire `freezeEdge(serverUrl, vaultPath, caller, callee, 'frozen')` / `'live'` directly. NO modal.
- Reports success/failure via Obsidian Notice (existing UX pattern in main.ts).

**Step 3 — re-run tests.** All 5 pass. Capture verbatim in §1.4.

### (b) Graph view overlay — conditional on Phase 1

If Phase 1 finding is (1) or (2):
- Pure-core helper `graph-view-freeze-overlay-core.ts` decides edge styling given (edge state, registry).
- Glue layer in main.ts onload registers the graph-view hook (per Phase 1 findings).
- Tests are best-effort given the DOM nature; at minimum a pure-core unit test for the style-decision helper.

If Phase 1 finding is (3):
- Skip (b) entirely. Document the constraints in §2 along with the recommendation to pursue custom-graph-view as the future direction.

### Smoke (post-implementation, per the new protocol rule)

CC writes the user-side smoke checklist in §3 of the feedback file AFTER the auto-smoke passes, exercising:

- Wikilink right-click flow: open `hello_random.md` in `smoke-v0.2.13` vault → right-click `[[random_name]]` in the body (or in `# Dependencies` if present) → confirm "Freeze edge" menu item appears → click it → confirm a Notice shows success → Forge-click `hello_random` twice → confirm both outputs are identical (frozen took effect).
- Same flow for "Unfreeze edge" → confirm randomness restored.
- Negative case: open a plain markdown note (non-snippet) with a wikilink → right-click → confirm freeze menu items DO NOT appear.
- If (b) shipped: open Obsidian Graph View → confirm frozen edges visually distinct from live edges → click a frozen edge → confirm unfreeze flow → click an unfrozen edge → confirm freeze flow.

Checklist quality requirements per cc-prompt-queue.md "User-side smoke checklist" section: numbered steps, expected outcomes, concrete paths, "failure modes to watch for" section at end, pre-conditions at top.

## Phase 1 + Phase 2 — feedback file per-phase

Per the multi-drain feedback discipline (cc-prompt-queue.md hard rule): write Phase 1 feedback (§1.2 investigation findings + diagnosis) BEFORE starting Phase 2. Commit Phase 1 with the investigation findings checked in (no production code change beyond test scaffolding). Then proceed to Phase 2.

If Phase 1 finding is (3) and (b) is deferred, write a v1-audit recommendation in §2 explicitly: "(b) graph view overlay deferred per Phase 1 investigation; recommend pursuing via custom Forge graph view in a separate v1.0-era drain." Cowork picks up the v1-audit edit.

## Out of scope

- Custom Forge graph view (`ForgeEdgeView`). Separate prompt if/when prioritized.
- Replacing the existing Cmd+P "Freeze edge" command-palette modal — stays as fallback.
- Auto-emitting `# Dependencies` sections in hand-authored snippets that don't have them. Smoke vault snippets may lack the section; (a) works on wikilinks anywhere in body, not just inside Dependencies.
- Multi-edge bulk freeze ("freeze all edges of this snippet at once"). v1.0+ if useful.
- Persistence of freeze-state UI badges in the snippet view itself (would need a custom snippet-aware reader, out of scope here).

## Don'ts

- **Don't ship a speculative graph-view implementation.** If Phase 1 says infeasible, ship (a) only. The investigation-before-design rider is hard-rule.
- **Don't bypass TDD on (a).** Pure-core helper tested first; glue follows.
- **Don't write the user-side smoke checklist in this prompt.** Per the new protocol rule, CC writes it post-implementation in the feedback file.
- **Don't bump versions concretely** — use placeholders.
- **Don't drain this prompt before the URGENT v0.2.40 freeze-capture fix is in main.** If the URGENT fix is still pending, move this prompt to `questions/` and report. Pause for cowork to confirm the dependency landed.
- **Don't batch feedback at end of multi-phase drain** — Phase 1 feedback committed before Phase 2 starts (per the multi-drain feedback discipline).

## Report when done

Standard §0-§2 + the two-phase structure:

- **§0** — manifest.json before/after, commit SHAs for both phases, push, tag, release URL, SHA round-trip.
- **§1.1** — TDD test cases for (a) — full content of `wikilink-freeze-menu-core.test.ts` summarized case-by-case. Plus any (b) tests if shipped.
- **§1.2** — Phase 1 investigation findings: Obsidian API surface for (a) (verbatim citations), graph view extension feasibility for (b) (one of the three findings with evidence), and a clear ship-(b) / defer-(b) decision.
- **§1.3** — Fix landed: cited line-number diffs for the editor-menu handler extension, the pure-core helper, and the (b) implementation if shipped.
- **§1.4** — Post-fix verbatim test output.
- **§1.5** — Full `npm test` suite.
- **§2** — Anything surprising: edge cases discovered, design calls (e.g., ambiguity handling for case 5), (b) deferral reasoning + v1-audit follow-up recommendation if applicable.
- **§3** — User-side smoke checklist (the new deliverable; per cc-prompt-queue.md "User-side smoke checklist" quality requirements).
