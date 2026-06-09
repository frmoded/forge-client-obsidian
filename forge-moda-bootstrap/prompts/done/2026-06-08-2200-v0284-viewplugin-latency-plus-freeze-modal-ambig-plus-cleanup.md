---
timestamp: 2026-06-08T22:00:00Z
session_id: drain-2026-06-08-2200
status: pending
priority: HIGH — cohort UX impact (Item A is user-perceptible)
---

# v0.2.84 — ViewPlugin latency fix + freeze modal ambiguity + MODE_BTN_CLASS cleanup

## §0 — Context

Three items from polish backlog bundled by independence — all touch separate surfaces; can be implemented in any order or in parallel.

- **Item A** (user-perceptible, primary): replace v0.2.83's 200ms setInterval polling in `FacetMutexController` with a CM6 ViewPlugin.fromClass extension. Reduces gesture-flip latency from up to 200ms to one CM frame (~16ms).
- **Item B** (cohort UX defense): freeze modal ambiguity disambiguation via the existing `decideWikilinkFreezeMenu` helper. When `find_qualified_by_bare` resolves a bare id to multiple matches (e.g., `[[chorus]]` exists in both `forge-music/blues/` and `forge-music/jazz/`), prompt user to pick instead of silent first-match.
- **Item C** (hygiene): delete `MODE_BTN_CLASS` dead CSS class. With v0.2.83's gestural mutex shipped, the v0.2.79 ribbon-button-restoration option is permanently off the table.

All three are V1-scoped. None alter V2 architectural direction.

## §1 — Goals

### §1.1 — Item A goal

`FacetMutexController` currently polls fold state at 200ms intervals (`setInterval` + `foldedRanges(state)` reads + diff against `prevFold`). Replace with a CM6 `ViewPlugin.fromClass` extension registered via `this.registerEditorExtension(...)` that fires synchronously on every `ViewUpdate`.

Effect: gesture flip becomes ~one CM frame instead of "click-wait-200ms-flip." User-perceptible.

Functional behavior (decideOnFoldChange semantics) UNCHANGED. B8 contract UNCHANGED. The pure-core `facet-mutex-core.ts` and `setEditModeForFile` extraction UNCHANGED.

### §1.2 — Item B goal

When `find_qualified_by_bare(bare_id)` resolves to multiple qualified snippet ids (e.g., `chorus` matches both `forge-music/blues/chorus` AND `forge-music/jazz/chorus`):
1. Engine returns ALL matches (currently returns only first per A4 walking contract).
2. Plugin's freeze handler detects multi-match.
3. Opens existing `decideWikilinkFreezeMenu` modal with the choices.
4. User picks; freeze proceeds with chosen target.
5. Single-match path UNCHANGED — no modal fires.

### §1.3 — Item C goal

Delete `MODE_BTN_CLASS` symbol + any orphan CSS rules that reference it.

## §2 — Investigation phase (MANDATORY per §78)

### §2.1 — Item A: CM6 ViewPlugin.fromClass + registerEditorExtension contract

Verify in current codebase:
- `main.ts` already uses `this.registerEditorExtension([sectionPlugin, readOnlyFacetFilter])` at line ~270. Pattern is established.
- `ViewPlugin.fromClass(class { update(u: ViewUpdate) {...} })` is the CM6 idiom for per-view state with update listeners.
- `ViewUpdate.transactions` contains the fold-effect transactions when user clicks fold-triangle or programmatic `cm.dispatch(foldEffect.of(...))` fires.
- `update.docChanged` indicates body edits (not fold-only); `update.viewportChanged` is scrolling; we want updates where `transactions` contain `foldEffect` markers.

The challenge: per-leaf ViewPlugin instances need to route fold-state-change events back to the per-plugin `FacetMutexController` singleton (which owns the `setEditModeForFile` write path + the `ignoreFoldEventsUntil` debounce + the `_seenBakDirsThisSession` style state).

### §2.2 — Item A: bridging pattern

Two options:
- **(a) WeakMap routing**: `FacetMutexController` exposes a `WeakMap<EditorView, ViewState>` keyed by EditorView. The ViewPlugin closes over a reference to the controller + its own EditorView and looks up shared state.
- **(b) ViewPlugin holds its own state**: ViewPlugin instance owns `prevFold`, `ignoreFoldEventsUntil` etc. per-view. The controller becomes a thin registry that just dispatches `setEditModeForFile` writes.

Option (b) is cleaner per CM6 idiom (per-view state lives in per-view plugin). Recommend (b). The controller's role shrinks to "register the extension + provide the write callback."

### §2.3 — Item A: race condition with attach/detach

v0.2.83's controller has `attach(view)` / `detach()` semantics keyed on `active-leaf-change`. ViewPlugin extensions, however, live for the lifetime of the EditorView (which Obsidian creates/destroys based on its own logic, not necessarily on leaf change).

Investigate:
- Does Obsidian destroy + recreate the EditorView on every file open? Or reuse across files?
- If reuse: the ViewPlugin sees a fresh `viewState` but same instance — need to read frontmatter on every file-open via a separate hook.
- If destroy: the ViewPlugin instance is fresh per file; no state leaks.

If unsure from code-reading, run a small spike: log when ViewPlugin instances are created vs destroyed across file opens. Don't ship speculative code per §76.

### §2.4 — Item A: removing v0.2.83's polling

After ViewPlugin extension lands:
- Remove `setInterval` registration from FacetMutexController.
- Remove the `prevFold` caching on the controller (now per-view via ViewPlugin).
- Remove the 200ms polling-related code.

Verify nothing else in the codebase polls fold state.

### §2.5 — Item B: engine return-shape change

`find_qualified_by_bare(bare_id)` currently returns `Optional[str]` (the qualified snippet_id, or None). Need to change to return `List[str]` (all matches, possibly empty).

This is a breaking change to the function signature. Audit ALL callers:
- `pyodide-host.ts:_forge_qualify_snippet_id` (v0.2.78 — switches to `find_qualified_by_bare`).
- Any other caller? `grep -r "find_qualified_by_bare"` in both `forge/` and `forge-client-obsidian/`.

Backward-compat path: rename the existing function to `find_qualified_by_bare_first` (preserves old behavior) and add new `find_qualified_by_bare_all` (returns all). The freeze handler uses `_all`; existing callers stay on `_first` until migrated. Avoids breaking changes in one commit.

OR: change the signature + update all callers in the same commit. Simpler if there's only 1-2 callers.

Investigate first to choose path.

### §2.6 — Item B: existing decideWikilinkFreezeMenu

`grep -r "decideWikilinkFreezeMenu" src/` to find the existing helper. Verify its signature:
- What does it take as input (list of candidate paths/ids)?
- What does it return (chosen target, or undefined if cancelled)?
- Is it async (Promise-returning) or callback-based?

The freeze handler's new code path is: if `_all` returns >1 match → await modal → use chosen target.

### §2.7 — Item C: MODE_BTN_CLASS audit

`grep -rn "MODE_BTN_CLASS" src/ styles.css` to find all references. Delete:
- The class declaration.
- Any CSS rules targeting the class.
- Any JS that adds/removes the class.

Confirm no other code depends on the class name being present (e.g., third-party themes — unlikely but worth checking).

## §3 — Implementation phases

### §3.1 — Phase 1: Item A — ViewPlugin extension

`src/facet-mutex-view-plugin.ts` (new module):
```typescript
import { ViewPlugin, ViewUpdate, EditorView } from '@codemirror/view';
import { foldedRanges } from '@codemirror/language';
import { decideOnFoldChange, FoldState } from './facet-mutex-core';
// ... pure-core import

export function makeFacetMutexViewPlugin(getController: () => ForgePlugin) {
  return ViewPlugin.fromClass(class {
    prevFold: FoldState = { englishFolded: false, pythonFolded: false };
    ignoreFoldEventsUntil = 0;
    view: EditorView;

    constructor(view: EditorView) {
      this.view = view;
      // initial fold state read after a microtask (Obsidian needs the view ready)
      queueMicrotask(() => this.syncInitialState());
    }

    update(u: ViewUpdate) {
      if (!u.docChanged && u.transactions.length === 0) return;
      // Detect fold-effect transactions...
      const newFold = this.readFoldState();
      if (Date.now() < this.ignoreFoldEventsUntil) {
        this.prevFold = newFold;
        return;
      }
      // Compute desired state via pure-core
      const decision = decideOnFoldChange(this.prevFold, newFold, /* edit_mode from controller */, /* headings */);
      if (decision.newEditMode) {
        getController().setEditModeForFile(/* file */, decision.newEditMode);
        this.ignoreFoldEventsUntil = Date.now() + 300;
      }
      // Apply fold delta if needed
      // ...
      this.prevFold = newFold;
    }

    syncInitialState() { /* per §3.2 v0.2.83 logic */ }
    readFoldState(): FoldState { /* foldedRanges(this.view.state) */ }
  });
}
```

(Shape sketched; CC fleshes out per §2 investigation.)

`main.ts`:
- Remove `FacetMutexController.setInterval` polling code.
- Add `this.registerEditorExtension([makeFacetMutexViewPlugin(() => this)])` in `onload()`.
- Keep the `setEditModeForFile` write path + the `forge-toggle-edit-mode` palette command intact.

### §3.2 — Phase 2: Item B — engine + plugin

Engine (`forge/core/snippet_registry.py`):
- Add `find_qualified_by_bare_all(bare_id) -> List[str]`. Returns all matches in resolution order (existing per-vault iteration).
- Keep existing `find_qualified_by_bare(bare_id) -> Optional[str]` as a thin wrapper that returns `_all(bare_id)[0]` or None. Backward compatible.

Engine tests (`tests/core/test_find_qualified_by_bare_ambiguity.py`):
1. Single match → `_all` returns 1-element list.
2. No match → empty list.
3. Multiple matches → returns all in resolution order.
4. Existing `_first` wrapper still works (regression).
5. Library-only matches → handled.

Plugin (`src/freeze-handler.ts` or wherever freeze handler lives — find via grep):
- On freeze invocation: call `_all(bare_id)`.
- If `len == 0`: existing error path (snippet not found).
- If `len == 1`: existing freeze path with that target.
- If `len > 1`: open `decideWikilinkFreezeMenu` with the list. Use chosen target.

Plugin tests:
1. Freeze on unambiguous wikilink: existing path, no modal.
2. Freeze on ambiguous wikilink: modal opens, user pick proceeds.
3. Modal cancelled: freeze aborted.

### §3.3 — Phase 3: Item C — MODE_BTN_CLASS cleanup

- Grep + delete the class declaration in main.ts (if any).
- Delete CSS rule(s) in styles.css.
- Delete any JS that adds/removes the class.

No tests needed; this is dead code removal. Verify build is clean + plugin smoke loads cleanly post-delete.

## §4 — Tests required summary

- Item A: pure-core (`facet-mutex-core.ts`) tests already cover decision logic. ViewPlugin integration not unit-testable (CM6 EditorView mocking is brittle per v0.2.83's pattern). Smoke covers it. Estimated 0-3 new tests.
- Item B: ~5 engine tests + ~3 plugin tests.
- Item C: 0 tests (dead code removal).

Total new tests: ~8-10. Existing suites must stay passing.

## §5 — User-side smoke checklist

```
# Step 1 — install v0.2.84 zip into ~/forge-vaults/<vault>/.

# === Item A: ViewPlugin latency smoke ===

# Step 2 — open forge-tutorial/01-hello/hello_world.md.
# Open DevTools console. Watch for any "Forge spike" leftover output —
# should be ZERO (spike code removed in v0.2.80 prep).

# Step 3 — for snippets with both # English AND # Python on disk:
# Click the fold-triangle on # Python to expand.
# Expected: # English auto-folds + Notice + frontmatter flip.
# CRITICAL: the flip should feel INSTANT — no ~200ms wait.
# Compare to v0.2.83 (polling): the flip was visibly delayed.

# Step 4 — flip back. Same instant feel.

# Step 5 — open multiple snippets in splits. Verify each split's
# ViewPlugin instance attaches independently; flipping in one
# does NOT affect the other.

# === Item B: freeze modal ambiguity smoke ===

# Step 6 — create an ambiguous wikilink scenario:
mkdir -p ~/forge-vaults/bluh/forge-music-test/blues ~/forge-vaults/bluh/forge-music-test/jazz
# Two chorus.md files in different subdirs of an authoring-vault library:
printf '%s\n' '---' 'type: action' 'inputs: []' '---' '' '# English' '' \
  'Blues chorus.' > ~/forge-vaults/bluh/forge-music-test/blues/chorus.md
printf '%s\n' '---' 'type: action' 'inputs: []' '---' '' '# English' '' \
  'Jazz chorus.' > ~/forge-vaults/bluh/forge-music-test/jazz/chorus.md

# Create a snippet with a wikilink to [[chorus]]:
printf '%s\n' '---' 'type: action' 'inputs: []' '---' '' '# English' '' \
  '## Dependencies' '' '- [[chorus]]' > ~/forge-vaults/bluh/forge-music-test/song.md

# Reload Obsidian. Open song.md. Right-click on the [[chorus]] wikilink.
# Click "Forge: Freeze edge song → chorus".
# Expected: A modal opens listing BOTH chorus targets.
# Click on jazz/chorus.
# Expected: "Forge: frozen song → forge-music-test/jazz/chorus" toast.

# Step 7 — cleanup:
rm -rf ~/forge-vaults/bluh/forge-music-test

# === Item C: cleanup verification ===

# Step 8 — grep for MODE_BTN_CLASS in the installed plugin:
grep -c "MODE_BTN_CLASS" ~/forge-vaults/<vault>/.obsidian/plugins/forge-client-obsidian/main.js
# Expected: 0.
```

## §6 — Open follow-ups expected

1. **Item A integration tests**: still deferred per v0.2.83 pattern (CM6 EditorView mocking brittle). If cohort hits a flicker or missed-event, this becomes priority for the next drain.
2. **Item B per-vault ambiguity**: ambiguity within a single vault's library (e.g., `forge-music/blues/chorus` vs `forge-music/jazz/chorus`) is handled. Cross-vault ambiguity (e.g., `chorus` in both `forge-music` and `forge-moda`) is also handled via the same _all path.
3. **Item C is end-of-life for ribbon-button-restoration optionality.** Documented for retrospective.

## §7 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §2 mandates spike for ViewPlugin lifecycle if unclear from code-reading. Engine + plugin caller audits before signature change.
- ✓ §57–74 (TDD): Items A + B have failing-first tests; Item C is dead-code removal.
- ✓ §86–118 (pure-core convention): existing `facet-mutex-core.ts` pure-core untouched. ViewPlugin is the integration layer. Engine `find_qualified_by_bare_all` is pure.
- ✓ §76 (don't ship speculative fix): all three items have concrete user-facing or hygiene justifications.
- ✓ §347 (version-bump sanity check): manifest pre-bump verified at 0.2.83; explicit version arg.
- ✓ §321 (feedback file before move): standard.

## §8 — Architectural framing

All three items are V1-scoped. None touch V2 semantics (`source` field, gestural promote, EPython).

Item A is a pure refactor of v0.2.83's ship — same behavior, better latency. Worth shipping in V1 because cohort UX matters NOW; V2 will use a different architecture anyway and won't carry forward this work — but during the V1 → V2 transition window, polling-vs-ViewPlugin latency is user-visible.

Item B is forward-compatible with V2 (the freeze affordance survives V2; the disambiguation logic is V1 architecture but reusable for V2's snippet identity).

Item C is throw-away V2 (entire ribbon may be redesigned), but the cleanup cost is so small that "ship and move on" beats "defer."

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §9 — Hand-off

All three items independent. Suggested order:
1. Item C (10 min — gets it off the queue).
2. Item B (engine + plugin — well-bounded).
3. Item A (largest scope; needs §2 investigation discharge).

Or parallel if you prefer. Item A is most user-impactful; ship that even if B falls behind.
