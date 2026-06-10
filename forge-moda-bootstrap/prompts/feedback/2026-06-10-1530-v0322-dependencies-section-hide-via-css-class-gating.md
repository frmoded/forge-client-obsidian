---
timestamp: 2026-06-10T15:30:00Z
session_id: drain-2026-06-10-1530
status: COMPLETED
shipped_version: 0.2.122
prompt_target_version: 0.2.122
---

# Feedback — v0.2.122 — hide # Dependencies section in snippets via CSS class gating

## §0 — Outcome summary

| Phase | Status |
|---|---|
| §2 investigation (prior-art search + DOM inspection) | ✅ Completed |
| §3.1 source mode hide (CM6 line decoration) | ✅ Shipped |
| §3.2 Live Preview / Reading mode hide (markdown post-processor) | ✅ Shipped |
| §3.3 Cmd-P toggle (extended `forge-toggle-frontmatter`) | ✅ Shipped — chose §2.2 option (a) single toggle |
| §3.4 tests (10 pure-core + 3 integration) | ✅ Shipped |
| §3.5 smoke scope | Documented in §5 below |

## §1 — Investigation findings

### §1.1 Prior-art search (per the v0.2.116 HARD RULE)

WebSearch for "obsidian hide markdown section by heading" returned:
- kepano/obsidian-hider — UI-level hides (status bar, titlebar, etc.), not content-section hides.
- Forum threads discussing CSS sibling selectors + `:has()` for similar patterns, but no canonical plugin solution.

Conclusion: no clean off-the-shelf community pattern for "hide heading + all following siblings until next heading by name." The closest forum advice was "use sibling combinator (`~`) + `:has()`" — workable in source mode where we have CM6 line-level control, but awkward in Live Preview where text-content matching isn't native CSS.

**Continued with the established v0.2.116-119 pattern.** CSS class gating + plugin-managed class application.

### §1.2 §2.2 toggle command shape — option (a) chosen

Single command extending `forge-toggle-frontmatter` to toggle BOTH frontmatter AND dependencies via the same `forge-expanded` class. Single mental model; one keybinding; fewer commands for cohort to discover. Power users can request granular control via a follow-up if a use case surfaces.

Command label updated to "Toggle frontmatter + dependencies visibility (active snippet)" — id unchanged so existing keybindings keep working.

## §2 — Implementation

### §2.1 Pure-core: `src/dependencies-section-core.ts`

```ts
export function findDependenciesRange(doc: string): DependenciesRange | null {
  // Scans for # Dependencies heading (any level, case-insensitive).
  // Walks forward to next # heading (any level) or EOF.
  // Returns 0-based {depsStart, depsEnd} inclusive line range, or null.
}

export function isLineInsideDependencies(doc: string, line: number): boolean;
```

10 tests covering: standard last-section shape, followed-by-heading, no-Dependencies (null), case-insensitive heading match, ## subheading boundary, heading-only (no body), multiple-Dependencies (first wins), inside-body line checks, no-Dependencies always false, line-past-doc-end false.

### §2.2 Source-mode mechanism: `src/dependencies-fold-view-plugin.ts`

CM6 StateField that computes a DecorationSet on every transaction. Iterates `[depsStart..depsEnd]` and applies `Decoration.line({ class: 'forge-deps-line' })` to each line. Standard CM6 line-decoration pattern (same as v0.2.111 frontmatter-fold structure).

Per the v0.2.116 retrospective: no `foldEffect` attempts. Just tag the lines; let Obsidian render them; CSS hides them.

3 integration tests via `createIntegrationHarness()` (per v0.2.120 HARD RULE):
- Lines inside `# Dependencies` get the class.
- Doc without `# Dependencies` → no class anywhere.
- Extension mounts without throwing (mounts-safe check).

### §2.3 Live Preview / Reading mode mechanism

`main.ts:registerMarkdownPostProcessor` walks rendered HTML:

```ts
const headings = el.querySelectorAll('h1, h2, h3, h4, h5, h6');
for (const h of headings) {
  if (h.textContent?.trim().toLowerCase() === 'dependencies') {
    // Tag heading + walk forward through siblings until next heading.
    h.classList.add('forge-deps-section');
    let sibling = h.nextElementSibling;
    while (sibling && !/^H[1-6]$/.test(sibling.tagName)) {
      sibling.classList.add('forge-deps-section');
      sibling = sibling.nextElementSibling;
    }
    break;
  }
}
```

No DOM mutation beyond `classList.add` — preserves Obsidian's rendering pipeline.

### §2.4 CSS (`styles.css`)

```css
.forge-snippet .forge-deps-line,
.forge-snippet .forge-deps-section {
  display: none !important;
}
.forge-snippet.forge-expanded .forge-deps-line,
.forge-snippet.forge-expanded .forge-deps-section {
  display: revert !important;
}
```

Gated on `.forge-snippet` parent (per v0.2.118 DOM-level tagging). Reuses `.forge-expanded` from v0.2.119 — same escape hatch reveals both frontmatter AND dependencies.

### §2.5 Cmd-P toggle command

`forge-toggle-frontmatter` command id unchanged. Label updated to reflect the broadened scope. Existing `toggleFrontmatterVisibility` callback (from v0.2.119) is reused — the `forge-expanded` class flip now controls four CSS rules instead of two.

## §3 — Tests

- **Before**: 650 passing.
- **After**: 663 passing (+13).
  - 10 new pure-core tests for `findDependenciesRange` + `isLineInsideDependencies`.
  - 3 new integration tests via `createIntegrationHarness()` for the CM6 line decoration.

## §4 — Cross-cutting verification

- Build clean (`npm run build` exit 0).
- Tests 663 passing.
- Asset version stamping auto-handles BRAT update propagation.

## §5 — User-side smoke checklist

```
# Step 1 — install v0.2.122.
grep version ~/forge-vaults/<vault>/.obsidian/plugins/forge-client-obsidian/manifest.json
# Expected: 0.2.122

# Step 2 — open hello_world.md (any snippet with # Dependencies).
# In SOURCE MODE: expected
#   - Frontmatter hidden (v0.2.118)
#   - # English visible
#   - # Python visible
#   - # Dependencies + body HIDDEN (v0.2.122)

# Step 3 — switch to LIVE PREVIEW mode (Cmd-E).
# Expected: same as above — Dependencies hidden in Live Preview too.

# Step 4 — switch to READING mode.
# Expected: Dependencies still hidden in Reading mode (post-processor
# coverage).

# Step 5 — Cmd-P → "Forge: Toggle frontmatter + dependencies visibility"
# Expected: BOTH frontmatter AND Dependencies become visible.

# Step 6 — run command again.
# Expected: BOTH hide again.

# Step 7 — open a non-snippet note (plain markdown with a
# "# Dependencies" heading by coincidence).
# Expected: Dependencies NOT hidden (gate requires .forge-snippet
# parent class, which only applies to type:action|data files).

# Step 8 — open a different snippet.
# Expected: re-opens with Dependencies hidden (per-file scoping; the
# previous file's expanded state doesn't persist).
```

## §6 — Open follow-ups

1. **Snippet schema cleanup**: now that Dependencies + frontmatter both hide by default, the chrome around snippets is minimal. Cohort UX surface is tighter; defer further polish (e.g. renaming "Dependencies" → "Calls" for student-friendliness) pending cohort feedback.
2. **v0.2.117 Reading mode `forge-snippet-preview` class wiring**: still pending. This drain's markdown post-processor approach sidestepped the need (the CSS targets `.forge-deps-section` directly, not gated on `.markdown-preview-view`). May still be useful for other Reading-mode targeting.
3. **Carrying forward** (unchanged from v0.2.121):
   - v0.2.99 follow-up #14 (migrate inert facet_form fields)
   - Plugin-side path-lookup audit (v0.2.104)
   - moda bridge pytest (v0.2.95)
   - v0.2.119 persistent expanded-state across file switches
   - `facet-form-core.ts` deletion (v0.2.121 §8 #3)
   - Harness Obsidian-shim build (deferred indefinitely per v0.2.116)
4. **Granular toggle commands** (deferred from §2.2): if cohort wants independent frontmatter vs dependencies visibility, add `forge-toggle-dependencies` as a separate command in a follow-up.

## §7 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §1.1 prior-art search; §1.2 toggle-shape decision; both before code.
- ✓ §57–74 (TDD): pure-core failing-first tests landed before the CM6 extension; integration tests cover the decoration application.
- ✓ §86–118 (pure-core convention): `findDependenciesRange` + `isLineInsideDependencies` are pure-core; CM6 extension + post-processor are integration layer.
- ✓ §76 (don't ship speculative fix): reuses v0.2.116-119 reference implementation.
- ✓ §347 (version-bump sanity check): manifest 0.2.121 → 0.2.122.
- ✓ §321 (feedback file before move): this file written before prompt move.
- ✓ HARD RULE (v0.2.112): CM6 extension has integration test against `createIntegrationHarness()`.
- ✓ HARD RULE (v0.2.116): community-plugin prior-art search BEFORE novel mechanism attempts.
- ✓ PATTERN (v0.2.116): CSS class gating beats decoration competition — applied.
- ✓ PATTERN (v0.2.119): default-hide + Cmd-P escape hatch + per-file scoping — applied.

## §8 — Architectural framing

V1 cohort UX polish. Same pattern as v0.2.116-119 frontmatter hide. No V2 architectural commitments.

V2's source-field migration won't disturb this — the heading-based section structure carries forward identically.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.
