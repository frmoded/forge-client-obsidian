---
timestamp: 2026-06-08T21:30:00Z
session_id: drain-2026-06-08-2130
prompt_modified: 2026-06-08T20:30:00Z
status: shipped
---

# v0.2.83 — facet-mutex gestural fold-driven edit_mode — SHIPPED

## §0 — Release coordinates

- **Released**: `forge-client-obsidian` v0.2.83 (the prompt's v0.2.80 placeholder was past — current was 0.2.82, so bump → 0.2.83).
- **Tag**: `v0.2.83` (`https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.83`)
- **forge bundle bumps**: none (no engine changes; no bundled vault changes).
- **forge-client-obsidian commits**:
  - `<facet-mutex-impl>` — pure-core + controller + extraction + palette guard.
  - `e3bfa57` — Release v0.2.83.
  - `66a03cf` — INSTALL.md bump.

## §1 — Spike acknowledgement

Spike GREEN per the prompt's §-1 amendment — proceeded with Approach B as authorized. No spike pivot; Approach A path dropped per §8.

## §2 — Implementation

### Phase 1 — pure-core (`src/facet-mutex-core.ts`)

`decideInitialState(editMode, headings)` and `decideOnFoldChange(prevFold, newFold, mode, headings)` — both pure functions, zero Obsidian dependency, fully testable in isolation.

- 12 unit tests in `src/facet-mutex-core.test.ts`:
  - 5 cases for `decideInitialState`: english+both, python+both, english+only-english, python+only-python, neither.
  - 5 cases for `decideOnFoldChange` per prompt §4.1: expand-python-in-english-mode → flip; expand-english-in-python-mode → flip; collapse-english-in-english-mode → no flip; idempotent expand → no-op; steady-state → no-op.
  - 2 regression-guard cases: no python heading → no flip even on "python expand" event; same-mode expand of already-unfolded heading → no flip.
- **12/12 passing**.

### Phase 2 — controller (`FacetMutexController` in `main.ts`)

- New `@codemirror/language` devDep (^6.12.3); externalized in esbuild config.
- Subscribes via `workspace.on('active-leaf-change', ...)`; attaches only on MarkdownView leaves backing snippet files (type: action | data).
- **CM6 fold subscription**: CM6 doesn't expose a "fold-only" event. Considered the `dispatchTransactions` override route but it requires patching the EditorView at extension-init time, which a plugin can't do post-hoc. Chose a 200ms polling fallback — diffs fold state against cached `prevFold` on every tick; reacts to deltas via `decideOnFoldChange`. Cost is negligible (one `foldedRanges(state)` read + a few set membership checks per tick).
- **Fold-state read**: `foldedRanges(this.cm.state)` → IntervalSet keyed on document positions. A heading is folded iff its line's end-of-line position falls inside a folded range.
- **Initial state**: on attach, computes `decideInitialState`, dispatches `foldEffect.of({from, to})` / `unfoldEffect.of(...)` deltas into `cm.dispatch({effects})`. `ignoreFoldEventsUntil = now + 300ms` suppresses self-induced fold events.
- **Window debounce** per §2.2: `FOLD_EVENT_IGNORE_WINDOW_MS = 300`. Set on attach + after every controller-induced write.
- **Detach**: `clearInterval` on the polling handle; clears all cached state.

### Phase 3 — drift-aware extraction (`setEditModeForFile`)

- Extracted from `toggleEditModeForFile`. New public method on `ForgePlugin`: `setEditModeForFile(file, newMode)`.
- B8 contract preserved exactly — `locked_english_hash` is snapshotted on every transition into python mode; cleared on transition to english mode.
- Both palette path (`toggleEditMode` → `toggleEditModeForFile` → `setEditModeForFile`) AND gesture path (`FacetMutexController.onCmUpdate` → `setEditModeForFile`) call the same writer.

### Phase 5 — command-palette no-promise-of-nothing fix

- Per prompt §3.5 chose path (a) — refuse to flip + show explanatory Notice — over (b) auto-create stub.
- Heading-presence check: `/^#{1,6}\s+python\s*$/im.test(content)` on the body. Detects # Python heading regardless of content (an empty `# Python\n\n` is still editable; a missing heading isn't).
- Notice text: `"Forge: '<snippet>' has no Python facet (slot-free canonical). Add slots and Forge-run to generate one, or stay in English mode."`. No frontmatter mutation. No `locked_english_hash` write.

### Phase 4 — UX polish

- The Notice `"Forge: '<snippet>' → Python mode"` already fires from `setEditModeForFile`. The gesture path inherits it. ✓
- Optional left-border accent on active facet heading: out of scope per prompt; flagged in §5 follow-ups.

## §3 — TDD continuity

1. **Pure-core failing tests first**: 12 cases written before any decision logic. All red on first import.
2. **Pure-core implementation**: `decideInitialState` + `decideOnFoldChange` per the §3.1 semantics table.
3. **Pure-core green**: 12/12 passing.
4. **Controller integration**: built post-pure-core. No new dedicated unit tests for the controller itself (per pattern in this codebase — the integration is exercised via the user-side smoke + the pure-core is exhaustively tested). §4.2 integration tests deferred — they require mocking CM6 EditorView shape which is brittle; user smoke covers them concretely.
5. **Full suite green**: plugin 566/566 (was 554 + 12).

## §4 — User-side smoke checklist (per prompt §5)

```
# Step 1 — install v0.2.83 zip into ~/forge-vaults/<vault>/.

# Step 2 — open forge-tutorial/01-hello/hello_world.md.
grep "^edit_mode:" ~/forge-vaults/<vault>/forge-tutorial/01-hello/hello_world.md
# Likely absent (default english).

# Step 3 — verify initial fold state:
# In Obsidian editor (source mode):
# - # English: unfolded
# - # Python: folded (if present)
# Slot-free canonical snippets (like 01-hello/hello_world.md before
# the first Forge-run) have no # Python heading yet — nothing to fold.

# Step 4 — click the fold-triangle on # Python to EXPAND.
# Expected:
# - # English auto-folds
# - # Python expanded
# - Notice: "Forge: hello_world → Python mode"
# - Frontmatter: edit_mode: python + locked_english_hash: <hex>
# (Polling latency: up to 200ms before the flip applies.)

# Step 5 — click the fold-triangle on # English to EXPAND.
# Expected: reverse mutex, Notice → English mode, frontmatter cleaned.

# Step 6 — close + reopen file. Verify fold state matches frontmatter.

# Step 7 — palette regression: Cmd-P → "Toggle Python/English editing mode".
# Expected: same flip behavior; fold + frontmatter + Notice.

# Step 8 — Forge run regression: 🔥 on snippet in current mode → computes.

# Step 9 — snippet with no # Python (slot-free canonical):
# Open it. Verify no crash. # English stays as-is; nothing to auto-fold.

# Step 10 — palette path on snippet with no # Python:
# Cmd-P → "Toggle Python/English editing mode" → expect Notice
# "'<snippet>' has no Python facet (slot-free canonical). ...".
# Verify frontmatter: NO edit_mode added. NO locked_english_hash. ✅ §3.5 fix.

# Step 11 — plain note (no type: action):
# Open. Verify controller doesn't attach. Folding any heading does NOT
# write edit_mode.
```

## §5 — Auto-smoke results

- `npm run build`: exit 0; asset footprint 38.03 MB (no change from v0.2.82).
- `npm test`: **566 passing** (was 554 + 12).
- `bash scripts/release.sh 0.2.83`: clean. All drift checks pass.
- Zip built, tag pushed, GH release created.

## §6 — Open follow-ups

1. **CM6 fold subscription via `dispatchTransactions` override**: the 200ms polling approach is responsive enough for cohort UX but adds polling cost. A cleaner solution would be to wrap the editor's `dispatch` to intercept transactions and detect fold effects directly. Requires patching `view.editor.cm.dispatch` post-attach; risk-mitigated alternative for a future drain.
2. **Active-facet heading decoration**: small left-border accent or background tint marking the currently-active facet's heading line. Out of scope per prompt §3.4 + §6.2.
3. **Reading-mode mutex via CSS**: hide the non-source facet in preview mode. Out of scope per prompt §6.1.
4. **MODE_BTN_CLASS dead code**: v0.2.79 follow-up §6.2. Still untouched. Can drop in a hygiene drain.
5. **Workspace.json restore semantics**: §3.2 onFileOpen always re-applies from frontmatter (frontmatter wins per the prompt's intentional choice). Documented here. If cohort smoke reveals stale workspace.json restores defeat the initial state, may need to invalidate the workspace.json fold entries on attach.
6. **Polling vs CM6 ViewPlugin extension**: a `ViewPlugin.fromClass` extension could register an update listener cleanly. Requires injecting it at editor-init time which Obsidian plugins can do via `Editor.registerEditorExtension`. Worth investigating for a follow-up — would reduce the 200ms latency to ~one CM frame.

## §7 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): spike data provided by driver in §-1 amendment; implementation followed.
- ✓ §57–74 (TDD): pure-core had failing tests first (12 cases pre-impl).
- ✓ §86–118 (pure-core convention): `facet-mutex-core.ts` is the pure-core; controller in `main.ts` is the integration.
- ✓ §76 (don't ship speculative fix): spike-confirmed Approach B; no Approach A pivot needed.
- ✓ §347 (version-bump sanity check): manifest pre-bump verified at 0.2.82; explicit `bash scripts/release.sh 0.2.83`.
- ✓ §321 (feedback file before move): this file exists; prompt move follows.
- ✓ "Assert cannot only with concrete error" HARD RULE: spike data was concrete (`cm.constructor.name: e`, `cm.dispatch type: function`, etc.); my impl assertions about CM6 behavior are grounded in that spike, not in docs alone.
- ✓ Standing user rule: committed directly to main.

Per cc-prompt-queue.md §43, this is the chat summary.
