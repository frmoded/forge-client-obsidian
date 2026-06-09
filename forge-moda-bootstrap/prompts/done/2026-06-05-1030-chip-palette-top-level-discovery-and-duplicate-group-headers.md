# Chip palette polish — top-level snippet auto-discovery + duplicate group headers

## Scope

Two related chip-palette UX issues surfaced in v0.2.52 smoke (2026-06-05):

**Finding 1 — Top-level snippets don't become chips.** When a user creates an action snippet at the vault root (`~/forge-vaults/<vault>/my_snippet.md`), it does NOT appear in the chip palette. The user must move it into a library subdirectory (e.g., `forge-moda/my_snippet.md`) for auto-discovery to surface it. Per the Mission's low-floor principle: a beginner who authors a snippet at the most natural location (vault root) should see immediate chip availability. Forcing the move to a library subdirectory is friction in exactly the wrong place — cost-to-add-a-snippet rises for the FIRST snippet someone authors.

**Finding 2 — Duplicate group headers.** Each chip group appears twice in the palette UI: once in large uppercase font (e.g., `SETUP`) and once in small font (e.g., `Setup`), in two consecutive rows. The two are visually distinct but represent the same logical group.

Two-phase per the investigation-before-design rider:
- **Phase 1**: investigation. Capture data for both findings. For Finding 1, determine whether the discovery walk (`buildSnippetInventory` in `src/chips.ts`) actually skips vault-root snippets and whether that's by design or oversight. For Finding 2, screenshot or DOM-inspect the duplicate headers and trace whether the duplication is in the data (auto-derived + override not merging) or in the rendering (CSS pseudo-element + actual label both visible).
- **Phase 2**: fix both based on Phase 1 findings.

What this prompt does NOT do:
- Restructure the chip palette UI substantively (column layouts, drag-and-drop, etc.).
- Add a settings page for chip discovery scope.
- Change the schema v2 spec — both findings are implementation gaps relative to the spec, not spec gaps.
- Migrate `_chips.md` content in any vault — the auto-derivation behavior change in Finding 1 should be invisible to existing `_chips.md` files (no override needed for the new "Personal" / vault-root group).

## Why

Per Mission: composability is one of the four load-bearing snippet properties. Both findings degrade the chip palette's role as the composability surface — Finding 1 raises the cost-to-add (snippets must live in libraries to be chip-able), Finding 2 raises cognitive load (every group appears twice; user has to mentally dedupe). Both Papert losses; both small fixes; both fit one combined drain.

## Files likely to touch

For Phase 1 (investigation only — no code changes yet):
- `~/projects/forge-client-obsidian/src/chips-core.ts` — read `autoDeriveChips`, `mergeChipsWithOverrides`, group-handling logic.
- `~/projects/forge-client-obsidian/src/chips.ts` — read `buildSnippetInventory`, `loadVaultRootV1Chips`, `loadLibraryChips`. Understand the discovery walk's scope.
- `~/projects/forge-client-obsidian/src/chips-view.ts` — read `render` and the group-rendering logic. For Finding 2, find where group headers get DOM-built.
- `~/projects/forge-client-obsidian/src/main.ts:libraryDirNames` — confirm what's considered a "library subdir."
- `~/projects/forge-moda/_meta/_chips.md` — for Finding 2, check whether the `groups[]` entries' `id` field is case-mismatched against auto-derived group names.

For Phase 2 — Finding 1:
- `~/projects/forge-client-obsidian/src/chips.ts` (or `chips-core.ts`) — extend discovery to walk vault root for action snippets that are not in any library subdir. Filter out `_*.md` per S7. Filter out files inside library subdirs (don't double-count).
- Possibly new pure-core helper in `chips-core.ts` (extension of No. 16 / No. 17, or new helper No. 18) deciding "is this file a top-level personal snippet?" given (path, libraryDirNames, frontmatter).

For Phase 2 — Finding 2:
- `~/projects/forge-client-obsidian/src/chips-core.ts` `mergeChipsWithOverrides` OR `src/chips-view.ts` `render` — fix the duplication based on Phase 1 findings.

- `~/projects/forge-client-obsidian/manifest.json` — `{CURRENT} → {NEXT_PATCH}` placeholder.
- `~/projects/forge-client-obsidian/INSTALL.md` — version pin update.

## Phase 1 — Investigation

### Phase 1.A — Finding 1 (top-level discovery)

**Hypothesis** (to confirm or refute):

`buildSnippetInventory` in `chips.ts` walks `app.vault.getMarkdownFiles()` filtered by `libDir/` prefix per `libraryDirNames`. Files at the vault root (no leading library subdir) fail the prefix filter and don't enter the inventory. Therefore `autoDeriveChips` never sees them.

**Required findings to capture in §1.2:**

1. Cite the exact filter logic in `chips.ts` that scopes discovery to library subdirs. Line numbers, surrounding 5 lines of context.
2. Confirm: does ANY code path in `chips.ts` or `chips-core.ts` consider vault-root snippets? Grep for `vault.getMarkdownFiles` / `getRoot()` / `path.startsWith` patterns.
3. Cite `main.ts:libraryDirNames` to confirm what's considered a library.
4. **Decide the right scope for the fix** based on Mission + S7:
   - Option A: vault-root action snippets become chips, grouped as "Personal" (or `(my snippets)` / "Vault root" / TBD label). Excludes `_*.md` per S7. Excludes anything inside a library subdir.
   - Option B: every action snippet anywhere in the vault becomes a chip, with group derived from subdirectory (including nested ones beyond top-level). More permissive; may include unintended files (e.g., daily notes that happen to have `type: action`).
   - Option C: vault-root + nested-non-library; the nested-non-library path may be useful for vaults that organize snippets into folders not tied to a registered library.

My recommendation: Option A. Lowest blast radius, clearest semantics, matches the Mission's first-snippet-low-floor framing.

### Phase 1.B — Finding 2 (duplicate group headers)

**Hypotheses** (to confirm or refute):

a. **Un-merged auto-derived group + override**: auto-derive produces a group with `id: Setup` (subdirectory name); `_chips.md` `groups[].id: Setup` is meant to relabel, not add a second group. If `mergeChipsWithOverrides` doesn't dedupe by lowercased id (or doesn't dedupe at all), both groups end up in the rendered list.
b. **CSS pseudo-element + actual label**: `chips-view.ts` renders the group header via a CSS class that injects `::before { content: attr(data-group-id); text-transform: uppercase; }` PLUS the actual label as DOM text. Both visible.
c. **Bug in `groups[]` field handling**: the spec says `groups[]` declares group order + display labels. If the rendering treats `groups[]` entries as new groups (instead of overrides of existing auto-derived ones), each `groups[]` entry produces a new visual group, doubling.

**Required findings to capture in §1.2:**

1. Take a screenshot (or describe the DOM tree from devtools) of the chip palette showing the duplicate `SETUP` + `Setup`. Capture the relevant HTML/CSS.
2. Read the rendering logic in `chips-view.ts:render`. Confirm where group headers are built.
3. Read `mergeChipsWithOverrides` for the group-merge logic. Test (in CC's head or via a quick repl) what happens when auto-derive produces group `Setup` AND `_chips.md` `groups[].id` is also `Setup`.
4. **Diagnose the root cause** — one of (a), (b), (c), or something else.

### Phase 1 deliverable

A two-paragraph diagnosis section in §1.2 of the feedback:
- Paragraph 1: Finding 1 root cause + decision on Option A/B/C + reasoning.
- Paragraph 2: Finding 2 root cause + the specific code/CSS responsible.

Commit Phase 1 as a separate commit before starting Phase 2 (per the multi-phase feedback discipline in cc-prompt-queue.md). If Phase 1 surfaces that either finding's fix is bigger than expected (e.g., requires schema changes), pause and ask before designing Phase 2.

## Phase 2 — Fix

### Phase 2.A — Finding 1 fix

Per Option A (top-level "Personal" group), implement:

1. Pure-core helper: `discoverTopLevelSnippets(allFiles, libraryDirs)` returns the subset of files that are (a) at the vault root and (b) not inside any library subdir. Tests in `chips-core.test.ts`.
2. Extend `buildSnippetInventory` to merge top-level snippets into its inventory under a synthetic library name like `(root)` or `(personal)`. Group label decision per Phase 1 (probably "Personal" or "My snippets").
3. Auto-derivation logic (`deriveChip`) applies unchanged — top-level snippets get the same B7.1 signature-derived insertion as library snippets.
4. Per-snippet `chip: false` still opts out.
5. `_*.md` files still skipped per S7.

### Phase 2.B — Finding 2 fix

Per Phase 1 diagnosis, ONE of:

- If (a) un-merged: fix `mergeChipsWithOverrides` to dedupe groups by id (case-insensitive recommended, but Phase 1 confirms case sensitivity choice). Tests for the dedup behavior.
- If (b) CSS: remove the pseudo-element OR remove the DOM-text label. Update CSS rules.
- If (c) `groups[]` handling: fix the rendering loop to treat `groups[]` as overrides of existing groups, not as new groups.

### Tests

**TDD discipline for the pure-core changes** (Phase 2.A) — 5+ cases:

1. `discoverTopLevelSnippets([], [])` → `[]`.
2. `discoverTopLevelSnippets([{path: 'foo.md'}], ['forge-moda'])` → `[{path: 'foo.md'}]` (top-level file passes).
3. `discoverTopLevelSnippets([{path: 'forge-moda/x.md'}], ['forge-moda'])` → `[]` (inside library skipped).
4. `discoverTopLevelSnippets([{path: '_chips.md'}], ['forge-moda'])` → `[]` (S7 underscore-prefix skipped at top level).
5. `discoverTopLevelSnippets([{path: 'foo/bar.md'}], ['forge-moda'])` → depends on Option A vs C decision; default A says `[]` (nested-non-library not included).
6. Idempotent rider.

**Finding 2 fix** — TDD cases depending on root cause; CC adds them based on Phase 1 diagnosis.

**Combined regression test** for the dedup case: `mergeChipsWithOverrides` with auto-derived group `Setup` AND `_chips.md` `groups[].id: Setup` should produce ONE group named appropriately (label from `groups[]` if present, otherwise from auto-derive).

### Smoke (CC writes §3 per protocol)

Per cc-prompt-queue.md 6a/6b: paste-able commands where possible; CC actually runs the smoke they wrote.

Smoke scenarios CC validates by running the production code path (in CC's sandbox via test harness):

1. Create a vault-root snippet → confirm it appears in the inventory + becomes a chip in the "Personal" group.
2. Create a library-subdir snippet → confirm it appears in its library's group (existing behavior preserved).
3. Create a `_underscore.md` file at root → confirm it does NOT become a chip.
4. Library group with `_chips.md` `groups[].id` matching auto-derived group → confirm one group, not two.

User-side smoke § 3 then covers what CC can't reach (the actual chip palette UI rendering — confirm visually that "SETUP + Setup" no longer appears as two headers).

## Out of scope

- Settings UI for "where to discover chips from" (deferred).
- Discovering chips from non-vault sources (URLs, remote registries) — never a goal.
- The schema v2 spec changes (the spec is correct; both fixes are implementation gaps).
- Backward compat for vaults that hand-curated `_chips.md` files relying on the duplicate-groups bug as a feature.

## Don'ts

- **Don't ship a speculative fix.** The hypotheses above are guesses; Phase 1 investigation wins.
- **Don't change the schema spec.** Both bugs are implementation, not design.
- **Don't break v0.2.52's migration logic.** The chip-md-migration-core stays untouched.
- **Don't introduce a new ChipPaletteGroup field** for "is this the root group?" — use a synthetic library name (`(root)` / `(personal)`) that the existing data model handles.
- **Don't bump versions concretely** — use `{CURRENT} → {NEXT_PATCH}` placeholder.
- **Don't batch feedback at end of multi-phase drain.** Phase 1 feedback committed before Phase 2 starts.

## Report when done

Standard §0–§3 per cc-prompt-queue.md with the two-phase structure:

- **§0** — manifest before/after, commit SHAs (Phase 1 + Phase 2), push, tag, release URL, SHA round-trip, line counts.
- **§1.1** — TDD test cases for both Phase 2.A and Phase 2.B (whatever shape the latter takes).
- **§1.2** — Phase 1 investigation findings: cited line numbers, hypothesis refuted-or-confirmed, root-cause diagnoses for both findings.
- **§1.3** — Phase 2 fixes landed: cited line-number diffs.
- **§1.4** — Post-fix verbatim test output + smoke scenarios CC ran.
- **§1.5** — Full `npm test`.
- **§2** — Anything surprising during investigation or fix. Specifically: any case in the existing chip-palette test suite that started failing or had to be updated as a side-effect.
- **§3** — User-side smoke per cc-prompt-queue.md 6a/6b: paste-able commands for file-state checks; clear prose for UI checks (palette rendering visual confirmation).
