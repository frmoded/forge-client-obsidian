---
timestamp: 2026-06-08T23:30:00Z
session_id: drain-2026-06-08-2330
status: pending
priority: HIGH — v0.2.84 regression; gestural mutex not working in cohort smoke
---

# v0.2.85 — Facet-mutex gesture flip not firing (v0.2.84 regression — investigate + fix)

## §0 — Bug report

**Driver smoke against v0.2.84 on bluh vault, 2026-06-08-2300:**

> Step 2 — open snippet with both `# English` and `# Python`. Click fold-triangle on `# Python` to expand. Expected: `# English` auto-folds, `# Python` expands, Notice fires, frontmatter writes.
> 
> Observed: **Expanding does not collapse python and vice versa.** The mutex behavior — clicking one heading's fold-triangle causing the OTHER to auto-fold — is not firing.

This regression appeared in v0.2.84's ViewPlugin migration (v0.2.84 replaced v0.2.83's 200ms `setInterval` polling with `Plugin.registerEditorExtension(makeFacetMutexViewPlugin(...))`).

Pure-core decision logic (`facet-mutex-core.ts`'s `decideInitialState` + `decideOnFoldChange`) is presumed correct — its 12 tests passed under v0.2.83 and are untouched in v0.2.84. The bug is somewhere in the controller integration layer:
- `src/facet-mutex-view-plugin.ts` (new in v0.2.84)
- `FacetMutexHost` adapter on `ForgePlugin` (the singleton callback bridge)
- The `update(u: ViewUpdate)` lifecycle inside the ViewPlugin

## §1 — Investigation phase (MANDATORY per §78)

Discharge these hypotheses BEFORE shipping a fix. Per "assert cannot only with concrete error" HARD RULE, each hypothesis needs concrete evidence before being ruled in/out.

### §1.1 — Hypothesis H1: foldedRanges read happens before user's fold action is committed

The `update(u)` handler reads `foldedRanges(this.view.state)` to derive `newFold: FoldState`. CM6 may fire `update()` BEFORE the fold transition is fully applied to the EditorState. If so, the read sees `prevFold` (the unfolded state) and the diff comes up empty → no decision → no flip.

**Check:** add temporary `console.log` inside `update()` showing `u.transactions` (each transaction's effects), the read `newFold`, and the cached `prevFold`. Verify on a real fold click whether `newFold` reflects the new fold state IN THE SAME update call or only the NEXT one.

### §1.2 — Hypothesis H2: ignoreFoldEventsUntil swallows the first user gesture

After file open, the constructor's `queueMicrotask(() => this.syncInitialState())` applies initial state + sets `ignoreFoldEventsUntil = Date.now() + 300`. If the user clicks a fold-triangle WITHIN 300ms of the file opening (common — students see the file render and immediately click), the gesture is debounced as "self-induced."

**Check:** log `Date.now()` vs `ignoreFoldEventsUntil` on every `update()` call. If the first user gesture falls inside the window, the debounce is the bug.

### §1.3 — Hypothesis H3: lastFilePath causes every update to re-attach

If `getActiveSnippet()` returns inconsistent file paths (e.g., due to focus changes between splits, or because the `MarkdownView.file` reference shifts), `lastFilePath` keeps changing on every update, treating each as a fresh attach. `prevFold` resets to `{F, F}` on every fresh attach, masking real fold deltas.

**Check:** log `active.file.path` vs cached `lastFilePath` on every update. Verify they match across updates for the same file.

### §1.4 — Hypothesis H4: fold-effect dispatch fires but range is wrong

The decision logic could return `{englishFolded: true, ...}` correctly, but the controller's `cm.dispatch({effects: [foldEffect.of({from, to})]})` could be using the wrong `from`/`to` positions. If `englishLine` is computed from a stale snapshot of the document, or if it's off by one (1-based vs 0-based line conversion), the fold effect targets the wrong range.

**Check:** log the `{from, to}` positions on every `foldEffect.of(...)` dispatch + correlate with the actual line positions of `# English` and `# Python` in the document.

### §1.5 — Hypothesis H5: decision logic returns null because headings detect wrong

`facet-mutex-core.ts`'s `decideOnFoldChange` requires `headings: SnippetHeadings` with `englishLine` + `pythonLine`. If the controller's headings detection runs against a stale or empty metadataCache, it returns `{englishLine: null, pythonLine: null}`. With `englishLine: null`, every decision is a no-op.

**Check:** log the `SnippetHeadings` object passed to `decideOnFoldChange` on every update. Verify both line numbers are non-null when the snippet has both headings on disk.

### §1.6 — Hypothesis H6: getActiveSnippet returns null on the relevant updates

The `FacetMutexHost.getActiveSnippet()` callback resolves the active snippet's file + edit_mode. If it returns null (e.g., `MarkdownView` not attached yet, frontmatter not parsed, or it's checking the wrong leaf), the update() handler no-ops at step 1.

**Check:** log the result of `getActiveSnippet()` on every `update()` call. Verify it returns non-null when a snippet is open.

### §1.7 — Cross-hypothesis spike approach

Add diagnostic logging to `src/facet-mutex-view-plugin.ts`'s `update()` method. Temporary block, clearly marked `// v0.2.85 SPIKE — REMOVE AFTER INVESTIGATION`. Log on every call:

```typescript
update(u: ViewUpdate) {
  const active = this.getHost()?.getActiveSnippet();
  console.log('Forge mutex spike:', {
    now: Date.now(),
    ignoreUntil: this.ignoreFoldEventsUntil,
    active: active ? {path: active.file.path, mode: active.editMode} : null,
    lastFilePath: this.lastFilePath,
    txEffects: u.transactions.flatMap(t => t.effects.map(e => e.value?.constructor?.name ?? e.value)),
    prevFold: this.prevFold,
  });
  // ... existing logic, with logs around decideOnFoldChange call + foldEffect dispatch
}
```

Ship the spike build. Driver runs against bluh, clicks the fold-triangles, pastes console output back. Forge-core triages → CC ships the fix per the evidence.

## §2 — Implementation phase (per §1 outcome)

Forge-core in chat will provide a specific fix instruction based on the spike output. Likely shapes:

- **If H1 fires**: defer the foldedRanges read by one CM frame using `view.requestMeasure(...)` or schedule the diff on the next animation frame.
- **If H2 fires**: distinguish "self-induced dispatch" from "user-induced update" via transaction annotation (`Transaction.userEvent`) instead of timestamp debounce. CM6 supports `Transaction.annotation(Transaction.userEvent)` to tag the source.
- **If H3 fires**: stabilize `lastFilePath` by reading from `MarkdownView.file?.path` directly on first attach + only updating on `workspace.on('file-open')` events, not on every ViewUpdate.
- **If H4 fires**: re-derive heading line positions from the live document state inside the dispatch, not from cached headings.
- **If H5 fires**: parse headings directly from `view.state.doc` (line iteration over the editor's current content) rather than relying on `metadataCache`.
- **If H6 fires**: `getActiveSnippet` returns the active MarkdownView's file via a more robust accessor (e.g., `app.workspace.getMostRecentLeaf()?.view as MarkdownView`).

## §3 — Tests required

- **Pure-core** (`facet-mutex-core.test.ts`): unchanged from v0.2.83. 12 tests still pass.
- **Integration**: per the v0.2.83/v0.2.84 pattern, ViewPlugin integration is not unit-tested (CM6 mocking brittle). The fix is verified via user smoke.
- **NEW**: a regression-guard pure-core test if the bug surfaces a missing pure-core case (e.g., a heading-detection edge case). Add a failing-first test that captures the symptom.

## §4 — User-side smoke

```
# Step 1 — install v0.2.85 spike (or v0.2.85 fix).
VAULT=~/forge-vaults/bluh bash ~/projects/forge-client-obsidian/scripts/install-latest.sh

# Step 2 — verify install:
grep version ~/forge-vaults/bluh/.obsidian/plugins/forge-client-obsidian/manifest.json
# Expected: "version": "0.2.85"

# === SPIKE PHASE (if shipping diagnostics first) ===
# Step 3 — open Obsidian on bluh. Open DevTools console.
# Open a snippet that has both # English AND # Python on disk.
# (If forge-tutorial/09-slots/octopus_fact.md doesn't have # Python yet,
# Forge-click it first to generate the cache.)

# Step 4 — click the fold-triangle on # Python to EXPAND.
# Expected (currently failing): # English auto-folds.
# Observe console: Forge mutex spike logs should show:
#   - Updates firing (multiple per click)
#   - Whether prevFold/newFold differ
#   - Whether decideOnFoldChange is called and what it returns
#   - Whether foldEffect.of dispatch fires with what {from, to}

# Step 5 — paste console output back to forge-core in chat.

# === FIX PHASE (after spike findings + fix shipped) ===
# Step 6 — re-install v0.2.85 fix.

# Step 7 — repeat Step 4. Verify mutex now fires:
#   - # English auto-folds when # Python expanded
#   - Notice: "Forge: <snippet> → Python mode"
#   - Frontmatter: edit_mode: python + locked_english_hash: <hex>
grep "^edit_mode:\|^locked_english_hash:" \
  ~/forge-vaults/bluh/forge-tutorial/09-slots/octopus_fact.md

# Step 8 — flip back. Expand # English. Verify # Python auto-folds.

# Step 9 — splits: open a snippet in a second pane. Flip the mode in
# one pane. Verify the other pane is NOT affected.

# Step 10 — slot-free snippet (no # Python on disk) — verify still
# no crash; v0.2.83 §3.5 palette guard still fires.
```

## §5 — Open follow-ups expected

1. **Test infrastructure debt continues**: v0.2.83 deferred CM6 integration tests; v0.2.84 doubled down; v0.2.85 inherits the deficit. If THIS bug recurs after the fix, integration tests become priority for the next drain regardless of mocking pain.
2. **ViewPlugin pattern viability questioned**: if H1 or H2 fires (deep CM6 lifecycle issues), consider whether ViewPlugin is the right substrate vs going back to polling (slower but more predictable).
3. **Diagnostic-logging pattern as a process artifact**: spike → ship diagnostics → user observes → fix per evidence — this is the third time this cycle has fired in this session (v0.2.80 spike, then v0.2.85 spike). Worth codifying in cc-prompt-queue.md as a standard pattern.

## §6 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §1 mandates spike + 6 hypotheses to discharge.
- ✓ §57–74 (TDD): if the fix surfaces a pure-core gap, add failing-first test. Otherwise the smoke is the verification (ViewPlugin integration tests deferred per established pattern).
- ✓ §86–118 (pure-core convention): pure-core untouched; controller adjustments only.
- ✓ §76 (don't ship speculative fix): the §2 "implementation phase" depends on §1 spike outcome.
- ✓ §347 (version-bump sanity check): manifest pre-bump at 0.2.84; explicit version arg.
- ✓ §321 (feedback file before move): standard.
- ✓ "Assert cannot only with concrete error" HARD RULE: §1's hypotheses each need concrete evidence (spike log lines).

## §7 — Architectural framing

This is a v0.2.84 regression fix. Stays V1-scoped — no V2 architecture changes. Goal: restore the gestural mutex behavior that v0.2.83 had (and v0.2.84 was supposed to make faster, not break).

If the investigation reveals ViewPlugin fundamentally can't deliver the mutex semantics reliably, fallback is rolling back to v0.2.83's polling (worse latency, but functional). Surface this as a §5 follow-up if applicable.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §8 — Hand-off

Pickup with §1 spike. Ship the diagnostic-logging build first (no fix yet). Driver runs Step 3-5 and pastes console output. Forge-core in chat triages; CC ships the fix in a follow-up commit + bumps to v0.2.85 final.

If you're confident enough from code-reading alone to skip the spike and ship a fix directly: surface the hypothesis you're betting on + the smoke step that would verify it. Per §78 + §76 — don't speculate without evidence.
