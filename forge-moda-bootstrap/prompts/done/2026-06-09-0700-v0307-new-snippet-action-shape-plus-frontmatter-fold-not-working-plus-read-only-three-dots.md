---
timestamp: 2026-06-09T07:00:00Z
session_id: drain-2026-06-09-0700
status: pending
priority: HIGH — cohort UX polish; observed against post-v0.2.106 install
---

# v0.2.107 — New-snippet "action shape" + frontmatter not folded + folded-header three-dots/read-only message

## §0 — Context

Driver smoke against post-v0.2.106 install surfaced three UX cleanup items, all in the spirit of v0.2.99's "cohort UX cleanup" push. None are functional regressions — all are visual/affordance polish.

Note: v0.2.99 → v0.2.106 (CC drain) successfully landed Items A/C/D from the original v0.2.99 prompt. Item B (facet_form removal) deferred with concrete reasoning; recommend option C plugin-side routing in a future drain.

This drain targets three NEW user-observed items, distinct from v0.2.99 Item B:

- **Item A** — Create-new-snippet dialog still has an "action shape" element. Remove.
- **Item B** — Frontmatter is not collapsed by default despite v0.2.102's `FrontmatterFoldViewPlugin` shipping. Diagnose + fix.
- **Item C** — After folded `# English` / `# Python` headers, an Obsidian or plugin overlay shows "three dots ... read only - switch to English/Python mode to edit". Remove.

## §1 — Goals

### Item A — Remove "action shape" from create-new-snippet dialog

The plugin's "Forge: New Snippet" command opens a dialog. Currently includes an "action shape" element (dropdown, picker, or similar) that asks the user to choose a snippet shape. Driver wants this removed.

Behavior after:
- Dialog asks for snippet name (and maybe path/directory)
- No "action shape" picker
- Created snippet defaults to a single canonical shape: `type: action` + `inputs: []` + `# English` + `# Python` skeleton

The defaulted "single shape" matches what v0.2.99 left in the new-snippet template. Removing the picker enforces single-shape authoring.

### Item B — Frontmatter not collapsing — investigate + fix

v0.2.102 shipped `src/frontmatter-fold-view-plugin.ts` with 6 tests + ViewPlugin registration. The driver reports the frontmatter is NOT folded by default when opening snippets. Investigate why.

Behavior after:
- Open `type: action | data` snippet → frontmatter `---...---` block is auto-folded
- User can expand by clicking fold-triangle on the opening `---` line
- Visual: only the opening `---` (or some Obsidian-collapsed-block representation) visible at the top; content (`# English`) immediately follows

### Item C — Remove "read only" message + three-dots indicator after folded facet headers

When `# English` or `# Python` is folded (per v0.2.83+ facet-mutex), Obsidian's editor or the plugin's `readOnlyFacetFilter` (seen at `main.ts:270`) shows an indicator after the heading. Reported as "three dots followed by 'read only - switch to English/Python mode to edit'".

Behavior after:
- Folded `# English` / `# Python` heading: just the heading line visible; no overlay; no message
- Mutex semantics unchanged — read-only enforcement on the folded facet's content remains (can be retained even without the visible indicator)
- Tooltip on hover OK if minimal; but no inline overlay or trailing message

## §2 — Investigation phase (MANDATORY per §78)

### §2.1 — Item A: locate the new-snippet dialog

```bash
grep -rn "New Snippet\|new-snippet\|snippet.*Modal\|snippet.*Dialog" src/
```

Identify:
- The command registration in `main.ts` (likely `forge-new-snippet` or similar)
- The Modal class that implements the dialog
- The form fields including "action shape" — what TS/DOM identifier represents it?
- The submit handler that creates the file

Audit how the dialog currently uses the user's "action shape" selection — what does it affect in the generated snippet? If it's just selecting between identical templates, removal is a one-line. If it actually changes the snippet structure, document what we're losing.

### §2.2 — Item B: why isn't the frontmatter fold firing?

Multiple hypotheses, discharge each:

**H1: ViewPlugin not registered.** Verify `registerEditorExtension` includes `makeFrontmatterFoldViewPlugin(...)` in `main.ts.onload()`. Was the registration added in v0.2.102 OR did it get lost in the v0.2.103-106 churn?

```bash
grep -n "registerEditorExtension\|FrontmatterFold\|makeFrontmatterFold" src/main.ts
```

**H2: Asset version stamp not triggering re-extract.** v0.2.98's `.bundle-version` sentinel forces re-restore on mismatch. Verify driver's installed plugin actually has v0.2.107's main.js (a stale main.js from v0.2.106 wouldn't include any v0.2.107 fixes but ALSO wouldn't include any fold registration regressions). Confirm via:

```bash
grep -c "FrontmatterFold\|frontmatter-fold" <user-vault>/.obsidian/plugins/forge-client-obsidian/main.js
```

Expected non-zero.

**H3: Fold-range computation returns null.** `computeFrontmatterFoldRange(doc)` per the v0.2.102 spec returns null for malformed / missing frontmatter. If for some reason the canonical snippet's frontmatter trips this null path, no dispatch fires. Test against a known-good snippet (hello_world.md) in isolation.

**H4: ViewUpdate gate logic skipping initial mount.** v0.2.102's plugin tracks `foldedForFilePath` to fold once per file-open. If this state is set incorrectly OR Obsidian's file-open lifecycle doesn't fire the expected ViewUpdate at mount, the dispatch never schedules. Check by adding a temporary console.log at the ViewPlugin's update entry point.

**H5: CSS / Obsidian rendering bug.** The fold IS dispatched + applied at the CM6 level, but Obsidian visually shows the frontmatter expanded due to a CSS conflict or rendering pass. Check the foldedRanges state immediately after dispatch.

**H6: type: action gate too narrow.** If the v0.2.102 plugin only gates on `type: action` but driver's test snippet has `type: data` or unset type, gate skips. Verify gate condition matches driver's test snippet.

Recommend a small diagnostic build with `[forge-frontmatter-fold v0.2.107]` console logs at:
- ViewPlugin construction
- Every ViewUpdate call (with foldedForFilePath state)
- Fold-range computation result
- Dispatch attempt + setTimeout schedule confirmation

Ship as v0.2.107-spike if hypotheses don't pin via code reading alone. Driver runs, pastes output, CC fixes.

### §2.3 — Item C: locate the "read only" message + three-dots

```bash
grep -rn "read.only\|read-only\|switch to\|readOnlyFacetFilter" src/
grep -rn "\\.\\.\\." src/  # tighter than literal three-dots search
```

Identify:
- `readOnlyFacetFilter` is registered at `main.ts:270`. Inspect that filter's implementation — does it inject the "three dots ... read only..." overlay/widget?
- Find where the text "read only" or "switch to ... mode to edit" lives in plugin source

Investigate if the indicator is:
- A CM6 widget decoration added by readOnlyFacetFilter
- An inline annotation in the fold preview
- An Obsidian-native fold-block indicator that we customize
- Something in the facet-mutex layer's notice/decoration code

Determine: does removing the indicator require:
- (a) Just removing the visual widget but keeping read-only enforcement (preferred)
- (b) Removing the entire readOnlyFacetFilter (loses read-only semantics — undesirable)

(a) is the goal. CC strips the widget decoration but keeps the read-only state.

### §2.4 — Cross-cutting: facet-mutex interaction

After §2.3 changes, verify the facet-mutex still works correctly:
- Fold # Python → flip mutex + auto-fold # English (unchanged)
- The read-only-while-folded enforcement still applies (user can't edit folded content)
- No visual overlay/indicator on the folded heading

### §2.5 — Cross-cutting: forge-doc chapter 9 facet_form discipline note

Out of scope for this prompt but flag: forge-doc's chapter 9 facet_form discipline note becomes obsolete WHEN Item B from v0.2.99 finally ships (facet_form removal). Not this drain — but track.

## §3 — Implementation phases

### §3.1 — Phase 1: Item A — new-snippet dialog cleanup

Per §2.1 investigation:
- Locate the Modal class (likely `src/new-snippet-modal.ts` or in `main.ts`)
- Remove the "action shape" form field + DOM element
- Remove the corresponding state from the Modal's settings
- Update the submit handler to use the single default shape (per v0.2.99's template)
- Update the test (if any) for the Modal

### §3.2 — Phase 2: Item B — frontmatter fold fix

Per §2.2 investigation outcome:
- **If H1**: re-register `FrontmatterFoldViewPlugin` in `main.ts.onload()`. Audit recent commits (v0.2.103-106) for accidental removal.
- **If H2**: ensure asset version stamping is bumped; should auto-resolve on next plugin install. Not a code fix — workflow fix.
- **If H3**: fix `computeFrontmatterFoldRange` to handle the case it's tripping on.
- **If H4**: refactor file-open lifecycle handling per Obsidian's actual events (may need to hook `workspace.on('file-open')` separately if ViewUpdate isn't reliable for initial mount).
- **If H5**: investigate Obsidian-specific fold rendering; possibly need CSS override.
- **If H6**: extend gate to include relevant `type` values (or remove gate entirely if the fold should be universal for foldable frontmatter).

After fix: add an integration test (or extend the 6 existing) that explicitly verifies the fold dispatch fires on a simulated file-open.

### §3.3 — Phase 3: Item C — remove read-only indicator

Per §2.3 investigation:
- Locate the widget/decoration that adds "three dots + read only - switch to..." to folded facet headers
- Remove the widget code OR strip just the visible decoration while preserving the read-only enforcement state

Verify after change:
- Folded `# English` / `# Python` heading shows ONLY the heading line (no overlay/widget/trailing text)
- Editing the folded content is still prevented (read-only state retained)
- Tooltip on hover (if exists) is minimal or absent

### §3.4 — Phase 4: cross-cutting integration

- Run plugin test suite: should remain ≥599 passing (with possible test adjustments).
- Build clean: `npm run build` exit 0.
- Asset version stamping (v0.2.98) auto-handles iframe / inlined asset refresh — main.js change alone triggers `.bundle-version` mismatch.

## §4 — Tests required

### Item A — new-snippet dialog

- Test that the Modal renders without the "action shape" field
- Test that the created snippet has the default shape (no shape selection)
- ~2-3 new/updated tests

### Item B — frontmatter fold fix

- Integration test that simulates file-open on a `type: action` snippet and verifies fold dispatch fires
- Test the specific hypothesis branch the fix targets (e.g., if H1: test ViewPlugin is in the registered extension list)
- ~1-3 new tests depending on hypothesis

### Item C — read-only indicator removal

- Test that the folded facet heading rendering does NOT include the widget/overlay
- Test that read-only enforcement on folded content is still active
- ~2 new tests

Total: ~5-8 new tests.

## §5 — User-side smoke

```
# Step 1 — install v0.2.107.
grep version ~/forge-vaults/bluh/.obsidian/plugins/forge-client-obsidian/manifest.json
# Expected: 0.2.107

# === Item A: new-snippet dialog ===
# Step 2 — Open Cmd-P → "Forge: New Snippet" (or whatever the command is named).
# Expected dialog: snippet name field (and optional path/directory field).
# NO "action shape" picker/dropdown.

# Step 3 — Submit. Verify the new snippet:
#   - Has frontmatter: type: action + inputs: []
#   - Has # English + # Python skeleton

# === Item B: frontmatter fold ===
# Step 4 — Open hello_world.md in source mode.
# Expected visual state:
#   - Frontmatter (---...---) is FOLDED (only the opening "---" line shown)
#   - # English content immediately visible below
#   - # Python folded per facet-mutex (or expanded if edit_mode: python)
# Click fold-triangle on "---" → frontmatter expands.

# Step 5 — Open a non-snippet note (plain Obsidian note).
# Expected: frontmatter NOT auto-folded (only action/data snippets trigger).

# === Item C: read-only indicator ===
# Step 6 — Open hello_world.md (english mode default). # Python is folded.
# Expected visual state:
#   - # Python heading shown as a clean heading line
#   - NO "three dots ... read only ..." after the heading
#   - NO inline overlay or trailing message
# Click fold-triangle on # Python → expands per mutex (auto-folds # English).

# Step 7 — Verify read-only enforcement:
# With # English folded (python mode active), try to edit # English's
# folded content (probably not possible since it's not visible, but try
# Ctrl-Home and arrow keys to move into the folded region).
# Expected: cursor cannot enter the folded region for editing; read-only
# state intact.

# Step 8 — facet-mutex regression: from python mode, click fold-triangle
# on # Python to collapse. Expected: # English auto-expands per symmetric
# mutex (v0.2.87). No read-only indicator on either facet now.
```

## §6 — Open follow-ups expected

1. **Item B (facet_form removal) from v0.2.99**: still pending. CC's recommended option C (plugin-side E-- routing via resolveActionCode) needs a focused drain.
2. **forge-doc chapter 9 facet_form discipline note**: becomes obsolete WHEN facet_form removal ships. Track for that drain's coordination message.
3. **Plugin-side path-lookup audit** (carried from v0.2.104): every site that does `files.find(f => f.basename === snippet_id)` may have the same bug. Candidates: `reconcileFrontmatterInputs`, `syncEnglishFromPython`, freeze-affordance lookup.
4. **moda bridge pytest** (carried from v0.2.95): would have caught v0.2.77→v0.2.95 regression. Still not added.
5. **release.sh drift preflight for `bundled-assets.generated.ts`** (carried from v0.2.91): still not added.
6. **v0.2.19 generate-internal pre-flight sync now dead** (carried from v0.2.102): clean up.

## §7 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §2 mandates audits for all three items with concrete grep commands. Item B has 6 hypotheses for diagnostic discharge.
- ✓ §57–74 (TDD): all three items add tests. Failing-first applies to Items A and C; Item B's test depends on root-cause.
- ✓ §86–118 (pure-core convention): `computeFrontmatterFoldRange` already pure-core (v0.2.102); no new core needed unless §3.1 surfaces a new factorable concern.
- ✓ §76 (don't ship speculative fix): Item B explicitly mandates investigation OR diagnostic spike before fix.
- ✓ §347 (version-bump sanity check): manifest pre-bump at 0.2.106; explicit version arg.
- ✓ §321 (feedback file before move): standard.
- ✓ "Assert cannot only with concrete error" HARD RULE: §2 audits grounded in concrete grep + ViewPlugin state inspection.
- ✓ v0.2.98 inlined-asset version stamping: main.js change alone triggers `.bundle-version` mismatch → force-overwrite.
- ✓ v0.2.106 patterns: any path-prefix gate added in this drain must use frontmatter signal, not pure path-prefix.

## §8 — Architectural framing

V1 polish. Cohort-UX cleanup. No V2-direction conflicts.

Item A simplifies the authoring workflow (single shape) — aligns with V2's expected reduced field model.

Item B is fixing a recent v0.2.102 regression (or surfacing why v0.2.102's fold doesn't fire in driver's environment) — no architectural change, just correctness.

Item C is a visual cleanup of the v0.2.83 facet-mutex's read-only filter — preserves semantics, removes the trailing indicator.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §9 — Hand-off

Suggested order:
1. Item A — smallest scope; standalone Modal edit.
2. Item C — locate widget, strip decoration.
3. Item B — investigate via §2.2 hypotheses; ship fix OR diagnostic build.

Item B may need a spike build if §2.2 hypothesis chain doesn't pin from code reading. If shipping a spike, follow v0.2.85-89 / v0.2.94 / v0.2.103 / v0.2.105 patterns — instrument all branch points, including upstream from the suspected failure point.

All three ship together as v0.2.107. If Item B's investigation reveals a deeper issue (e.g., Obsidian's frontmatter parser exposed range changed), surface scope.
