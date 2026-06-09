---
timestamp: 2026-06-09T09:00:00Z
session_id: drain-2026-06-09-0900
status: COMPLETED
shipped_version: 0.2.112
prompt_target_version: 0.2.107
---

# Feedback — v0.2.112 — CM6 harness + chip palette folding + frontmatter CSS de-emphasis

## §0 — Outcome summary

| Item | Status | Notes |
|---|---|---|
| **B** CM6 integration harness | ✅ Shipped | happy-dom + node:test; 4 integration tests passing |
| **A** Chip palette folding | ✅ Shipped | Pure-core + UI; 11 new tests |
| **C** Frontmatter fold retry | ⚠️ **Plan B shipped (CSS de-emphasis)**; programmatic fold proven correct in pure CM6, Obsidian-specific cause unknown |

Plugin shipped at **v0.2.112**, **621 tests passing** (+15 from this drain).

## §1 — Item B: CM6 integration harness ✅

### §1.1 — Architecture decision

Per §2.1 audit: existing tests use `node --test` (no vitest, no jest, no playwright). Test files live alongside source as `*.test.ts`. Bias toward consistency + shipping speed: **happy-dom + node:test** wins over Playwright (multi-day Electron management) or vitest (full migration cost).

Installed `happy-dom@^20.10.2` as a devDependency. ~3 MB transitive cost; lightweight DOM emulator that CM6 mounts cleanly against.

### §1.2 — Harness API

`src/test-helpers/cm6-harness.ts`. Exports `createIntegrationHarness()`:

```ts
const harness = createIntegrationHarness();
try {
  const view = harness.mount('---\ntype: action\n---\n# English', [
    makeFrontmatterFoldExtension(() => null),
  ]);
  await harness.flush();
  // Assert on view.dom.outerHTML, view.state, etc.
} finally {
  harness.destroy();
}
```

Splices happy-dom's `Window`, `document`, `MutationObserver`, `ResizeObserver`, `IntersectionObserver`, `Range`, `DOMRect` into `globalThis` before the EditorView mount, restores prior values on destroy. Caveat: `navigator` is a getter-only global in Node 20+ so it can't be overridden; CM6 doesn't strictly need it for fold/decoration tests.

### §1.3 — Catches three documented surprise classes

| Surprise | Catchable | How |
|---|---|---|
| v0.2.85→.89: `EditorView.dispatch` inside `ViewUpdate` | ✅ | Mount, dispatch in update, assert no throw |
| v0.2.108→.109: ViewPlugin can't provide line-break-spanning decorations | ✅ | Mount; mount itself throws RangeError if violation |
| v0.2.110: workspace-state race | ⚠️ Partial | No Obsidian workspace analog; harness can mock a host returning null vs valid to test gate behavior |

The third is the one the harness can't fully reproduce — Obsidian's workspace-state semantics aren't part of pure CM6. Future extension: a mock Obsidian app + workspace shim that replicates the timing model.

### §1.4 — Self-tests

`src/cm6-integration.test.ts` — 4 tests, all PASS:

1. **`makeFrontmatterFoldExtension` mounts without throwing.** Verifies the v0.2.110+ StateField-based approach doesn't violate CM6's "no line-break spans in ViewPlugins" rule.
2. **`Decoration.replace` placeholder renders + YAML hidden from DOM.** Asserts `forge-frontmatter-placeholder` class in `view.dom.outerHTML` AND that `"type: action"` is NOT in the rendered DOM. Both pass.
3. **Plain notes pass through.** No placeholder for documents lacking frontmatter.
4. **Type-less frontmatter passes through.** `readFrontmatterType` gate correctly returns null for `{title, tags}`-only frontmatter.

## §2 — Item C: Frontmatter fold retry ⚠️

### §2.1 — Empirical evidence: v0.2.111 IS correct in pure CM6

Harness self-test #2 (above) is decisive. The v0.2.111 implementation — StateField provides `Decoration.replace` for the YAML byte-range, widget rendering `⋯`, gate via `readFrontmatterType` reading the doc inline — works exactly as specified when mounted in plain CM6 + happy-dom.

`view.dom.outerHTML` contains `forge-frontmatter-placeholder` class AND does NOT contain `type: action` after the mount + flush. The fold IS visually applied in CM6.

**This pins the cohort failure as Obsidian-specific.** Obsidian's CM6 setup overrides plugin-provided `Decoration.replace` ranges before render. Specific mechanism unknown — three candidate causes remain (renderer override, compartment timing, Live Preview decoration overlap), all live below the harness's current capability.

### §2.2 — Plan B: CSS de-emphasis (shipped)

Per prompt §3.2: "Ship CSS de-emphasis (~10 LOC) as v0.2.112 Item C interim".

Added rules to `styles.css` targeting Obsidian's `.HyperMD-frontmatter` line classes:

```css
.markdown-source-view .cm-line.HyperMD-frontmatter,
.markdown-source-view .cm-line.HyperMD-codeblock.HyperMD-frontmatter,
.markdown-source-view .cm-line:has(span.cm-hmd-frontmatter) {
  opacity: 0.45;
  font-size: 0.85em;
  font-family: var(--font-monospace);
  color: var(--text-muted);
}
/* On hover, restore full opacity for legibility */
```

Result: snippet frontmatter is still rendered (programmatic fold inert in Obsidian) but visually muted — students see `# English` content as the dominant text, YAML reads as metadata. Live Preview unaffected (Obsidian's Properties view handles that natively).

The v0.2.111 programmatic-fold code stays in place. Two reasons:
1. Pure CM6 verification proves it works; the harness self-tests would regression if the code is removed.
2. If/when the Obsidian-specific cause is found, the fix is likely a small addition (decoration provider chain, compartment, or Live Preview hook), not a rewrite.

### §2.3 — Why the harness couldn't pin H1/H2/H3 as the prompt §2.3 requested

The prompt's intent was: harness reproduces H1 (silent multi-line drop) or H2 (Obsidian renderer override) or H3 (StateField not firing on initial-mount), and CC ships the matching fix. The harness self-tests PASS — that's the empirical answer to H3 (StateField DOES fire on initial-mount in pure CM6) and partial answer to H1 (no silent drop in pure CM6).

That leaves H2 (Obsidian renderer override) and "fourth unknown layer" as the remaining suspects, neither of which the current harness can reproduce. The harness needs an Obsidian-like wiring extension to make progress on those.

Documented as the highest-priority follow-up in §5.

## §3 — Item A: Chip palette folding ✅

### §3.1 — Pure-core: `chip-folding-core.ts`

Two functions:

```ts
libraryForActiveFilePath('forge-moda/sim.md') === 'forge-moda'
libraryForActiveFilePath('hello.md') === null

initialExpandedLibraries('forge-moda/sim.md', ['forge-moda', 'forge-music'])
  // → Set(['forge-moda']) — only moda expanded

initialExpandedLibraries(null, ['forge-moda', 'forge-music'])
  // → Set(['forge-moda', 'forge-music']) — all expanded
```

Per v0.2.106 lesson: path-prefix gates need positive frontmatter signal for behavioral routing. This is UI-only filtering (which sections show expanded vs collapsed); path-prefix is acceptable + documented inline.

Edge case covered: active file is under `forge-moda/` but no chips are loaded for moda (palette only has tutorial/music chips). Falls back to "expand all loaded sources" instead of erroring or expanding nothing.

11 unit tests covering: per-library matches, vault-root → null, null input, case-sensitivity, smart-default → one library, vault-root → all libraries, edge case.

### §3.2 — ChipsView integration

`render()` now:

1. First render of a session: compute `expandedLibraries` Set via pure-core from active file path + loaded sources.
2. Per group: render a focusable `<button>` h4 with ▶/▼ arrow + chip count `(N)`.
3. If section collapsed → skip emitting sub-groups + chip-row DOM (cheaper render + clear "no children" state).
4. Click toggle → mutate `expandedLibraries`; re-render via `render()`.

Session-scoped state: in-memory `Set<string>` on the `ChipsView` instance. Lost on Obsidian close (per prompt §2.7: "default to in-memory unless cohort feedback shows session-persistence is wanted"). No new dependency for state management (per prompt §1.A.tech: "No Redux. Local state.").

### §3.3 — CSS

Added rules for `.forge-chips-group-header` (the new button), `.forge-chips-group-arrow`, `.forge-chips-group-label`, `.forge-chips-group-count`. Hover changes color to `--interactive-accent`.

## §4 — Cumulative session ledger

**Plugin versions touched this v0312 drain:** 0.2.111 → 0.2.112 (1 release, but the harness landing is substantive infrastructure).

**Tests:**
- v0.2.111: 606 passing
- v0.2.112: **621 passing** (+15: 11 chip-folding pure-core + 4 CM6 integration)

**Constitution amendment progress:**
- The "CM6 changes require integration smoke" amendment proposed in the v0307 feedback now has its first concrete embodiment. The harness lives at `src/test-helpers/cm6-harness.ts` and self-tests at `src/cm6-integration.test.ts`.
- The amendment can now be reframed: "CM6 extension changes must include at least one integration test against `createIntegrationHarness()`." Mechanical to apply.

## §5 — Open follow-ups (refreshed)

1. **Obsidian-specific Decoration.replace override** — root cause of Item C's continued visual non-fold. Extending the harness with an Obsidian-CM6 wiring shim (registerEditorExtension compartment semantics, viewport handling, Live Preview path) would let us reproduce + fix locally. Combine with moda bridge pytest (v0.2.95 follow-up) under "real-Obsidian smoke" infrastructure line item.
2. **v0.2.99 Item B (facet_form removal)** — still pending. Recommended option C (plugin-side `resolveActionCode` routing).
3. **Plugin-side path-lookup audit** (v0.2.104) — every `files.find(f => f.basename === id)` site may have the same bug.
4. **release.sh drift preflight for `bundled-assets.generated.ts`** (v0.2.91) — still not added.
5. **v0.2.19 generate-internal pre-flight sync now dead code** (v0.2.102) — clean up next cycle.
6. **canonicalActionTemplate export cleanup** (v0.2.108 partial) — still exported from modal-templates-core but no in-repo consumers.
7. **forge-doc chapter 9 facet_form discipline note** — obsolete once v0.2.99 Item B ships.
8. **Chip palette category sub-grouping** (V2-ish) — within Moda, sub-categories. Out of scope for v0.2.112; cohort-evidence triggered.
9. **navigator splice in harness** — Node 20+ getter-only; if a future test needs `navigator`, may need `Object.defineProperty` with `{configurable: true}` or a different harness boundary.

## §6 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §2.1 audit + harness architecture decision pre-implementation; §2.3 H1/H2/H3 discrimination plan delivered (partial — harness pinned H3 + H1, can't discriminate H2 without Obsidian shim).
- ✓ §57–74 (TDD): integration tests written + verified pass; chip-folding pure-core tests written before integration.
- ✓ §86–118 (pure-core convention): `chip-folding-core` is pure-core; ChipsView integration is integration layer.
- ✓ §76 (don't ship speculative fix): Plan B explicitly authorized by prompt; harness empirical evidence drove the call (not speculation).
- ✓ §347 (version-bump sanity check): manifest 0.2.111 → 0.2.112 explicit.
- ✓ §321 (feedback before move): standard.
- ✓ "Assert cannot only with concrete error" HARD RULE: harness self-tests + cohort log v0.2.108 → v0.2.111 chain provide concrete evidence.
- ✓ v0.2.98 inlined-asset version stamping: main.js change alone triggers `.bundle-version` mismatch.
- ✓ v0.2.106 patterns: chip-folding path-prefix gates are UI-only; positive frontmatter signal NOT required + documented inline.
- ✓ NEW v0.2.107 "CM6 changes require integration smoke": this drain BUILDS that capability.

## §7 — User-side smoke

```
# Step 1 — install v0.2.112.
grep version ~/forge-vaults/bluh/.obsidian/plugins/forge-client-obsidian/manifest.json
# Expected: 0.2.112

# === Item A: chip palette folding ===
# Step 2 — open the chip palette (Cmd-P → "Forge: Open Chips").
# With active file in forge-tutorial/01-hello/hello_world.md:
# Expected: only Tutorial category expanded; Moda + Music show ▶ collapsed.

# Step 3 — switch active file to a forge-moda snippet.
# Re-open chip palette.
# Expected: only Moda expanded; others collapsed.

# Step 4 — open chip palette from vault root (no library context).
# Expected: ALL categories expanded with ▼.

# Step 5 — Manually click Moda's ▼ to collapse. Click another section.
# Within session, palette respects manual toggle.

# === Item C: frontmatter CSS de-emphasis ===
# Step 6 — Open hello_world.md or any snippet.
# Expected:
#   - Frontmatter (---...---) still visible but VISUALLY MUTED
#     (lower opacity, smaller monospace, grey text)
#   - # English content visually dominant
#   - Hover over frontmatter line → opacity restores to 1.0
#
# This is the CSS de-emphasis interim. Programmatic fold remains
# inert in Obsidian until the Obsidian-specific cause is found.

# === Item B: harness validation (dev-side only) ===
# Step 7 — Driver-optional: run `npm test` in
# ~/projects/forge-client-obsidian. Confirm all 621 tests pass,
# including the 4 "CM6 integration: …" tests.
```

## §8 — Architectural framing

V1 polish + foundational infrastructure.

- **Item B harness** is V1-and-V2 useful. Every future CM6/Obsidian extension change should add a `createIntegrationHarness()` test. The cost of catching this kind of bug was 3 release cycles per occurrence; the cost of writing the test is ~5 minutes per case.
- **Item C Plan B** is a cohort-visible improvement (frontmatter dominance reduced) that ships immediately while we investigate the Obsidian-specific override. Programmatic fold path stays in place for when the cause is found.
- **Item A** is V1-aligned with V2 (V2's chip palette likely uses similar category structure).

No V2 architectural commitments; no V2 semantic changes.

Per cc-prompt-queue.md §43, this feedback IS the chat summary.
