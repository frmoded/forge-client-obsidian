---
timestamp: 2026-06-09T09:00:00Z
session_id: drain-2026-06-09-0900
status: pending
priority: HIGH — Item C (frontmatter fold) is cohort UX block; Item B (harness) is foundational
---

# v0.2.112 — Chip palette folding + integration test harness + frontmatter fold retry (with harness) + chip cursor insertion

## §0 — Context

Four items bundled, ordered by dependency:

- **Item B (foundational)** — Build an integration test harness that exercises real CM6 + Obsidian rendering pipeline. Three independent CM6 surprises this session (v0.2.85-89 dispatch-in-update, v0.2.108-110 ViewPlugin-can't-line-break-spans, v0.2.110 workspace-pointer-race) were all caught only via cohort smoke. Pure-core tests catch zero of this. This harness is overdue. **Driver green-lit ASAP 2026-06-09-1000.**

- **Item C (uses B)** — Retry frontmatter fold (v0.2.99 Item A → v0.2.107 Item B → v0.2.108-111 white-flag). Driver confirmed via post-v0.2.111 observation: **the frontmatter is unfolded in BOTH Edit AND View mode**. This RULES OUT CC's §3.5 H4 (Live Preview vs source mode). Remaining suspects: H1 (silent multi-line decoration drop), H2 (Obsidian renderer overrides), H3 (decoField not firing on initial-mount). Integration harness will discriminate empirically.

- **Item A (independent)** — Chip palette folding with context-smart defaults per brainstorm decision (Option C from chips brainstorm). Three category sections (Moda / Music / Tutorial); active file path determines which expands by default. Driver authorized: "No Redux. Local state. Technology your call."

- **Item D (independent)** — Chip insertion at cursor location within `# English` facet. Currently chips insert at a fixed location (end of file or end of English facet). Driver wants: if cursor is inside `# English` facet, chip insertion happens at cursor's line position. Fallback: existing behavior when cursor is outside `# English`. Authoring ergonomics improvement.

Critical priority order: B FIRST (or B+A+D in parallel), then C using B's harness. Item C must NOT proceed via speculative dispatch attempts without B's empirical capability. Items A and D both touch the chip palette but are independent; can ship together.

## §1 — Goals

### Item B — Integration test harness for real Obsidian/CM6 rendering

A test infrastructure that can:
1. Load a real CM6 `EditorView` instance with Obsidian's CM6 extensions wired
2. Mount the plugin's ViewPlugins / StateFields against it
3. Open a markdown file with specified frontmatter + content
4. Capture the rendered DOM
5. Assert visibility, fold state, decoration presence at the DOM level

Target failure modes the harness must catch:
- ViewPlugin trying to provide line-break-spanning decorations (v0.2.109 surprise)
- StateField reading workspace state during initial-mount (v0.2.110 surprise)
- `EditorView.dispatch` called inside `ViewUpdate` (v0.2.85-89 surprise — should test for absence of "Calls to EditorView.update" errors)
- Decoration silently dropped by Obsidian's renderer pipeline (v0.2.108 H5 confirmed)

Implementation candidates (CC investigates per §2.1):
- **(a) Playwright headless against real Obsidian** — highest fidelity; requires Electron app management
- **(b) jsdom + CM6 npm packages + custom mount** — medium fidelity; no Obsidian-specific rendering
- **(c) vitest browser mode + custom test setup** — moderate fidelity; possible if Obsidian extensions can be imported standalone
- **(d) Plain Node + DOM emulation via happy-dom + CM6 packages** — lightweight; verify CM6 needs the full DOM features the bug surfaces require

CC picks based on §2.1 investigation. Bias toward whichever ships fastest while catching the three documented surprise classes.

### Item C — Frontmatter fold (RETRY with harness)

Per driver diagnostic: the frontmatter is unfolded in BOTH Edit AND View mode. This narrows the suspect set significantly.

Goal unchanged from v0.2.99 Item A: on file-open in any mode, the `---`-delimited YAML frontmatter block is folded by default for `type: action | data` snippets. User expands by clicking the fold-affordance.

**Approach**: use Item B's harness from the start. Discriminate empirically between H1/H2/H3 BEFORE attempting another fix. Confirmed-cause → targeted fix → harness regression test → ship.

If H1/H2/H3 all fail to pin and the issue is a fourth unknown layer, accept CC's §4 Plan B: **CSS de-emphasis as Phase 2 fallback** (~10 LOC, ships immediately while we investigate further).

### Item A — Chip palette folding (Option C)

Three collapsible category sections in the chip palette:
- `▶ Moda` / `▼ Moda  (N chips)` with arrow indicator
- `▶ Music` / `▼ Music  (N chips)`
- `▶ Tutorial` / `▼ Tutorial  (N chips)`

On palette open:
- Active file path matches `forge-moda/*` → expand Moda only; others collapsed
- Active file path matches `forge-music/*` → expand Music only
- Active file path matches `forge-tutorial/*` → expand Tutorial only
- Active file path doesn't match any → expand ALL (no preferred context; show everything)

User can manually expand/collapse any category. State persists per session.

**Tech**: local state. NOT Redux per driver call.
- If `ChipsView` is React-based: `useState` + Obsidian's view state for session persistence
- If `ChipsView` is vanilla DOM: class members + `localStorage` (scoped to the plugin)

Bundle size budget: zero new dependencies for state management. If implementation hits friction without a library, CC may surface to driver for Zustand authorization (~3KB gzipped, zero boilerplate). NEVER Redux without explicit driver auth.

### Item D — Chip insertion at cursor location

Currently chips insert at a fixed location (likely end of file or end of `# English` facet). User experience friction: authors with cursor positioned mid-`# English` who click a chip get the chip far from where they're working, then have to scroll/cut/paste.

New behavior:
1. Detect cursor position when chip is clicked
2. Determine if cursor is within the `# English` facet section (between `# English` heading line and next heading-or-EOF)
3. If YES: insert chip content at the line of the cursor (above, below, or at line — see §2.8 investigation)
4. If NO (cursor in frontmatter, `# Python`, etc.): fall back to existing behavior — insert at end of `# English` facet

Edge cases:
- No active editor: skip (existing behavior unchanged)
- Active editor but no `# English` heading on disk: skip (existing behavior unchanged)
- Active editor with cursor BEFORE `# English` heading: fallback (insert at end of English)
- Active editor with cursor at end of `# English` (last line of content): insert at cursor (basically same as current behavior for that specific position)
- Snippet currently in `edit_mode: python` (English facet folded by mutex): cursor likely can't be in folded region; treat as "outside English" → fallback

## §2 — Investigation phase (MANDATORY per §78)

### §2.1 — Item B: Harness architecture investigation

```bash
# Inspect current test infrastructure:
ls forge-client-obsidian/src/*.test.ts | head
cat forge-client-obsidian/package.json | grep -A2 "test\|vitest\|playwright"
```

Audit what's already in place. Does the codebase use jest, vitest, or node:test?

Verify the CM6 packages CC has access to:
```bash
cat forge-client-obsidian/package.json | grep "@codemirror"
ls forge-client-obsidian/node_modules/@codemirror/
```

Per v0.2.89, `@codemirror/language` is installed. `@codemirror/state` + `@codemirror/view` were established earlier.

**Decision tree**:
- If existing tests use plain node:test: extend with happy-dom + CM6 package mounting (option d)
- If existing tests use vitest with `environment: 'happy-dom'`: leverage existing setup (option c/d hybrid)
- If neither: bootstrap vitest with browser mode OR Playwright for highest fidelity

Document the decision + reasoning in feedback. The harness lives at `forge-client-obsidian/test/integration/` (new directory) to separate from unit tests.

### §2.2 — Item B: Harness API design

The harness should expose a simple test API:

```typescript
test('frontmatter fold renders', async () => {
  const harness = await createIntegrationHarness();
  const view = harness.openFile({
    path: 'test.md',
    content: '---\ntype: action\ninputs: []\n---\n\n# English\n\nHello.',
  });
  await harness.applyPluginExtensions([makeFrontmatterFoldViewPlugin(...)]);
  await harness.waitForRender();
  
  expect(harness.isLineVisible('type: action')).toBe(false);
  expect(harness.isLineVisible('# English')).toBe(true);
});
```

Critical capabilities:
- `openFile({path, content})` — mounts a file in the EditorView
- `applyPluginExtensions(...)` — registers our ViewPlugins/StateFields
- `waitForRender()` — flushes microtasks + animationFrames
- `isLineVisible(text)` — DOM-level visibility query
- `dispatch(transaction)` — manual transaction dispatch for state-machine testing
- `getDecorations()` — list of currently-applied decorations for inspection

### §2.3 — Item C: Use harness to discriminate H1/H2/H3

Write three failing tests against the v0.2.111 codebase:

```typescript
test('H1: multi-line replace decoration via ViewPlugin is rejected', async () => {
  // Reproduce v0.2.109 RangeError
});

test('H2: Obsidian renderer overrides our decoration', async () => {
  // Apply our decoration; assert it survives Obsidian's render pass
});

test('H3: StateField runs on initial-mount', async () => {
  // Confirm decoField fires before EditorView is interactive
});
```

Each test pinpoints exactly which suspect is firing in the cohort environment. CC ships a fix per the confirmed cause.

### §2.4 — Item A: Chips palette architecture audit

```bash
grep -n "ChipsView\|chips-view\|CHIPS_VIEW_TYPE\|_chips" forge-client-obsidian/src/main.ts
grep -rn "chipsHost\|renderChips\|loadChips" forge-client-obsidian/src/
```

Identify:
- Where `ChipsView` is implemented
- Whether it uses React, vanilla DOM, or a custom renderer
- How `_chips.md` files are parsed and rendered
- Current category structure (if any)

Document the rendering approach before designing the folding UI.

### §2.5 — Item A: Path-prefix context detection

Per v0.2.106 lesson: path-prefix gates need positive frontmatter signal for BEHAVIORAL routing. For UI-only filtering, path-prefix is acceptable but document the choice.

For chip palette default-expand logic:
- Active file path starts with `forge-moda/` (case-sensitive) → moda default
- Active file path starts with `forge-music/` → music default
- Active file path starts with `forge-tutorial/` → tutorial default
- Else → all-expanded

If active file changes during a palette session (user navigates), do NOT re-collapse — respect user's manual choices. Only the FIRST open of the palette uses smart defaults.

### §2.6 — Item A: Chip count badges

Each category header shows chip count: `▼ Moda (12)`. Count is derived from the loaded `_chips.md` files per library. Stable across sessions.

If chip count is computationally expensive (CC investigates the chip-loading path), cache the count at palette mount; refresh on extension reload.

### §2.7 — Cross-cutting: chip palette state persistence

Session-scoped state:
- React (useState): in-memory; lost on Obsidian close
- Class members: in-memory; lost on Obsidian close
- localStorage: persists across sessions

User's framing: "session" (per the brainstorm conversation). Default to in-memory unless cohort feedback shows session-persistence is wanted. localStorage adds complexity for marginal gain in V1.

### §2.8 — Item D: chip insertion mechanics

```bash
grep -rn "insertChip\|chipInsert\|appendChip\|insertAt" forge-client-obsidian/src/
grep -rn "ChipsView.*click\|onChipClick" forge-client-obsidian/src/
```

Identify the existing chip-insertion code path. Document:
- Where chip click is handled
- How content is currently inserted (Obsidian's `editor.replaceRange`, `editor.replaceSelection`, or direct vault.modify call)
- Whether there's already a cursor-aware code path elsewhere (e.g., the New Snippet template insertion may use cursor logic)

Cursor position read via Obsidian API:
- `editor.getCursor()` returns `{line, ch}` for the cursor's current position
- `editor.getCursor('head')` vs `'anchor'` if there's a selection — pick `'head'` (active cursor position)

Facet boundary detection — pure-core function:

```typescript
type FacetBounds = { englishStart: number; englishEnd: number } | null;
function findEnglishFacetBounds(doc: string): FacetBounds;
```

Returns line numbers (0-based) of `# English` heading line + the line after the facet ends (next heading or EOF). Returns null if no `# English` heading.

Insertion decision:
- `cursorLine >= englishStart && cursorLine < englishEnd` → insert at `cursorLine + 1` (line below cursor) or at `cursorLine` (replace empty line) per UX preference
- Else → fallback to existing behavior

Recommend: insert at `cursorLine + 1` (chip content appears on the line BELOW the cursor's current line). Matches "type-and-insert" mental model.

If the cursor is on a NON-empty line and the chip is multi-line, inserting below means the chip becomes a new visual block — clean. If we inserted AT cursor line, we'd be inserting into the middle of an existing line, which is hostile.

## §3 — Implementation phases

### §3.1 — Phase 1: Item B — harness skeleton

Per §2.1 outcome:
- Create `forge-client-obsidian/test/integration/` directory
- Implement `createIntegrationHarness()` factory
- Mount CM6 EditorView with required extensions
- Implement the test API per §2.2
- Add `npm run test:integration` script to package.json
- CI hook: `npm test` should include integration tests (or separate, CC decides)

### §3.2 — Phase 2: Item C — discriminate + fix frontmatter fold

Per §2.3 tests:
- Land the three H1/H2/H3 reproduction tests against v0.2.111 code
- Identify which fires
- Implement targeted fix per the confirmed cause
- Add a passing test as regression guard
- Ship

**Fallback per CC's §4 Plan B**: if H1/H2/H3 don't pin OR the fix can't be implemented quickly:
- Ship CSS de-emphasis (~10 LOC) as v0.2.112 Item C interim
- Surface in feedback as "harness shipped + fold deferred again"

### §3.3 — Phase 3: Item A — chip palette folding UI

Per §2.4 outcome:
- Extend `ChipsView` to render category sections with fold affordances
- Compute category from chip's source library (path-based or frontmatter-tagged)
- Implement smart-default expand logic per §2.5
- Implement user manual expand/collapse toggle
- Wire local state per §2.7

### §3.4 — Phase 3.5: Item D — chip insertion at cursor

Per §2.8 outcome:
- Add pure-core `src/find-english-facet-bounds.ts` with `findEnglishFacetBounds(doc: string)` function + tests
- Locate the existing chip-click handler in `ChipsView` (or wherever chip insertion happens)
- Modify the insertion code path:
  - Read `editor.getCursor('head')` from the active MarkdownView's editor
  - Call `findEnglishFacetBounds(editor.getValue())`
  - If cursor is within English facet: insert at `cursorLine + 1` via `editor.replaceRange(chipContent + '\n', {line: cursorLine + 1, ch: 0})`
  - Else: fall back to existing behavior (no behavior change for this case)
- Preserve existing functionality for edge cases (no active editor, no English heading, etc.)

This change should be invisible when cursor is OUTSIDE English facet (regression-free) and seamless when cursor is INSIDE.

### §3.5 — Phase 4: cross-cutting integration

- Run full plugin test suite + integration suite
- Build clean: `npm run build` exit 0
- Asset version stamping (v0.2.98) auto-handles iframe re-bundle + inlined asset refresh

## §4 — Tests required

### Item B — harness

- Internal tests of the harness itself: openFile mounts correctly; waitForRender flushes; dispatch propagates; isLineVisible matches DOM truth.
- Smoke test: harness can reproduce the v0.2.85-89 "dispatch inside update" error when given offending code.
- ~5-8 harness self-tests.

### Item C — frontmatter fold

- 3 H1/H2/H3 reproduction tests (some pass, some fail per §2.3)
- 1 final fix verification test
- ~4 new integration tests using the harness.

### Item A — chip palette folding

- Pure-core tests: category determination from chip source; smart-default expand logic from active file path
- Integration tests via harness: render category headers; click expand/collapse; verify state persistence within session
- ~6-8 new tests.

### Item D — chip insertion at cursor

- Pure-core tests for `findEnglishFacetBounds`: well-formed snippet; no English heading; English heading at start; English heading mid-doc; English heading at end; multiple headings; English with `# Slot Resolutions` body section
- Integration tests via harness: cursor in English → insert at cursor+1; cursor in Python → insert at fallback location; cursor in frontmatter → fallback; no editor → no-op
- ~5-7 new tests.

Total: ~20-27 new tests.

## §5 — User-side smoke

```
# Step 1 — install v0.2.112.
grep version ~/forge-vaults/bluh/.obsidian/plugins/forge-client-obsidian/manifest.json

# === Item C: frontmatter fold (THE big one) ===
# Step 2 — open hello_world.md in source/Edit mode.
# Expected:
#   - Frontmatter (---...---) is FOLDED by default
#   - Only an opening "---" with fold-triangle visible
#   - # English content visible immediately below
# Click fold-triangle on "---" → frontmatter expands.

# Step 3 — switch to Live Preview / Reading mode.
# Expected: frontmatter behavior matches Obsidian's native Properties rendering
# (folded/collapsed-by-default). This was less critical per driver; main is Edit mode.

# === Item A: chip palette folding ===
# Step 4 — open the chip palette (Cmd-P → "Forge: Open Chips" or wherever).
# With active file in forge-tutorial/01-hello/hello_world.md:
# Expected: only Tutorial category expanded; Moda + Music collapsed.

# Step 5 — switch active file to a forge-moda snippet.
# Re-open chip palette.
# Expected: only Moda expanded; others collapsed.

# Step 6 — open chip palette from vault root (no library context).
# Expected: ALL categories expanded.

# Step 7 — Manually collapse Moda. Within the same session, palette remembers.

# === Item D: chip cursor insertion ===
# Step 8 — Open hello_world.md (any snippet with # English content).
# Place cursor in the middle of # English's body — e.g. on a line that
# says "print('hello, world')".
# Open chip palette; click any chip.
# Expected: chip content inserted on the LINE BELOW your cursor's line,
# NOT at the end of file or end of facet.

# Step 9 — Place cursor in # Python body (or frontmatter, or unrelated line).
# Click any chip.
# Expected: chip content inserted at the existing fallback location
# (presumably end of # English facet) — NOT at the cursor position.

# Step 10 — Snippet with no # English heading (rare edge case — possibly
# a malformed snippet). Open chip palette; click chip.
# Expected: existing fallback behavior; no crash.

# === Item B: harness validation (dev-side only) ===
# Step 11 — Driver-optional: run `npm run test:integration` in
# ~/projects/forge-client-obsidian. Confirm all integration tests pass.
```

## §6 — Open follow-ups expected

1. **Item B harness extension to moda bridge tests**: per v0.2.95 follow-up. Once the harness exists, fold the moda bridge pytest into it (or its sibling JS-side smoke). One unified integration tooling.
2. **CSS de-emphasis interim if Item C harness-driven fix not feasible in this drain**.
3. **Item B (v0.2.99) facet_form removal**: still pending. CC's recommended option C.
4. **Plugin-side path-lookup audit** (v0.2.104).
5. **release.sh drift preflight** (v0.2.91).
6. **v0.2.19 generate-internal pre-flight sync now dead** (v0.2.102).
7. **Chip palette category sub-grouping** (V2-ish): within Moda, sub-categories Scenes/Songs/Effects. Out of scope for v0.2.112. Cohort-evidence triggered.

## §7 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §2 mandates harness architecture audit, chips render path audit, H1/H2/H3 discrimination via harness BEFORE Item C fix.
- ✓ §57–74 (TDD): Item C's discrimination tests are failing-first; harness self-tests verify the test infrastructure itself; chips Option C tests cover pure-core + integration.
- ✓ §86–118 (pure-core convention): Item C's `computeFrontmatterFoldRange` and Item A's category-determination logic are pure-core; harness + UI are integration layer.
- ✓ §76 (don't ship speculative fix): Item C explicitly mandates harness-driven discrimination BEFORE fix attempt. Reinforces v0.2.108-111 retrospective.
- ✓ §347 (version-bump sanity check): manifest pre-bump at 0.2.111; explicit version arg.
- ✓ §321 (feedback file before move): standard.
- ✓ "Assert cannot only with concrete error" HARD RULE: §2.3 mandates concrete harness-based evidence for Item C cause.
- ✓ v0.2.98 inlined-asset version stamping: main.js change alone triggers `.bundle-version` mismatch.
- ✓ v0.2.106 patterns: path-prefix gates need positive frontmatter signal — Item A uses path-prefix for UI-filtering only (low cost of being wrong), documented per §2.5.
- ✓ v0.2.111 NEW: CM6 changes require integration smoke (CC §5 #1). Item B BUILDS this.

## §8 — Architectural framing

V1 polish + foundational infrastructure. Item B's harness is V1-and-V2 useful — every future CM6/Obsidian extension change uses it.

Item C completes the v0.2.99 Item A intent (cohort UX overwhelm reduction).

Item A is V1-aligned with V2 (V2's chip-palette successor likely uses similar category structure; the folding UI carries forward).

No V2 architectural commitments; no V2 semantic changes.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §9 — Hand-off

Strict order:
1. **Item B** — build harness first. Item C depends on it.
2. **Item C** — use harness to discriminate H1/H2/H3; ship targeted fix OR CSS de-emphasis fallback.
3. **Item A** — independent; can ship in parallel with C OR after.
4. **Item D** — independent; touches chip palette code path; can ship with Item A OR separately.

If Item B's §2.1 investigation reveals the harness is substantially more work than expected (e.g., Playwright + Obsidian Electron integration is multi-day):
- Surface scope in feedback
- Ship Items A + D standalone as v0.2.112 (chip palette work bundle)
- Defer B + C to v0.2.113 as a focused harness drain

If Item C's H1/H2/H3 discrimination via harness pins the cause but the fix requires significant CM6/Obsidian expertise:
- Ship harness + tests + analysis as v0.2.112
- Defer the fix to v0.2.113 as a targeted-fix drain
- Ship CSS de-emphasis as interim Cohort UX bridge

Critical: per §2.1, the harness architecture decision is CC's. Optimize for SHIPPING + catching the three documented surprise classes, not for theoretical perfection.
