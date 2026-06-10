---
timestamp: 2026-06-09T11:30:00Z
session_id: drain-2026-06-09-1130
status: pending
priority: MEDIUM-HIGH — cracks the Item C cohort UX gap left at v0.2.112
---

# v0.2.114 — Extend integration harness with Obsidian-CM6 shim to crack frontmatter-fold override

## §0 — Context

v0.2.112 shipped the integration harness (Item B) and used it to PROVE that v0.2.111's frontmatter-fold code is correct in pure CM6 — `view.dom.outerHTML` contains the placeholder class AND does NOT contain `type: action` after mount + flush. The cohort failure (Tamar reports frontmatter still visible) is Obsidian-specific.

The remaining hypothesis live in the cohort environment: **H2 (Obsidian renderer override)** — Obsidian's CM6 setup intercepts plugin-provided `Decoration.replace` ranges and overrides them. Specific mechanism unknown.

Item C's Plan B (CSS de-emphasis, ~10 LOC) ships cohort UX value as a bridge. This drain extends the harness with an Obsidian-CM6 wiring shim to reproduce the override locally, identify the mechanism, and ship the real fix.

User authorized 2026-06-09-1100: "invest in harness Obsidian-shim NOW."

## §1 — Goal

Extend the v0.2.112 `createIntegrationHarness()` to reproduce the Obsidian-specific frontmatter-fold override. The extended harness should:

1. Mount a CM6 EditorView with Obsidian-equivalent extensions/decoration providers
2. Apply v0.2.111's `makeFrontmatterFoldExtension` on top
3. Render to DOM
4. Observe whether the placeholder appears OR is overridden by an Obsidian-mimicking provider
5. Discriminate between competing hypotheses for the override mechanism

Once the override mechanism is identified empirically:
- Implement the fix in v0.2.111's frontmatter-fold code
- Ship as part of this drain
- CSS de-emphasis Plan B can stay (defense in depth) OR be removed (CC's call)

## §2 — Investigation phase (MANDATORY per §78)

### §2.1 — Determine the harness extension strategy

Two paths:

**(a) Playwright + real Obsidian Electron**
- Highest fidelity — runs against actual Obsidian binary
- Setup: download/install Obsidian, automate via Playwright, manage Electron lifecycle
- Cost: substantial (multi-hour setup, slow tests ~30s each)
- Pros: catches EVERYTHING Obsidian does
- Cons: brittle, slow, complex CI

**(b) Custom Obsidian-CM6 shim**
- Mid-high fidelity — mocks Obsidian's CM6 extensions in jsdom/happy-dom
- Setup: research Obsidian's CM6 setup (which is partially documented in obsidian.d.ts, partially reverse-engineered)
- Cost: moderate (1-3 days research + implementation)
- Pros: fast tests, no Obsidian binary needed
- Cons: depends on Obsidian internals; may drift; misses things our shim doesn't simulate

**(c) Hybrid**
- Use Playwright for SPECIFIC end-to-end smoke
- Use (b) shim for fast unit-style integration tests
- Cost: high but distributed

**Decision tree:**
- If Playwright + Obsidian Electron setup proves <4 hours: ship (a) as part of this drain
- Else: ship (b) custom shim
- (c) hybrid only if both prove tractable; document as future investment

CC investigates feasibility of (a) FIRST (1-2 hours research). If too complex, pivot to (b).

### §2.2 — Research Obsidian's CM6 extension setup

Sources to consult:
- `obsidian.d.ts` declarations for `Editor`, `MarkdownView`, `registerEditorExtension`
- Community plugins that customize CM6 rendering — find ONE that touches decoration/folding (e.g., Properties view inspirations, Style Settings, Codemirror Options)
- Forum threads about Obsidian-specific CM6 quirks

Specific questions:
- Does Obsidian wrap user-provided extensions in compartments?
- Does Obsidian have a built-in decoration provider for frontmatter (Properties view source-mode pre-rendering)?
- What's the precedence of multiple decoration providers? Does last-registered win?
- How does Obsidian's Live Preview rendering interact with source-mode CM6 decorations?

Document findings in feedback. If a specific Obsidian internal is identified as the cause, name it.

### §2.3 — Reproduce the cohort failure locally

Once a candidate Obsidian-shim is built (option a or b), write a failing test:

```typescript
test('Obsidian-shim: frontmatter fold is overridden', async () => {
  const harness = createIntegrationHarness({ mode: 'obsidian-shim' });
  const view = harness.mount(...);
  // ... assertion: placeholder NOT visible, "type: action" IS visible
  // → reproduces Tamar's cohort failure
});
```

If this test fails (as expected pre-fix), the shim has successfully reproduced the bug. Now we can iterate on the v0.2.111 code WITH empirical feedback.

### §2.4 — Identify the specific override mechanism

Once reproduced, instrument:
- Which CM6 decoration provider WINS in the merge?
- Is Obsidian's frontmatter decoration emitted? At what range?
- Does removing/disabling specific Obsidian extensions allow our fold to succeed?
- Does adding our extension to a higher-precedence position help?

CM6 specifics worth verifying:
- `Decoration.set([], { sort: true })` ordering semantics
- `EditorState.update` precedence rules
- `Facet` overrides via `Facet.compute` priority

### §2.5 — Audit existing community plugins for prior art

Has anyone solved this for Obsidian before?
- Search community plugins repository for: "fold frontmatter" / "hide frontmatter" / "collapse properties"
- If a plugin exists that successfully folds frontmatter in source mode, study its approach

Most likely candidates: any plugin that's said to "hide frontmatter" or "Properties View enhancements" — they may have discovered the same Obsidian internal we're hitting.

## §3 — Implementation phases

### §3.1 — Phase 1: harness extension

Per §2.1 outcome:
- **(a) Playwright path**: add `playwright` devDep; setup Obsidian binary discovery; `src/test-helpers/obsidian-playwright-harness.ts`; integrate with existing test runner OR new `npm run test:playwright`
- **(b) Custom shim path**: extend `createIntegrationHarness({ mode: 'obsidian-shim' })`; add Obsidian-mimicking extensions to the shim; document the shim's coverage scope

Either path: ensure existing v0.2.112 4 integration tests still pass against the shim.

### §3.2 — Phase 2: reproduce failure

Per §2.3:
- Write the failing test
- Confirm it fails (frontmatter visible)
- Land the failing test + investigation notes

### §3.3 — Phase 3: identify mechanism + ship fix

Per §2.4 outcome:
- Identify the specific Obsidian internal causing the override
- Modify v0.2.111's frontmatter-fold code to work WITH or AROUND it
- Likely shapes:
  - Use `Decoration.line` instead of `Decoration.replace`
  - Use higher-precedence facet registration
  - Detect Obsidian's frontmatter decoration and yield to it (or modify it)
  - Use a different CM6 mechanism entirely (e.g., a code block decoration vs replacement)

### §3.4 — Phase 4: ship v0.2.114

- Plugin manifest 0.2.113 → 0.2.114 (assuming v0.2.113 chip cursor ships first)
- Failing test now passes
- Cohort smoke verification

### §3.5 — Phase 5: CSS de-emphasis decision

If the programmatic fold now works correctly:
- **Option A**: keep CSS de-emphasis as defense-in-depth (fallback if fold dispatch fails)
- **Option B**: remove CSS de-emphasis (programmatic fold is authoritative)

Recommend Option A — defense in depth costs nothing and provides graceful degradation.

## §4 — Tests required

- Harness extension self-tests (5-10): verify the shim correctly mounts, applies extensions, returns DOM/state
- Reproduction test (1): failing-first against v0.2.111 + Obsidian shim
- Fix verification test (1): same test now passes after §3.3 fix
- Regression guards (2-3): ensure v0.2.112 chip palette folding tests still pass against extended harness

Total: ~10-15 new/modified tests.

## §5 — User-side smoke

```
# Step 1 — install v0.2.114.
grep version ~/forge-vaults/bluh/.obsidian/plugins/forge-client-obsidian/manifest.json
# Expected: 0.2.114

# Step 2 — open hello_world.md in source/Edit mode.
# Expected:
#   - Frontmatter (---...---) is FOLDED by default
#   - Only an opening "---" with fold-affordance visible (no full YAML rendered)
#   - # English content visible immediately below

# Step 3 — click the fold-affordance to EXPAND the frontmatter.
# Expected: full YAML lines visible. Click again to fold.

# Step 4 — open the same file in Live Preview mode.
# Expected: Obsidian's native Properties widget owns the rendering
# (less critical per driver; main is Edit mode).

# Step 5 — verify no regression on v0.2.112 features:
#   - Chip palette folding (Items A from v0.2.112) still works
#   - Chip cursor insertion (v0.2.113) still works
#   - Read-only overlay still gone
#   - New-Snippet action-shape picker still gone
```

## §6 — Open follow-ups expected

1. **Playwright + Obsidian Electron CI** (if §2.1 chose path a): document the CI setup. If too brittle, document the local-only nature of these tests.
2. **Custom Obsidian-shim drift risk** (if §2.1 chose path b): the shim depends on Obsidian internals; future Obsidian updates may break it. Document the assumptions made.
3. **Community-plugin prior art** (§2.5): if a "hide frontmatter" plugin solves this, credit/adapt their approach.
4. **Live Preview frontmatter handling**: Obsidian's Properties view owns Live Preview. Our fold is source-mode only by design. Document if Live Preview behavior changes as a result of our shim work.
5. **CSS de-emphasis Plan B disposition**: per §3.5 decision; document final state.
6. **Constitution amendment**: add specific Obsidian-CM6 caveats discovered (e.g., "Obsidian's CM6 extension X overrides plugin Y; use Z instead"). Build the institutional knowledge.

## §7 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §2 mandates harness extension strategy investigation BEFORE coding, Obsidian internals research BEFORE attempting fix.
- ✓ §57–74 (TDD): reproduction test landed before fix; fix verified by test passing.
- ✓ §86–118 (pure-core convention): pure-core findings stay pure-core; harness shim is integration layer.
- ✓ §76 (don't ship speculative fix): the failing reproduction test is the discipline gate. No fix ships without that test going green.
- ✓ §347 (version-bump sanity check): manifest pre-bump verified at 0.2.113; explicit version arg.
- ✓ §321 (feedback file before move): standard.
- ✓ "Assert cannot only with concrete error" HARD RULE: §2.3 + §2.4 produce concrete reproduction + mechanism identification before any fix attempt.
- ✓ v0.2.98 inlined-asset version stamping: main.js change alone triggers `.bundle-version` mismatch.
- ✓ NEW v0.2.112: CM6 extension changes must include integration test — this drain BUILDS the capability for the Obsidian-shim layer.

## §8 — Architectural framing

V1 polish + foundational test infrastructure extension.

The harness extension is V1-and-V2 useful. Any future Obsidian-specific CM6 quirk we hit (and there will be more, per the three documented this session) gets reproducible locally. Pays for itself across multiple future drains.

The frontmatter fold fix is V1 cohort UX completion of the v0.2.99 Item A intent. After this drain, cohort users see folded frontmatter by default in source/Edit mode — the original Tamar overwhelm signal fully addressed.

V2 lens: V2 may use a different rendering model (gestural promote, source field). The Obsidian-shim work survives as foundational test infrastructure even if the specific frontmatter-fold code changes.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §9 — Hand-off

Strict order:
1. §2.1 harness extension strategy investigation (1-2 hours)
2. Per outcome: §3.1 Phase 1 (extend harness)
3. §3.2 Phase 2 (reproduce failure as failing test)
4. §3.3 Phase 3 (identify mechanism + ship fix)
5. §3.4 Phase 4 (release)
6. §3.5 Phase 5 (CSS de-emphasis decision)

If §2.1 reveals BOTH paths are >2 days work:
- Surface scope in feedback
- Pivot to a less ambitious shim that catches MOST cases (mid-fidelity)
- Defer the comprehensive harness to v0.2.115+

If §2.4 reveals the override mechanism is something we can't work around (e.g., Obsidian explicitly forbids custom frontmatter decorations):
- Document the finding
- Keep CSS de-emphasis as the production answer
- Surface to user for V2-level rethink

Estimated CC time: 4-12 hours depending on §2.1 outcome. Multi-release if Phase 3 surfaces additional complexity.
