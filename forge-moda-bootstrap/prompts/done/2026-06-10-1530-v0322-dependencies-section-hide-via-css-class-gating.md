---
timestamp: 2026-06-10T15:30:00Z
session_id: drain-2026-06-10-1530
status: pending
priority: MEDIUM — cohort UX cleanup; continuation of Tamar overwhelm reduction theme
---

# v0.2.122 — Hide Dependencies section in snippets via CSS class gating + Cmd-P toggle

## §0 — Context

v0.2.116-119 cracked frontmatter overwhelm via CSS class gating (`forge-snippet` class on `containerEl` + CSS rules targeting `.cm-hmd-frontmatter` and `.metadata-container`). Cmd-P toggle escape hatch in v0.2.119 (`forge-expanded` class). Tamar onboarded successfully.

Same overwhelm class hits the `# Dependencies` section. Every snippet has one — it's auto-synced from Python by the engine + Forge: Sync edges tooling. Content is a single line plus a "synced from Python" italicized header. Visually noisy and not authoring-relevant for students.

User ask 2026-06-10-1500: "fold or hide the dependencies section in snippet." Pattern: apply the v0.2.116-119 mechanism to `# Dependencies` heading + following content.

This drain re-uses the established pattern. Single release. No CM6 decoration experiments — the prior 8-release dead-end (v0.2.108-v0.2.115) proved that path is wrong.

## §1 — Goal

For files with `type: action | data` AND `forge-snippet` class on containerEl (per v0.2.118 DOM-level tagging):

1. **Hide by default** the `# Dependencies` heading + everything below it (until next heading or EOF) in both source mode and Live Preview / Reading mode
2. **Cmd-P toggle**: extend the existing `forge-toggle-frontmatter` command OR add a new `forge-toggle-dependencies` command (per §2.2 investigation)
3. **Per-file scoped**: re-opening the snippet re-hides (consistent with v0.2.119 frontmatter pattern)

## §2 — Investigation phase (per §78)

### §2.1 — Locate the Dependencies section in rendered DOM

In source mode (CM6), the `# Dependencies` heading is a markdown heading rendered with class `.HyperMD-header`. In Live Preview, the same. In Reading mode, it's a `<h1>` (or `<h2>`, etc.) element.

The CHALLENGE: CSS can target the heading, but the CONTENT below it (until next heading or EOF) is a sequence of sibling elements without a containing wrapper. Pure-CSS targeting "everything from h1 'Dependencies' until next h1" is awkward but possible via `:has()` + `~` sibling selectors. May require DOM-level tagging similar to v0.2.118.

Confirm via dev-tools inspection of a rendered snippet:
- What's the class hierarchy around `# Dependencies` heading?
- Does the content below sit in a wrapper, or as sibling `<div>` / `<p>` / `<ul>` elements?
- Does Live Preview's Properties view affect this region's rendering?

### §2.2 — Toggle command shape

Two options:

**(a) Extend `forge-toggle-frontmatter` to toggle BOTH frontmatter and Dependencies together.** Single command, single visual mode (everything-hidden vs everything-visible).

**(b) New `forge-toggle-dependencies` command.** Independent toggle from frontmatter. Two commands; two classes (`forge-expanded` for frontmatter, e.g. `forge-deps-expanded` for dependencies); user can have frontmatter visible but deps hidden, or vice versa.

Driver preference unclear from the request. **Recommend (a)** — single mental model, fewer commands. Less cohort cognitive load. Power users can request (b) later if they hit a use case.

If (b) is chosen: doubles the toggle surface; document the two-command discoverability concern.

### §2.3 — Source-mode rendering specifics

In source mode (CM6 editor), the `# Dependencies` heading is a line. The content below it is more lines. To hide via CSS:

```css
.forge-snippet .cm-line:has(.cm-header-1[data-heading="Dependencies"]),
.forge-snippet .cm-line:has(.cm-header-1[data-heading="Dependencies"]) ~ .cm-line {
  display: none;
}
```

Or via finer-grained heading detection. Verify the actual class hierarchy in CM6's rendered HTML; `data-heading` attribute may not exist.

If CSS can't cleanly target "heading + all subsequent siblings until next heading," consider a DOM-level mechanism (similar to v0.2.118's containerEl tagging): scan the document, find `# Dependencies`, add a class to the heading's `.cm-line`, then CSS hides that + all subsequent `.cm-line` elements until next heading-tagged line.

### §2.4 — Live Preview / Reading mode

In Live Preview, markdown is rendered to HTML. The `# Dependencies` becomes `<h1>Dependencies</h1>` (or similar). The content below is sibling elements. CSS:

```css
.forge-snippet .markdown-preview-section h1:contains("Dependencies"),
/* ... and all siblings until next h1 */ {
  display: none;
}
```

`:contains()` isn't standard CSS. Need a different approach:
- Use `:has(text())` (CSS4) if supported in Obsidian's CM6 / Electron Chromium version
- OR DOM-tag the heading via a Markdown post-processor (Obsidian API surface)

Investigate which approach Obsidian supports. The v0.2.116 community-plugin prior art search pattern: before code, search community plugins for "hide section by heading" / "fold heading" patterns. Likely someone has solved this.

### §2.5 — Cross-cutting: chip Dependencies tracking

Note: the chip palette is unrelated to the Dependencies section. Chips are inserted into `# English` body via `insertChipTextAtLine` (v0.2.113 + v0.2.120 empty-line polish). The hide-Dependencies work doesn't touch chip insertion logic.

## §3 — Implementation phases

### §3.1 — Phase 1: source mode hide

Per §2.3 investigation:
- Update `src/frontmatter-fold-view-plugin.ts` (or rename to `src/snippet-fold-view-plugin.ts`) to add Dependencies fold logic
- Apply CSS class to `# Dependencies` heading line + subsequent lines until next heading
- Per v0.2.118 pattern: CM6 `EditorView.editorAttributes.compute` + DOM-level tagging via `workspace.on('file-open')` events

Add CSS to `styles.css`:

```css
.forge-snippet .forge-deps-line {
  display: none;
}
.forge-snippet.forge-deps-expanded .forge-deps-line {
  display: revert;
}
```

(Specificity wins via `forge-snippet` AND `forge-deps-expanded` per the v0.2.119 toggle pattern.)

### §3.2 — Phase 2: Live Preview / Reading mode hide

Per §2.4 investigation:
- If DOM post-processor approach: register a markdown post-processor that tags the Dependencies heading + subsequent siblings with `forge-deps-element` class
- CSS:

```css
.forge-snippet .markdown-preview-view .forge-deps-element {
  display: none;
}
```

### §3.3 — Phase 3: Cmd-P toggle command

Per §2.2 chosen option (a) — extend existing command:
- Update `forge-toggle-frontmatter` to toggle BOTH `forge-expanded` AND `forge-deps-expanded` together
- OR rename to `forge-toggle-snippet-chrome` (more accurate)

Notice on toggle: "Forge: snippet metadata + dependencies expanded" / "...hidden".

If option (b) — new independent command:
- Add `forge-toggle-dependencies` command
- Add `forge-deps-expanded` class management
- Two commands; document discoverability concern

### §3.4 — Phase 4: tests

Integration tests via `createIntegrationHarness()` (v0.2.112):
- Source mode: `# Dependencies` line + content lines have `forge-deps-line` class
- With `forge-deps-expanded` ancestor class: lines are visible
- Without: hidden

Pure-core tests:
- Heading-range detection: given a doc, identify the `# Dependencies` heading line + the next heading line; everything in between is the section
- Edge cases: no Dependencies heading; Dependencies heading at EOF; multiple Dependencies headings (use first)

### §3.5 — Phase 5: smoke

`smokes/2026-06-10-XXXX-v0.2.122-deps-hide.md` (forge-core writes after CC ships):
- Install v0.2.122
- Open hello_world.md → verify Dependencies section hidden in source mode
- Verify Dependencies hidden in Live Preview
- Cmd-P toggle → verify everything expands (frontmatter + deps if option a; just deps if option b)
- Toggle again → verify hides

## §4 — Tests required

- Pure-core (heading-range detection): ~3-4 tests
- Integration (via harness): ~2-3 tests for the CM6 class application
- Total: ~5-7 new tests. Plugin suite: 650 → ~655-657 passing.

## §5 — User-side smoke

(Forge-core in chat writes the smoke file after CC ships. Per protocol §323.)

CC's prompt-side responsibility: enumerate the smoke scope so CC knows what to leave un-automated. Smoke scope:

1. Install v0.2.122; verify version
2. Open hello_world.md (or any snippet); verify Dependencies section hidden in source mode
3. Verify Dependencies hidden in Live Preview / Reading mode
4. Cmd-P toggle → expands (per chosen option a or b)
5. Open different snippet → re-hides per-file scope
6. Open a non-snippet note (plain markdown) → Dependencies section NOT hidden (gate works)

## §6 — Open follow-ups expected

1. **Snippet schema cleanup**: now that Dependencies + frontmatter both hide by default, the chrome around the snippet is minimal. Future polish: rename "Dependencies" to "Calls" or similar more student-friendly term? Out of scope; future drain.
2. **Reading mode `forge-snippet-preview` class wiring**: still pending from v0.2.117. This drain's Phase 2 may need it; if so, fold in.
3. **Carrying forward**:
   - v0.2.99 follow-up #14: migrate existing snippets with `facet_form` field (now inert per v0.2.121)
   - Plugin-side path-lookup audit (v0.2.104)
   - moda bridge pytest (v0.2.95)
   - v0.2.119 persistent per-snippet expanded state across file switches
   - facet-form-core.ts deletion (v0.2.121 §8 #3)

## §7 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §2 mandates DOM inspection + community-plugin prior art search before code.
- ✓ §57–74 (TDD): pure-core failing-first tests; integration tests via harness.
- ✓ §86–118 (pure-core convention): heading-range detection is pure-core; class application is integration layer.
- ✓ §76 (don't ship speculative fix): pattern reuse from v0.2.116-119 reference implementation.
- ✓ §347 (version-bump sanity check): manifest pre-bump at 0.2.121; explicit version arg.
- ✓ §321 (feedback file before move): standard.
- ✓ NEW v0.2.112 (CM6 integration tests): yes, this drain adds CM6 integration tests.
- ✓ NEW v0.2.116 pattern (CSS class gating beats decoration competition): yes, this drain APPLIES the pattern.
- ✓ NEW v0.2.116 process (community-plugin prior art before harness): §2.4 mandates the search before attempting custom mechanism.
- ✓ NEW v0.2.119 pattern (default-hide + Cmd-P escape hatch + per-file scoping): yes, this drain APPLIES the pattern.

## §8 — Architectural framing

V1 cohort UX polish. Same pattern as v0.2.116-119 frontmatter hide. No V2 architectural commitments.

V2's source-field migration won't disturb the Dependencies hide — the section structure carries forward identically.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §9 — Hand-off

Single focused drain. Per the v0.2.116 retrospective, FIRST investigation step is community-plugin prior art search. The mechanism (CSS class gating + DOM-level tagging) is reference-implemented at v0.2.116-118 — reuse, don't reinvent.

Estimated CC time: 1-2 hours including investigation + implementation + tests.

If §2.2 chooses option (a) — single toggle command extending `forge-toggle-frontmatter` — that's the lower-risk path. If choosing (b), surface the discoverability concern in feedback.

If §2.4 reveals Live Preview / Reading mode hide needs a DOM post-processor (rather than pure CSS), Phase 2 may be its own drain (v0.2.123). Source-mode hide (Phase 1) ships standalone in that case.
