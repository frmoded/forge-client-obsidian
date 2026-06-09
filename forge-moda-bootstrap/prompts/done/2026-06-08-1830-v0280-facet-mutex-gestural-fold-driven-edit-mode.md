---
timestamp: 2026-06-08T18:30:00Z
session_id: drain-2026-06-08-1830
prompt_modified: 2026-06-08T20:30:00Z
status: ready-to-pick-up
priority: HIGH
---

# v0.2.80 — Facet-mutex gestural model (fold-driven edit_mode)

## §-1 — SPIKE RESULT (2026-06-08-2030): GREEN — Approach B authorized

The §2.7 spike has been run. CodeMirror 6 EditorView is fully reachable from plugin code via `view.editor.cm`. Empirical findings from active-leaf-change handler in a real Obsidian session:

```
cm.constructor.name: e   (minified EditorView class)
cm.dispatch type: function
cm.dispatchTransactions: present
cm.state keys: ['config', 'doc', 'selection', 'values', 'status', 'computeSlot']
cm.state.field type: function
cm.viewState type: object
cm: {plugins, pluginMap, editorAttrs, contentAttrs, bidiCache, destroyed,
     updateState, measureScheduled, measureRequests, contentDOM, scrollDOM,
     announceDOM, dom, dispatchTransactions, dispatch, _root, viewState,
     observer, inputState, docView}
view.editor.exec type: function   (Obsidian-level fallback also available)
```

These are exactly CM6's `EditorView` shape (just esbuild-minified). All required surfaces — `cm.dispatch`, `cm.state.field`, transaction-level fold effects — are reachable.

For non-markdown leaves (file-explorer, empty), `editor.cm` correctly returns undefined — controller can detach for those.

**Path forward**: ship full Approach B per the original spec (§3 below). Add `@codemirror/language` as plugin dependency, externalize via esbuild config (matching the pattern for `@codemirror/state` and `@codemirror/view`), pin to a version compatible with Obsidian's bundled CM6. Subscribe to fold-effect transactions via `cm.state.field(foldState)` reading or by intercepting transactions via `cm.dispatchTransactions` (CC chooses based on §2 amended below).

**§8 (Pivot to Approach A) is DROPPED.** Spike confirms Approach B is feasible.

The spike code has been removed from `main.ts` (forge-core in chat did the cleanup). CC starts from clean source.

**User-driven priority escalation (earlier today)**: v0.2.79 smoke Step 5 surfaced UX bug — command-palette toggle promises "Python is now editable" when no `# Python` content exists. The gestural-mutex model is the structural fix — you can only expand a heading that exists. This drain is TOP PRIORITY (per user 2026-06-08-1930).

**Added scope (this revision):** harden the command-palette path to NOT promise editability of non-existent content. If a snippet has no `# Python` heading on disk and user runs the palette toggle, EITHER (a) no-op with explanatory Notice OR (b) create an empty `# Python` heading the user can fill in. Bias toward (a) — don't auto-create content that may stale-cache later. See §3.5 below.

## §0 — Context

This drain brings the V2 gestural model PARTWAY forward into V1. V2 commits to retiring `edit_mode` for a `source: english | epython` field where the two facets are mutually exclusive at the source-of-truth level. Full V2 work is held pending cohort evidence.

V1 INTERIM: keep B8's `edit_mode` field as semantic source of truth, but make the **fold-state gesture** the user-facing mode toggle. User expands `# Python` heading → edit_mode flips to python (and `# English` auto-folds). User expands `# English` heading → edit_mode flips to english (and `# Python` auto-folds). Mutually exclusive at the presentation level.

After v0.2.79 removed the edit-mode ribbon button, the only remaining user-facing toggle is the command palette (`Forge: Toggle Python/English editing mode`) + the file-menu right-click entry. This drain ADDS a third path: **direct fold-gesture on the heading**. The command palette path remains intact as a power-user fallback.

This is brainstorm-driven (the user explicitly chose Approach B over A in the v0.2.79 follow-up discussion). The user said "we need to move fast" — ship a workable V1.5 gestural model that brings the V2 feel forward without committing to V2's semantic shift.

## §1 — Goal

Open a snippet (`type: action` or `type: data`). Read `edit_mode` frontmatter. Auto-fold the non-source heading. Subscribe to fold-change events on `# English` and `# Python` headings. When user expands the currently-folded heading, write the corresponding `edit_mode` value to frontmatter and auto-fold the other heading.

Maintain B8 contract: `locked_english_hash` drift detection unchanged; existing `toggleEditModeForFile` semantics unchanged (just called from a new event source).

## §2 — Investigation phase (MANDATORY per §78)

The fold-state hypothesis has multiple risks. Discharge these before designing:

### §2.1 — Obsidian fold-API surface

Verify what's available in current Obsidian (1.x). Read enough of the Obsidian docs / API typings / community plugin references to confirm:

- `MarkdownView` exposes the editor → CodeMirror 6 instance.
- CodeMirror 6 has `EditorState.field(foldState)` (from `@codemirror/language`) to read which lines are folded.
- There's a way to subscribe to fold-state changes (e.g., listen to transactions that include `foldEffect.of(...)`).
- There's a way to PROGRAMMATICALLY fold/unfold a heading line via `foldEffect.of({from, to})` or equivalent.
- The Headings panel's fold-icon clicks dispatch the same `foldEffect`, so we can react to them without distinguishing UI source.

If any of the above is NOT available in the Obsidian version cohort users will run, REPORT this in feedback and PIVOT to Approach A fallback (auto-fold non-source on open; no gesture-driven flip).

### §2.2 — Distinguishing user gesture from system restore

When Obsidian opens a file, fold state may be restored from `workspace.json`. We must NOT interpret a restored fold-state as a user-gesture flip — otherwise opening a snippet with stale workspace.json could silently flip `edit_mode` in frontmatter.

Investigate whether:
- `MarkdownView.onLoadFile` fires BEFORE fold-restoration, with a quiet period afterwards where we can apply our own desired fold state.
- We can use a "ready" flag: don't react to fold events for the first N ms after `onLoadFile`.
- Fold-restoration from workspace.json comes through a different transaction marker than user-clicked fold (unlikely but worth checking).

The simplest reliable mechanism: **timestamp-based debounce**. On `onLoadFile`, set a flag `IGNORE_FOLD_EVENTS_UNTIL = now + 300ms`. During this window, suppress reactions. After the window, treat all fold events as user gestures.

If this mechanism is unreliable in practice, REPORT and PIVOT.

### §2.3 — Frontmatter write loop risk

Writing `edit_mode` to frontmatter triggers `vault.on('modify')`. If the modify-handler re-renders the editor view, the editor may re-fold per workspace.json, which may fire another fold event, which may try to write frontmatter again. Loop.

Mitigation: use `app.fileManager.processFrontMatter(file, fn)` which is the canonical Obsidian-safe API. Confirm it does NOT trigger a re-render of the editor view that would invalidate fold state. If it does, we'll need a "suppress reactions during write" flag.

### §2.4 — Snippets without both headings

Some snippets may have only `# English` (canonical, never edited as python) or only `# Python` (transpilation cache absent because slot-free; first run computes it). Don't fold what isn't there. Don't write `edit_mode` if the user can't actually flip — i.e., if only `# English` exists, expanding it does nothing meaningful.

Investigation: walk current snippet samples, count distribution of `# English`-only vs both. If the "both" case is the dominant authoring shape, focus the work there. If "English-only" is dominant, the gestural value is lower (most snippets won't have a `# Python` to expand-to-flip-to-python).

### §2.5 — Reading mode (preview)

Reading mode shows everything by default; fold state doesn't apply. Should we hide the non-source facet via CSS? **NO for v0.2.80**: scope to edit mode only. Preview view shows both for now. Documentation note in the spec is sufficient.

### §2.6 — Heading-folding feature toggle

Obsidian users can disable "Show fold indicators" or disable heading folding entirely (Settings → Editor → Fold heading). If the user has folding disabled, this gesture is unavailable. **Graceful fallback**: if heading folding is disabled, no-op the auto-fold-on-open; the command palette path still works.

### §2.7 — Empirical Obsidian API verification

Before any pure-core design, write a TIMEBOXED 30-min spike: a minimal plugin that listens for fold events on the current note and logs them to console. Verify that:

- User clicking the fold-triangle on `# Python` generates a detectable event.
- Programmatic `foldEffect.of({from, to})` works.
- The events are distinguishable enough to drive Approach B.

If the spike reveals fold-state API is unsuitable or unreliable, REPORT findings + RECOMMEND Approach A as the v0.2.80 alternative. Approach A is: auto-fold non-source heading on snippet open; no gesture-driven flip. Pure visual aid; ~30 LOC; very low risk; delivers 80% of the V2 feel.

The user has explicitly endorsed pivoting to Approach A if Approach B is infeasible — "if needed we can refine post."

## §3 — Implementation phases (if Approach B is feasible per §2)

### §3.1 — Phase 1 (pure-core)

`src/facet-mutex-core.ts`:

```typescript
interface SnippetHeadings {
  englishLine: number | null;     // 1-based line of # English heading, or null
  pythonLine: number | null;      // 1-based line of # Python heading, or null
}

interface FoldState {
  englishFolded: boolean;
  pythonFolded: boolean;
}

interface DesiredState {
  englishFolded: boolean;
  pythonFolded: boolean;
  newEditMode: 'english' | 'python' | null;  // null = no frontmatter update needed
}

// Called on file open. Read frontmatter, decide initial fold state.
export function decideInitialState(
  editMode: 'english' | 'python',
  headings: SnippetHeadings,
): DesiredState;

// Called on fold-event. Decide whether to update edit_mode + fold state.
export function decideOnFoldChange(
  prevFold: FoldState,
  newFold: FoldState,
  currentEditMode: 'english' | 'python',
  headings: SnippetHeadings,
): DesiredState;
```

Semantics:
- `decideInitialState(english, both-exist)` → `{englishFolded: false, pythonFolded: true, newEditMode: null}`.
- `decideInitialState(python, both-exist)` → `{englishFolded: true, pythonFolded: false, newEditMode: null}`.
- `decideInitialState(english, only-english)` → `{englishFolded: false, pythonFolded: false, newEditMode: null}` (nothing to fold).
- `decideOnFoldChange(prev={F,T}, new={F,F}, english, both)` → user unfolded Python while English open. Desired: `{englishFolded: true, pythonFolded: false, newEditMode: 'python'}`. (Mutex: fold the other, flip edit_mode.)
- `decideOnFoldChange(prev={T,F}, new={F,F}, python, both)` → user unfolded English while Python open. Desired: `{englishFolded: false, pythonFolded: true, newEditMode: 'english'}`.
- `decideOnFoldChange(prev={F,T}, new={T,T}, english, both)` → user collapsed English. Stay: `{englishFolded: true, pythonFolded: true, newEditMode: null}` (no flip needed; user just collapsed everything).

Note: the mutex flip fires when EXPANDING the currently-folded heading. Collapsing the currently-unfolded heading is a no-op for `edit_mode`.

### §3.2 — Phase 2 (integration in main.ts)

Add to `FacetMutexController` (new class):
- Constructor: takes `App`, `Plugin`.
- `attach(view: MarkdownView)`: bind to the view's editor; subscribe to fold-effect transactions; tracks a fold-state cache + `ignoreFoldEventsUntil: number` timestamp.
- `onFileOpen(view, file)`: read frontmatter `edit_mode`, parse headings via `metadataCache`, call `decideInitialState`, apply via `foldEffect.of(...)`. Set `ignoreFoldEventsUntil = now + 300ms`.
- `onFoldChange(view)`: if `now < ignoreFoldEventsUntil`, return. Otherwise compute desired state, apply fold delta + write `edit_mode` via `app.fileManager.processFrontMatter(...)`.
- `detach()`: unsubscribe.

Wire from `WorkspaceLeaf` events: `workspace.on('active-leaf-change', ...)` → if leaf is a MarkdownView on an action/data snippet, attach controller; else detach.

Skip if `type` frontmatter is not `action` or `data` (use existing `isSnippetFile` helper).

### §3.3 — Phase 3 (drift snapshot)

`toggleEditMode` currently handles `locked_english_hash` drift snapshotting. Our `decideOnFoldChange`-triggered frontmatter write must call the same drift-aware helper, NOT just `processFrontMatter` directly.

Concrete: extract `toggleEditModeForFile` semantics into a `setEditModeForFile(file, newMode)` core that BOTH the command palette path AND the new fold-gesture path call. Maintains B8 contract.

### §3.4 — Phase 4 (UX polish)

- On fold-driven flip, show a brief Notice: `Forge: hello_world → Python mode` (mirrors command palette path). Helps the user understand the gesture had a side effect.
- Optional: a small heading-line decoration (CSS class) marking the active facet visually (e.g. a left-border accent). Out of scope for v0.2.80; flag in follow-ups.

### §3.5 — Phase 5 (command-palette no-promise-of-nothing fix)

ADDED per the priority-escalation (§-1). The command palette toggle MUST NOT claim "Python is now editable" when there's no `# Python` content on disk.

Concretely, in `setEditModeForFile(file, newMode)`:
1. Parse the snippet's body (via `metadataCache`) to detect whether the heading for `newMode` exists.
2. If `newMode === 'python'` AND no `# Python` heading is present on disk:
   - **(a) Preferred path**: no-op. Show Notice: `Forge: '<snippet>' has no Python facet (slot-free canonical). Add slots and Forge-run to generate one, or stay in English mode.` Do NOT flip frontmatter. Do NOT add `locked_english_hash`.
   - **(b) Alternative**: create an empty `# Python\n\n` heading at the end of the body + flip frontmatter normally. Less preferred — creates user-editable content that may stale-cache if the user types into it.
3. If `newMode === 'english'` AND no `# English` heading is present: this should never happen (every snippet has English source-of-truth). If it does, log a warning + no-op.
4. The gestural path (§3.2 `onFoldChange`) naturally avoids this case because you can't expand a heading that doesn't exist. But the palette path needs the explicit guard.

Choose (a) unless §2 investigation surfaces a reason to prefer (b). Document the choice in feedback §6.

## §4 — Tests required

### §4.1 — Pure-core tests (target: 100% coverage of `facet-mutex-core.ts`)

Each `decide*` function exhaustively tested:
1. `decideInitialState`: english + both headings → fold python only.
2. `decideInitialState`: python + both headings → fold english only.
3. `decideInitialState`: english + only-english heading → no folds, no edit_mode change.
4. `decideInitialState`: python + only-python heading → no folds.
5. `decideInitialState`: english + neither heading → no folds (graceful no-op).
6. `decideOnFoldChange`: english mode, user expanded python → flip to python + fold english.
7. `decideOnFoldChange`: python mode, user expanded english → flip to english + fold python.
8. `decideOnFoldChange`: english mode, user collapsed english (both now folded) → no flip.
9. `decideOnFoldChange`: english mode, user expanded already-unfolded english → no-op (idempotent).
10. `decideOnFoldChange`: state already matches edit_mode → no-op.

### §4.2 — Integration tests (plugin-level)

Test in `src/main.test.ts` (or a new `facet-mutex.test.ts` if cleaner):
1. Open a snippet with `edit_mode: english` → `# Python` heading is folded; `# English` unfolded. (Mocked editor.)
2. Open with `edit_mode: python` → opposite.
3. Programmatically dispatch a fold-effect simulating user expanding `# Python` after debounce window → `processFrontMatter` is called with `edit_mode: python`.
4. Dispatch fold-effect during the debounce window (within 300ms of `onLoadFile`) → `processFrontMatter` is NOT called.
5. Flip + verify `locked_english_hash` field is updated correctly (B8 contract).

### §4.3 — Regression guards

Command palette `Forge: Toggle Python/English editing mode` still works on a snippet that has been opened (i.e., FacetMutexController is attached and listening). The frontmatter write from the palette path should not trigger a re-fold-event-loop. Verify by simulating both paths.

## §5 — User-side smoke checklist

Per §1 of prompt:

```
# Step 1 — install v0.2.80 + open a vault with extracted forge-tutorial.

# Step 2 — open forge-tutorial/01-hello/hello_world.md (action snippet).
# Verify frontmatter:
grep "^edit_mode:" ~/forge-vaults/<vault>/forge-tutorial/01-hello/hello_world.md
# If absent → defaults to english.

# Step 3 — verify initial fold state matches edit_mode:
# In Obsidian editor (source mode):
# - # English: unfolded (content visible)
# - # Python: folded (just the heading visible with fold marker)

# Step 4 — click the fold-triangle on # Python to EXPAND it.
# Expected:
# - # English auto-folds (content becomes hidden).
# - # Python now expanded (content visible).
# - Notice appears: "Forge: hello_world → Python mode"
# - Frontmatter: edit_mode: python now present + locked_english_hash: <hex>
grep "^edit_mode:\|^locked_english_hash:" ~/forge-vaults/<vault>/forge-tutorial/01-hello/hello_world.md
# Should show both fields.

# Step 5 — click the fold-triangle on # English to EXPAND it (going back).
# Expected:
# - # Python auto-folds.
# - Notice: "Forge: hello_world → English mode"
# - Frontmatter: edit_mode field removed (or = english), locked_english_hash removed.

# Step 6 — close and reopen the file. Verify fold state matches frontmatter.
# (Tests the on-open re-application.)

# Step 7 — command palette path regression:
# Cmd-P → "Toggle Python/English editing mode". Run.
# Expected: same flip behavior as the gesture (fold + frontmatter + Notice).
# Verify fold state matches new edit_mode after palette toggle.

# Step 8 — Forge run regression:
# Click 🔥 on the snippet in current edit_mode. Verify it computes correctly.
# (Confirms the gestural changes don't break engine routing.)

# Step 9 — Snippet without # Python heading (e.g., canonical slot-free snippet
# like forge-tutorial/01-hello/hello_world.md):
# Open it. Verify no crash; no auto-fold of nonexistent heading.

# Step 10 — Same slot-free snippet — verify §3.5 palette guard:
# Cmd-P → "Toggle Python/English editing mode". Run.
# Expected: Notice says: "Forge: 'hello_world' has no Python facet (slot-free
# canonical). Add slots and Forge-run to generate one, or stay in English mode."
# Verify frontmatter: NO edit_mode field added. NO locked_english_hash added.
# This is the Step 5 UX bug fix (no promise-of-nothing).
grep "^edit_mode:\|^locked_english_hash:" ~/forge-vaults/<vault>/forge-tutorial/01-hello/hello_world.md
# Should show no output (no fields added).

# Step 11 — Snippet outside snippet types (e.g., a plain note):
# Open it. Verify FacetMutexController doesn't attach; folding any heading does NOT
# write edit_mode frontmatter.
```

## §6 — Open follow-ups expected

1. **Reading-mode mutex via CSS**: hide the non-source facet in preview view. Out of scope for v0.2.80.
2. **Active-facet visual decoration**: left-border accent or background tint on the active facet's heading line. Out of scope.
3. **Fold-state persistence across sessions**: when user closes + reopens the vault, do we trust workspace.json's restored fold state, or always re-apply from frontmatter? §3.2's `onFileOpen` always re-applies from frontmatter (frontmatter wins). Document in feedback as an intentional choice (frontmatter is source of truth, not workspace.json).
4. **MODE_BTN_CLASS dead code**: v0.2.79 §6.2 follow-up — with the gestural model now committed in v0.2.80, the ribbon-button-restoration option is no longer in the plan. The dead CSS class can be removed here OR in a future hygiene drain.
5. **Pure-core duplication**: v0.2.79 §6.1 — TS/JS lint cores. Not in scope.

## §7 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §2 mandates a timeboxed 30-min spike BEFORE pure-core design. If spike fails, PIVOT to Approach A without writing speculative code.
- ✓ §57–74 (TDD): pure-core gets failing-first tests; integration tests cover both initial and event-driven paths.
- ✓ §86–118 (pure-core convention): `facet-mutex-core.ts` is the pure-core; controller in `main.ts` is the integration layer.
- ✓ §76 (don't ship speculative fix): only ship Approach B if §2 spike confirms feasibility. Approach A fallback path is explicit.
- ✓ §347 (version-bump sanity): manifest pre-bump at 0.2.79; explicit version arg.
- ✓ §321 (feedback file before move): standard.
- ✓ "Assert cannot only with concrete error" HARD RULE: §2 spike provides concrete API-shape evidence, not "the Obsidian docs say it should work."

## §8 — Pivot policy

If §2.7 spike reveals that fold-state API is unsuitable (events don't fire reliably, can't programmatically fold, can't distinguish user gesture from restore), DO NOT FORCE Approach B.

Instead, ship Approach A as v0.2.80:
- On snippet open, read `edit_mode`, programmatically fold the non-source heading via whatever API does work (even if it's a one-shot effect, no event subscription needed).
- No gesture-driven flip; user still uses command palette to flip `edit_mode`.
- Smoke is reduced to: Step 3 only; verify initial fold state matches frontmatter.
- Document the pivot decision in §6 of feedback with the concrete API limitations that drove the call.

User has pre-authorized: "If needed we can refine post. We need to move fast."

## §9 — Architectural framing for CC

This drain is V1.5 — the gestural mutex MODEL is V2-shaped, but the underlying SEMANTICS remain V1 (`edit_mode` field, `locked_english_hash` drift, two persistent facets in the file). V2 retires `edit_mode` for `source: english | epython` and commits to one-facet-on-disk via the gestural-promote model.

Do NOT implement V2-shaped semantics here (no source field renaming; no source-of-truth-on-disk changes; no promote machinery). The drain is ONLY a presentation-layer mutex with edit_mode as the persistent state.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §10 — Hand-off

Pickup with §2 investigation phase. Land the spike commit BEFORE the impl commit per §78. Report spike findings briefly in feedback even if Approach B succeeds — for the retrospective.
