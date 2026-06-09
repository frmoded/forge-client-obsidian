---
timestamp: 2026-06-09T00:30:00Z
session_id: drain-2026-06-09-0030
status: pending
priority: HIGH — v0.2.86 fix didn't take in cohort smoke; cohort onboarding blocked
---

# v0.2.87 — Expand mutex STILL not firing post-v0.2.86 + add symmetric collapse mutex

## §0 — Bug + spec extension report

**Driver smoke against v0.2.86 on bluh vault / octopus_fact.md (2026-06-09-0015):**

> "Expanding worked, but did not collapse the mutual. Reminder that collapsing should expand the mutual."

Translation:
1. **Item A — Bug (HIGH PRIORITY)**: clicking the fold-triangle on the folded `# Python` heading DOES expand `# Python` (the heading the user clicked unfurls). BUT the OTHER heading (`# English`) does NOT auto-fold. The mutex semantics are not firing. v0.2.86's hybrid sync + RAF backup tier did NOT solve the timing issue as CC's 11 isolation tests suggested it would.
2. **Item B — Spec extension (MEDIUM)**: user wants symmetric mutex. When the active facet is collapsed by the user (e.g., user collapses `# English` while in english mode), the OTHER facet should auto-expand AND `edit_mode` should flip. Current v0.2.83 spec treats this as a no-op ("user collapsed everything; stay in current mode"). User has decided this is incorrect — the mutex contract is "exactly one facet visible at any time," and "both folded" is an invalid state.

This drain ships fixes for BOTH. Item A is load-bearing for cohort onboarding (Tamar is queued); Item B is spec correctness.

## §1 — Item A: investigation phase (MANDATORY per §78)

CC's v0.2.86 drain wrote 11 self-contained tests proving the pipeline is correct in ISOLATION. The bug is somewhere in the Obsidian-runtime integration that the isolated tests can't reach.

### §1.1 — Hypothesis H7: RAF callback never fires OR fires too late

CC's v0.2.86 fix added `requestAnimationFrame(() => processUpdate())` as a backup tier after the sync call. If the RAF callback isn't actually being scheduled correctly (e.g., wrong `this` binding, view destroyed before frame), the backup never runs. Or if Obsidian's fold-state mutation takes MORE than 1 frame, the RAF sees the same stale state the sync call saw.

**Check via test:**
- Verify in `src/facet-mutex-update-flow-spike.test.ts` (or similar) that `requestAnimationFrame` is actually being called from inside `update()`. Add a counter; assert >0 after a simulated update.
- Add a delayed-read-test that simulates Obsidian's "fold takes N ms to commit" by introducing an artificial delay between dispatch and read. Verify the RAF backup catches it for N up to some bound.

### §1.2 — Hypothesis H8: applyFoldDelta dispatches but the fold doesn't visually take

`processUpdate()` might compute the right `DesiredState` and call `applyFoldDelta({foldChanges: {fold: ['# English'], unfold: []}})`, but the actual `cm.dispatch({effects: [foldEffect.of({from, to})]})` might be dispatching a fold-effect with an empty or wrong range, OR Obsidian's own fold-state-restoration is overriding it immediately.

**Check via test:**
- After a simulated user-expand event, assert that `foldedRanges(state)` reflects the auto-folded heading. Existing v0.2.86 tests already cover this in isolation — but verify against the CURRENT v0.2.86 code path (not the test shim's stripped pipeline).

### §1.3 — Hypothesis H9: re-update loop immediately undoes our applied fold

After `processUpdate()` dispatches `foldEffect.of(...)` to auto-fold `# English`, the editor fires another `ViewUpdate`. If `ignoreFoldEventsUntil` doesn't suppress this, `processUpdate()` reads the new state (one heading folded, one expanded), diffs against `prevFold`, decides it's "user collapsed # English while # Python active" → flips back to english + expands `# English`. Oscillation → mutex never settles → user sees nothing change.

**Check via test:**
- Simulate a fold-effect dispatched by the controller. Verify the NEXT update() call detects it's self-induced (via `ignoreFoldEventsUntil` OR transaction annotation) and does NOT trigger another flip.

### §1.4 — Hypothesis H10: headings detection fails for slot-bearing snippets (octopus_fact-specific)

octopus_fact is slot-bearing (has `{{...}}` slot tokens in `# English`). Maybe the headings detection (regex over body content) finds extra "heading-like" lines in the slot tokens or slot resolutions metadata. If `pythonLine` is computed wrong, the `foldEffect.of({from, to})` targets the wrong range.

**Check via test:**
- Build a slot-bearing test fixture (English body with `{{slot}}` tokens + frontmatter with slot_resolutions). Run readHeadings. Verify `englishLine` and `pythonLine` are correct line numbers.

### §1.5 — Hypothesis H11: octopus_fact wasn't actually populated with # Python on disk

User said "in octopus_fact snippet, #python and #English facets are not mutually exclusive" — implying both facets exist. But forge-tutorial 0.1.2 (bundled in v0.2.86) doesn't have `# Python` on octopus_fact (per forge-doc's 2026-06-09-0111 message: "octopus_fact needs you/driver Forge-click"). If the user didn't Forge-click first, the `# Python` heading doesn't exist on disk, and the mutex can't fire because there's nothing to fold/unfold.

**Check via driver clarification or by reading the file:** does `~/forge-vaults/bluh/forge-tutorial/09-slots/octopus_fact.md` actually have a `# Python` heading on disk currently? If not, this is a teaching moment, not a bug.

```bash
grep -n "^# Python\|^# English" ~/forge-vaults/bluh/forge-tutorial/09-slots/octopus_fact.md
```

If the answer is "no `# Python` line", then Item A as described isn't a regression — the user is testing on a snippet without two facets. The right move: ask driver to Forge-click first, then re-test. The pure expand-fold mutex on a snippet with both facets present is what we need to verify works.

### §1.6 — Cross-hypothesis: add a small live-runtime spike

If §1.1–§1.4 tests don't pin the bug, add ONE diagnostic `console.log` block to `processUpdate()`. Mark `// v0.2.87 SPIKE — REMOVE AFTER`. Log each call's:
- `prevFold` (the cached state)
- `newFold` (the freshly-read state)
- `decideOnFoldChange` decision
- Whether `applyFoldDelta` was called + with what
- Result of next `foldedRanges` read (post-dispatch)

Ship as v0.2.87-spike. Driver runs against octopus_fact, pastes console output. Forge-core triages. CC ships fix.

Note: if §1.5 turns out to be the cause, skip the spike — just clarify to driver.

## §2 — Item B: spec extension

### §2.1 — New semantics for decideOnFoldChange

Current v0.2.83 spec — collapse-of-active-facet is no-op:

```
decideOnFoldChange(prev={F,T}, new={T,T}, english, both)
  → {englishFolded: true, pythonFolded: true, newEditMode: null}
    // "user collapsed English; stay; no flip"
```

NEW SPEC — collapse-of-active-facet flips edit_mode + auto-expands the OTHER facet:

```
decideOnFoldChange(prev={F,T}, new={T,T}, english, both)
  → {englishFolded: true, pythonFolded: false, newEditMode: 'python'}
    // "user collapsed English while in english mode → flip to python + expand Python"

decideOnFoldChange(prev={T,F}, new={T,T}, python, both)
  → {englishFolded: false, pythonFolded: true, newEditMode: 'english'}
    // "user collapsed Python while in python mode → flip to english + expand English"
```

This preserves the "exactly one facet visible at any time" invariant. Both folded and both expanded are invalid states the mutex prevents.

### §2.2 — Edge cases

- Only one heading exists (slot-free snippet without `# Python`): collapse of the only-existing heading should NOT trigger anything (there's nothing to auto-expand). Maintain existing no-op behavior for this case.
- Snippet just opened (initial state apply): collapse mutex should not fire during the debounce window (same `ignoreFoldEventsUntil` check as the existing expand mutex).
- Both already folded (no active facet visually): collapse of either heading is a no-op (already folded).

### §2.3 — Test cases to add to `facet-mutex-core.test.ts`

```typescript
test('collapse English in english mode (both present) → flip to python + expand Python', () => {
  const decision = decideOnFoldChange(
    {englishFolded: false, pythonFolded: true},
    {englishFolded: true, pythonFolded: true},
    'english',
    {englishLine: 5, pythonLine: 15},
  );
  expect(decision).toEqual({englishFolded: true, pythonFolded: false, newEditMode: 'python'});
});

test('collapse Python in python mode (both present) → flip to english + expand English', () => {
  const decision = decideOnFoldChange(
    {englishFolded: true, pythonFolded: false},
    {englishFolded: true, pythonFolded: true},
    'python',
    {englishLine: 5, pythonLine: 15},
  );
  expect(decision).toEqual({englishFolded: false, pythonFolded: true, newEditMode: 'english'});
});

test('collapse English in english mode (Python heading absent) → no-op', () => {
  const decision = decideOnFoldChange(
    {englishFolded: false, pythonFolded: false},
    {englishFolded: true, pythonFolded: false},
    'english',
    {englishLine: 5, pythonLine: null},
  );
  expect(decision.newEditMode).toBeNull();
});
```

## §3 — Implementation phases

### §3.1 — Phase 1: Item A investigation

Discharge §1.1–§1.5 hypotheses with the existing test infrastructure CC built in v0.2.86. Add diagnostic tests as needed. If still unclear, ship the §1.6 spike + ask driver.

### §3.2 — Phase 2: Item A fix

Per investigation outcome. Likely shapes:
- **If H7 (RAF timing)**: add CC's §6 #1 fallback — a 100ms `setTimeout` as a SECOND backup tier after the RAF. Three-tier defense: sync → RAF → 100ms setTimeout.
- **If H8 (dispatch issue)**: re-derive the range from current document state inside the dispatch.
- **If H9 (oscillation)**: use `Transaction.userEvent` annotation to tag self-induced dispatches, suppress them via annotation check instead of (or in addition to) `ignoreFoldEventsUntil` timestamp.
- **If H10 (slot snippet detection)**: add a test fixture for slot-bearing snippets in `facet-mutex-core.test.ts`; fix headings detection if it has slot-aware bugs.
- **If H11 (no #Python on disk)**: not a bug; driver clarification. Document in feedback.

### §3.3 — Phase 3: Item B implementation

Extend `decideOnFoldChange` in `src/facet-mutex-core.ts` per §2.1 semantics. Add §2.3 test cases. No controller-level changes needed — the existing dispatch path already handles arbitrary `DesiredState` returns.

Ensure the existing 12 pure-core tests still pass — the change is additive (new transitions handled, existing transitions unchanged for expand cases).

### §3.4 — Phase 4: regression coverage

Add v0.2.87-specific tests to the existing spike infrastructure (`facet-mutex-update-flow-spike.test.ts`):
- Symmetric collapse test: simulate user collapse of active facet, verify the inverse-expand + edit_mode flip happens.

## §4 — Tests required summary

- Pure-core: 3 new symmetric-collapse tests (per §2.3) + verify existing 12 still pass.
- Update-flow spike tests: 1-2 new tests for symmetric collapse + any new tests from §1 investigation.
- Total new tests: ~5-7.
- Plugin test suite: 583 + ~5-7 = ~590 passing.

## §5 — User-side smoke

```
# Step 1 — install v0.2.87 (or v0.2.87-spike if shipping diagnostic build first).
VAULT=~/forge-vaults/bluh bash ~/projects/forge-client-obsidian/scripts/install-latest.sh
grep version ~/forge-vaults/bluh/.obsidian/plugins/forge-client-obsidian/manifest.json

# Step 2 — verify octopus_fact has BOTH facets on disk:
grep -n "^# Python\|^# English" \
  ~/forge-vaults/bluh/forge-tutorial/09-slots/octopus_fact.md
# Expected: at least one line each. If only # English, Forge-click octopus_fact
# in Obsidian first to populate # Python, then continue.

# Step 3 — Item A verification (expand mutex):
# Open octopus_fact.md. Initial fold state (if english mode): # English expanded,
# # Python folded.
# Click fold-triangle on # Python to EXPAND it.
# Expected:
#   - # Python expands (the heading you clicked unfurls)
#   - # English AUTO-FOLDS (this is the bug that needs fixing)
#   - Notice: "Forge: octopus_fact → Python mode"
#   - Frontmatter: edit_mode: python + locked_english_hash: <hex>

# Step 4 — Item A reverse direction:
# Click fold-triangle on # English. Expected: # English expands, # Python
# auto-folds, Notice → English mode, frontmatter cleaned.

# Step 5 — Item B verification (symmetric collapse mutex):
# Now in english mode (# English expanded, # Python folded).
# Click fold-triangle on # English to COLLAPSE it.
# Expected (NEW BEHAVIOR per v0.2.87):
#   - # English folds (the heading you clicked collapses)
#   - # Python AUTO-EXPANDS (new spec; user invariant: exactly one visible)
#   - Notice: "Forge: octopus_fact → Python mode"
#   - Frontmatter: edit_mode: python + locked_english_hash: <hex>
grep "^edit_mode:" ~/forge-vaults/bluh/forge-tutorial/09-slots/octopus_fact.md

# Step 6 — Item B reverse:
# Now in python mode. Click fold-triangle on # Python to COLLAPSE.
# Expected: # Python folds, # English auto-expands, Notice → English mode.

# Step 7 — slot-free snippet (no # Python):
# Open forge-tutorial/01-hello/hello_world.md (slot-free).
# Initial state: # English expanded; no # Python to fold.
# Click fold-triangle on # English to COLLAPSE.
# Expected: # English collapses. NO auto-expand of anything (no # Python to expand).
# Notice on Cmd-P palette toggle: v0.2.83 §3.5 guard fires.

# Step 8 — splits:
# Open same snippet in second pane. Flip mode in one pane (via gesture).
# Verify the other pane is NOT affected.
```

## §6 — Open follow-ups expected

1. **Test infrastructure debt continues to repay**: v0.2.86 added 11 spike tests; v0.2.87 adds ~5-7 more. Cumulative ViewPlugin integration test coverage growing — the v0.2.81/v0.2.83/v0.2.84 deferred-test deficit is now substantially addressed.
2. **Spec change documentation**: the symmetric mutex (Item B) changes the v0.2.83 spec. Update `~/projects/forge/docs/specs/constitution.md` if B7.3 or related sections reference the asymmetric semantics. Possibly belongs in a constitution amendment commit.
3. **If H7 fires + 100ms setTimeout is insufficient**: next drain considers polling fallback (v0.2.83-style 200ms `setInterval`) as a final-tier safety net. Worse latency, more reliable.
4. **octopus_fact still pending population**: per the v0.2.x action item, after v0.2.87 ships clean, driver Forge-clicks octopus_fact to populate `# Python` + commits back to source.

## §7 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §1 discharges 5 hypotheses + cross-hypothesis spike fallback. Items A's fix follows evidence.
- ✓ §57–74 (TDD): Item B adds failing-first tests in `facet-mutex-core.test.ts` per §2.3. Item A may add new spike tests per investigation.
- ✓ §86–118 (pure-core convention): Item B extends `facet-mutex-core.ts` pure-core (semantically clean addition). Item A touches `facet-mutex-view-plugin.ts` integration layer.
- ✓ §76 (don't ship speculative fix): Item A fix follows §1 investigation outcome.
- ✓ §347 (version-bump sanity check): manifest pre-bump at 0.2.86; explicit version arg.
- ✓ §321 (feedback file before move): standard.
- ✓ "Assert cannot only with concrete error" HARD RULE: §1 hypotheses each need concrete test evidence before discharge.

## §8 — Architectural framing

V1-scoped. Both Item A (bug fix) and Item B (spec extension) preserve the V1 `edit_mode` field + B8 contract. V2 retires `edit_mode` for `source`; the symmetric-mutex semantics from Item B carry forward (the "exactly one source visible" invariant is even more fundamental in V2's `source: english | epython` model).

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §9 — Hand-off

Suggested order:
1. §1 Item A investigation first (tests + maybe spike). Spike SHOULD NOT be needed if §1.5 turns out to be the cause (cheap clarification first).
2. Item A fix (per investigation outcome).
3. Item B spec implementation (decideOnFoldChange + tests).
4. Phase 4 regression coverage.
5. Release as v0.2.87.

If Item A turns out to be H11 (no `# Python` on disk because user didn't Forge-click first), only Item B ships in this drain — Item A becomes "user education" not "fix."
