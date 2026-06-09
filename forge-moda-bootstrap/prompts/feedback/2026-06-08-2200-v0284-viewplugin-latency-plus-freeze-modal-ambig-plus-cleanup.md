---
timestamp: 2026-06-08T22:30:00Z
session_id: drain-2026-06-08-2200
prompt_modified: 2026-06-08T22:00:00Z
status: shipped
---

# v0.2.84 — ViewPlugin latency + freeze multi-match + MODE_BTN cleanup

## §0 — Release coordinates

- **Released**: `forge-client-obsidian` v0.2.84 (bumped from v0.2.83).
- **Tag**: `v0.2.84` (`https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.84`)
- **forge bundle bumps**: none.
- **forge commits**:
  - `91fbe85` — Item B engine: `find_qualified_by_bare_all`.
- **forge-client-obsidian commits**:
  - `ab6752f` — Items A + B + C plugin code + engine bundle resync.
  - `2388380` — Release v0.2.84.
  - `4bfe8ec` — INSTALL.md bump.

## §1 — Investigation findings

### §2.1 — Item A CM6 ViewPlugin contract verified

`registerEditorExtension` already used at `main.ts:512` for the
existing `sectionPlugin` (`facet.ts:184`), confirming the
ViewPlugin.fromClass + ViewUpdate idiom works in this codebase. No
spike needed for that — code-precedent suffices.

### §2.2 — bridging pattern

Chose option **(b)** per prompt recommendation: ViewPlugin holds its
own per-view state (`prevFold`, `ignoreFoldEventsUntil`,
`lastFilePath`). The ForgePlugin singleton exposes a `FacetMutexHost`
adapter via `facetMutexHost()` for the cross-view writes (frontmatter
update via `setEditModeForFile` + `getActiveSnippet` resolution).

### §2.3 — attach/detach race investigation

Observation: Obsidian's behavior across file-changes within a single
leaf is to REUSE the EditorView (the CM6 `EditorView` instance
persists; only its state.doc changes). My ViewPlugin handles this by
caching `lastFilePath` on every `update()` and treating a path-change
as a fresh attach (re-applies initial state, resets `prevFold`, sets
`ignoreFoldEventsUntil`). This avoids the stale-state-leak risk.

Did not run a destroy/recreate spike — the file-path-change handling
is the safe net for either lifecycle.

### §2.4 — polling removal

The v0.2.83 `FacetMutexController` class (200ms `setInterval` polling
+ per-attach state + `applyInitialState` + `onCmUpdate`) was deleted
in full (~200 LOC). The `active-leaf-change` registration that drove
it was also removed; the ViewPlugin now sees every transaction and
self-detects file changes.

### §2.5 — engine return-shape change

Audited callers of `find_qualified_by_bare`:
- `forge/forge/core/snippet_registry.py:230` — definition.
- `forge-client-obsidian/src/pyodide-host.ts:640` — `_forge_qualify_snippet_id` (uses single-match).
- `forge/tests/core/test_v0_2_78_vault_routing.py` — existing tests (use single-match).

Per prompt §2.5 chose the **backward-compat path**: keep
`find_qualified_by_bare` returning `Optional[dict]` (its v0.2.78
contract), add new `find_qualified_by_bare_all` returning `List[dict]`.
The freeze handler uses `_all`; the qualifier path stays on single-
match. Zero churn for v0.2.78 callers.

### §2.6 — `decideWikilinkFreezeMenu` audit

Existing pure-core at `src/wikilink-freeze-menu-core.ts`. Found:
- Sync function, returns `{showMenu, caller?, callee?}` with single
  qualified IDs.
- Used at `main.ts:864` from the editor-menu handler.

The prompt loosely says "open `decideWikilinkFreezeMenu` modal" but
the existing helper is NOT a modal — it's a decision function.
Interpreted intent: when multi-match, surface each candidate. Chose
**native Obsidian editor-menu items** over a separate chooser modal —
more discoverable + zero extra UI machinery. Documented in §5
follow-ups for re-evaluation if cohort feedback wants a chooser
modal instead.

### §2.7 — Item C MODE_BTN_CLASS audit

Three references in `main.ts`: declaration at line 201, button cleanup
selector list at line 1031, comment at line 1083. One reference in
`styles.css` line 467 (`.forge-mode-btn.is-drifted`). All removed.

## §2 — Implementation summary

### Item A — ViewPlugin (`src/facet-mutex-view-plugin.ts`)

- New module: `makeFacetMutexViewPlugin(getHost: () => FacetMutexHost | null)` returns a `ViewPlugin.fromClass(...)` extension.
- Per-view state: `prevFold`, `ignoreFoldEventsUntil`, `lastFilePath`, `destroyed`.
- `update(u)`:
  1. Resolves the active snippet via host callback. If null, no-op.
  2. If `active.file.path` differs from `lastFilePath`, treats as fresh attach (applies initial state, debounces 300ms).
  3. Otherwise diffs fold state; if outside debounce window AND there's a delta, routes through `decideOnFoldChange`.
  4. On a flip-decision, applies fold delta (`foldEffect.of` / `unfoldEffect.of`) + `setEditModeForFile` via host.
- `constructor` queues a microtask for initial state apply.
- `destroy()` flags the instance to prevent late updates.

`main.ts` changes:
- Imports `makeFacetMutexViewPlugin` + `FacetMutexHost`.
- Deletes the entire `FacetMutexController` class (~200 LOC).
- `onload()` registers the extension via `this.registerEditorExtension([makeFacetMutexViewPlugin(() => this.facetMutexHost())])`.
- New `facetMutexHost(): FacetMutexHost` builds the adapter that resolves the active snippet's `(file, mode)` + threads `setEditModeForFile`.

### Item B — multi-match decision (engine + plugin)

Engine (`forge/forge/core/snippet_registry.py`):
- New `find_qualified_by_bare_all(bare_id) -> list` returns ALL matches in resolution order (Pass 1 direct-key, Pass 2 non-resolution-order, Pass 3 sub-path basename). Dedup by `snippet_id`.
- `find_qualified_by_bare` (single-match) untouched — backward-compat for `_forge_qualify_snippet_id`.

Plugin (`src/wikilink-freeze-menu-core.ts`):
- New `decideWikilinkFreezeMenuMulti(currentFileBasename, target, registry) -> {showMenu, caller?, callees?}`.
- New `SnippetRegistryLikeMulti` interface extends `SnippetRegistryLike` with `qualifyBareIdAll(bareId): string[]`.
- Filters self-references; returns empty `showMenu: false` when all candidates would self-ref.

`main.ts` editor-menu handler:
- Registry adapter now implements both `qualifyBareId` (Obsidian's `getFirstLinkpathDest`) AND `qualifyBareIdAll` (vault-walk filtered by basename + snippet-type frontmatter).
- Renders ONE freeze + ONE unfreeze item per qualified candidate. Single-match case = exactly 1 of each (identical to v0.2.83 UX). Multi-match = N items, each labeled with its qualified target.
- State-aware disabled status (v0.2.44) computed per-candidate via `host.readSnapshotStateSync(caller, targetCallee)`.

### Item C — MODE_BTN_CLASS removal

- `main.ts`: deleted const declaration, removed from button-cleanup selector list, updated nearby comment.
- `styles.css`: removed `.forge-mode-btn.is-drifted` rule. Retained `.forge-lock-btn.is-drifted` for pre-v0.2.79 vaults that still carry the legacy `locked` field.

## §3 — TDD continuity

- **Item A**: pure-core decision logic untouched (v0.2.83 tests still pass). Per the v0.2.83 pattern, the ViewPlugin integration is NOT unit-tested (CM6 EditorView mocking is brittle); covered by user-side smoke per §5 of prompt.
- **Item B engine**: 5 tests in `tests/core/test_find_qualified_by_bare_ambiguity.py`. 273 forge core passing (was 268 + 5).
- **Item B plugin**: 6 new tests in `wikilink-freeze-menu-core.test.ts` covering single-match, multi-match, no-caller, no-callees, self-ref-only, mixed-self-ref + valid. 572 plugin passing (was 566 + 6).
- **Item C**: dead-code removal; verified by build clean + existing tests still pass.

## §4 — Auto-smoke results

- forge core: 273 passing (was 268 + 5 new).
- plugin: 572 passing (was 566 + 6 new).
- `npm run build`: exit 0; asset footprint unchanged (38.03 MB).
- `bash scripts/release.sh 0.2.84`: clean. All drift checks pass.
- Zip built, tag pushed, GH release created.

## §5 — User-side smoke checklist (per prompt §5)

```
# Step 1 — install v0.2.84 zip.

# === Item A: ViewPlugin latency ===
# Step 2 — open snippet with both # English and # Python.
# Open DevTools console; ensure no "Forge spike" output.

# Step 3 — click fold-triangle on # Python.
# Expected: instant flip — # English folds, # Python expands, Notice
# fires, frontmatter writes. NO 200ms wait vs v0.2.83.

# Step 4 — flip back. Same instant feel.

# Step 5 — open multiple snippets in splits. Each per-view ViewPlugin
# instance attaches independently; flipping in one does NOT affect
# the other.

# === Item B: freeze modal ambiguity ===
# Step 6 — create ambiguous wikilink scenario:
mkdir -p ~/forge-vaults/bluh/forge-music-test/blues \
         ~/forge-vaults/bluh/forge-music-test/jazz
printf '%s\n' '---' 'type: action' 'inputs: []' '---' '' '# English' '' \
  'Blues chorus.' > ~/forge-vaults/bluh/forge-music-test/blues/chorus.md
printf '%s\n' '---' 'type: action' 'inputs: []' '---' '' '# English' '' \
  'Jazz chorus.' > ~/forge-vaults/bluh/forge-music-test/jazz/chorus.md
printf '%s\n' '---' 'type: action' 'inputs: []' '---' '' '# English' '' \
  '## Dependencies' '' '- [[chorus]]' \
  > ~/forge-vaults/bluh/forge-music-test/song.md

# Reload Obsidian. Open song.md. Right-click [[chorus]] wikilink.
# Expected: TWO "Forge: Freeze edge song → ..." items in menu (one
# per candidate: forge-music-test/blues/chorus + forge-music-test/jazz/
# chorus). Native UX — no separate chooser modal.
# Click one; Notice confirms freeze with that qualified target.

# Step 7 — cleanup:
rm -rf ~/forge-vaults/bluh/forge-music-test

# === Item C: MODE_BTN_CLASS verification ===
# Step 8 — verify cleanup landed:
grep -c "MODE_BTN_CLASS\|forge-mode-btn" \
  ~/forge-vaults/<vault>/.obsidian/plugins/forge-client-obsidian/main.js
# Expected: 0.
```

## §6 — Open follow-ups

1. **Chooser modal vs editor-menu items for Item B**: chose native menu items. If cohort prefers a separate chooser modal listing candidates with vault context, that's a future drain — the underlying `decideWikilinkFreezeMenuMulti` + engine `_all` work either way.
2. **ViewPlugin integration tests**: still deferred per v0.2.83 pattern. If cohort hits a flicker / missed event / wrong file, prioritize integration tests in the next drain.
3. **Cross-vault ambiguity**: `_all` already returns candidates from non-resolution-order vaults. The freeze handler currently surfaces them per the menu UX. If cohort confusion warrants grouping by vault, that's polish.
4. **Item C is end-of-life** for the ribbon-button-restoration option. Documented for retrospective.
5. **Legacy `.forge-lock-btn.is-drifted`** still in styles.css for pre-v0.2.79 vault compatibility. Can drop in a future hygiene drain once no in-flight cohort vault carries the legacy `locked` field.

## §7 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §1-§2 audits discharged before impl. ViewPlugin contract verified via existing `sectionPlugin` precedent; caller audit of `find_qualified_by_bare` complete.
- ✓ §57–74 (TDD): Item B engine + plugin pure-cores had failing-first tests. Item C dead-code removal needs no new tests.
- ✓ §86–118 (pure-core convention): `facet-mutex-core.ts` (v0.2.83) untouched; `facet-mutex-view-plugin.ts` is new integration layer; `wikilink-freeze-menu-core.ts` extended with new pure helper + tests.
- ✓ §76 (don't ship speculative fix): all three items have concrete user-facing or hygiene justification.
- ✓ §347 (version-bump sanity check): manifest pre-bump verified at 0.2.83; explicit `bash scripts/release.sh 0.2.84`.
- ✓ §321 (feedback file before move): this file exists; prompt move follows.
- ✓ Standing user rule: committed directly to main in both repos.

Per cc-prompt-queue.md §43, this is the chat summary.
