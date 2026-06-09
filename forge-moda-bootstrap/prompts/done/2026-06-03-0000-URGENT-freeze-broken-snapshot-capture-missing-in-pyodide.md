# URGENT — Freeze is broken end-to-end: edge snapshots aren't being captured in Pyodide compute

## Scope

Investigate why Forge-clicking a snippet that calls `context.compute('other_snippet', ...)` doesn't write the expected edge snapshot file to `.forge/edges/<caller>/<callee>.md`, then ship the fix. Demo-blocking for the music demo this weekend — freeze must work end-to-end before then.

Two-commit drain per the **investigation-before-design** rider in cc-prompt-queue.md:
1. **Commit 1 — investigation**: data capture + diagnosis. No fix yet.
2. **Commit 2 — fix**: TDD failing test first → fix → re-run → full suite.

What this prompt does NOT do:
- Skip the investigation step. The hypothesis below is a guess; the investigation findings win.
- Re-design `snapshots.py` semantics. F-series is correct as documented; the capture wiring is what's broken.
- Touch the freeze affordance UX (modal, command palette commands). The freeze path works in isolation per v0.2.30 tests; the capture path is what fails to feed it.

## Reproduction

User's manual smoke against the `smoke-v0.2.13` vault (~/forge-vaults/smoke-v0.2.13/) with plugin v0.2.39:

1. Open `hello_random.md` (calls `context.compute('random_name', n=5)` then `context.compute('greet', name=...)`).
2. Forge-click three times; each shows a different `Hello <5-letters>` — non-determinism confirmed.
3. Cmd+P → "Freeze edge" → caller=`hello_random`, callee=`random_name` → submit.
4. **Crash**: `FileNotFoundError: /bundle/user-vault/.forge/edges/hello_random/random_name.md`

Full stack trace from the user:

```
plugin:forge-client-obsidian:122889 Forge freeze failed: PythonError: Traceback (most recent call last):
  File "/bundle/engine/forge/core/snapshots.py", line 58, in set_snapshot_state
    raise FileNotFoundError(path)
FileNotFoundError: /bundle/user-vault/.forge/edges/hello_random/random_name.md
    at PyodideHostInstanceImpl.setEdgeState (plugin:forge-client-obsidian:123834:18)
    at freezeEdge (plugin:forge-client-obsidian:122882:18)
    at async ForgeFreezeModal.eval [as onSubmit] (plugin:forge-client-obsidian:126833:21)
```

Per F5 (snapshots.py:54-58), `set_snapshot_state` raises `FileNotFoundError` if the snapshot file doesn't exist — "can't freeze what hasn't been captured." The bug is that the capture didn't happen, not that the freeze logic is wrong.

## Hypothesis (CC: verify or refute via Phase 1 investigation)

`forge/core/executor.py:290-307` writes the snapshot inside the `_track_edge_capture` method. Line 291-292 short-circuits with a silent return if either `self._caller_id is None` or `self.vault_path is None`. **Hypothesis**: one of those is null in the Pyodide compute path, so capture silently no-ops and the freeze path then has nothing to flip.

Candidate root causes within the hypothesis (CC narrows during investigation):

a. `_forge_compute` in `pyodide-host.ts` doesn't propagate `caller_id` into the `ForgeContext` it constructs for the callee.
b. `_forge_user_vault` (the JS-set Python global) isn't reaching the executor's `vault_path` attribute — perhaps set in one ForgeContext but not the one used during nested `context.compute()`.
c. The compute path that runs in response to a Forge-click is a different code path than the one the failing-test fixtures used — v0.2.30 tests passed against a pre-existing fixture file rather than a freshly-captured one. Real Forge-click capture has never been smoke-tested end-to-end.

**Treat the hypothesis as discardable.** Investigation findings override.

## Phase 1: Investigation (separate commit)

### Required findings to capture in §1.2 of the feedback

1. **Add temporary `print()` instrumentation** to `executor.py:_track_edge_capture` BEFORE the early-return guard, dumping `caller_id`, `vault_path`, `callee_snippet['snippet_id']`, and `type(value).__name__`. Comment marker: `# FORGE-DEBUG investigation v0.2.40` so the lines are easy to grep + remove in Phase 2.

2. **Add a similar `print()`** to the `_forge_compute` Python block in `pyodide-host.ts` (the inline Python block bounded by `_PYTHON_BLOCK_BEGIN/_END`) dumping the args the JS side passes in: `snippet_id`, `inputs`, and what `caller_id` the ForgeContext gets (if any).

3. **Build the release zip** with the diagnostic. Install to a clean test vault. Forge-click `hello_random.md` in the `smoke-v0.2.13` vault (or replicate with a minimal greet/random_name pair in any vault — CC's call).

4. **Capture devtools console output verbatim** in §1.2. Should show whether `_track_edge_capture` runs at all, and if so what values `caller_id` / `vault_path` hold during the inner `context.compute('random_name', ...)` call.

5. **Probe MEMFS state after the click**: from Pyodide, list `/bundle/user-vault/.forge/edges/` (likely empty per the symptom, but confirm). Also list whatever directory the executor's `vault_path` resolves to during the click — verify it matches `/bundle/user-vault/`.

6. **Static-read the production wiring** with citations: every line in `pyodide-host.ts` between the start of `_forge_compute` and the call to `executor.execute_block` (or whatever invokes the engine). Caller-id propagation should be traceable line-by-line. Citing line numbers in §1.2 makes the diagnosis defensible.

### Diagnosis section in §1.2

CC writes a 2-3 sentence root-cause statement following from the data. Format:

> Root cause: `<concrete statement>`. Evidence: <bullet points from the §1.2 data>.

Example shape (NOT a hint about the actual cause):
> Root cause: `_forge_compute` constructs ForgeContext without setting `_caller_id`, so the nested `context.compute()` calls run with `_caller_id=None` and `_track_edge_capture` returns early. Evidence: console shows `caller_id=None vault_path=/bundle/user-vault/` during the inner call.

If the data refutes the hypothesis above, document the actual mechanism explicitly. **Don't ship the fix until §1.2 has a defensible diagnosis** — speculative fixes on a demo-blocking bug are the wrong trade.

### Commit Phase 1

Push the investigation commit before starting Phase 2:
- Diagnostic prints in place.
- §1.2 written to the feedback file.
- Optionally a release zip with diagnostics shipped (or not — Phase 2 builds the real fix release).

## Phase 2: Fix (separate commit) — TDD discipline

### Step 1 — Write the failing test FIRST

`forge-client-obsidian/src/freeze-roundtrip.test.ts` (new file, Pyodide-warm, dynamic-load fixture per cc-prompt-queue.md §80):

The test exercises the full **capture → freeze → re-execute → assert frozen value** loop in a single Pyodide instance. Test cases (approximate; CC names them per discovery):

1. `compute writes snapshot file at .forge/edges/<caller>/<callee>.md` — Forge a tiny test vault into MEMFS with a `caller.md` that calls `context.compute('callee')`. After one execution, assert the snapshot file exists with content matching the callee's return.
2. `compute writes snapshot file with caller_id correctly populated` — the existing v0.2.30 freeze tests passed against fixture; this test asserts that real compute populates `caller_id` and `vault_path` BEFORE the freeze test can run.
3. `freeze → re-compute → frozen value` — capture, freeze, re-compute, assert frozen value returned.
4. `unfreeze → re-compute → fresh value` — capture, freeze, unfreeze, re-compute, assert fresh value returned (validates round-trip).
5. `freeze without prior capture raises FileNotFoundError` — explicit assertion that F5 is preserved (defensive — don't accidentally make freeze auto-create files when the bug is fixed).

Run before fix → cases 1-4 fail with whatever the bug is (capture not happening, or capture-to-wrong-path). Case 5 passes (F5 logic unchanged). Capture verbatim output in §1.2.

If cases 1-4 PASS against current code, the hypothesis-and-data-from-Phase-1 was wrong and CC pivots — investigate elsewhere, ship diagnostic instrumentation only, do NOT ship a speculative fix.

### Step 2 — Implement the fix

Design follows from Phase 1 findings. Anchor citations to specific line numbers in §1.3.

If the cause is `caller_id` not propagating: fix the ForgeContext construction site in `_forge_compute` (or wherever Phase 1 isolated). Add the missing wire-up. Keep the change as narrow as possible.

If the cause is `vault_path` not propagating: similar shape, different attribute.

If the cause is something else: design accordingly.

**Remove the FORGE-DEBUG investigation prints in this commit.** Search for the marker `# FORGE-DEBUG investigation v0.2.40` and delete those lines. Diagnostic prints don't ship to production.

### Step 3 — Re-run the test

Cases 1-4 should pass. Case 5 should continue to pass. Capture verbatim output in §1.4.

### Step 4 — Full suite

`npm test` in forge-client-obsidian → expect `X/X`. `pytest -q` in forge → expect `Y passed`. Capture both verbatim in §1.5.

### Step 5 — User-side smoke (deferred to user but list it)

1. Install v0.2.40 in smoke-v0.2.13 vault.
2. Forge-click `hello_random.md` once.
3. Verify `~/forge-vaults/smoke-v0.2.13/.forge/edges/hello_random/random_name.md` now exists on disk (the MEMFS-to-disk sync should write it back; if it doesn't, that's a separate problem to flag).
4. Cmd+P → Freeze edge → caller=`hello_random`, callee=`random_name`. Expect: success, no PythonError.
5. Forge-click `hello_random.md` twice. Both outputs should be IDENTICAL — the freeze took effect.
6. Cmd+P → Unfreeze edge → same caller/callee. Forge-click twice more. Outputs should DIFFER — random restored.

### Bonus: MEMFS-to-disk sync for snapshots

If Phase 1 finds that capture writes to MEMFS but never syncs to user's disk, that's a separate audit-item-worthy issue (snapshots not persistent across plugin reloads). Flag in §2 but don't fix in Phase 2 — keep the fix scope narrow.

## Files likely to touch

- **`forge/core/executor.py`** — Phase 1 diagnostic prints (added then removed); possibly the fix if root cause is engine-side.
- **`forge-client-obsidian/src/pyodide-host.ts`** — Phase 1 diagnostic prints (added then removed); possibly the fix if root cause is the inline Python block's ForgeContext construction.
- **`forge-client-obsidian/src/freeze-roundtrip.test.ts`** — NEW. The 5 TDD cases above.
- **`forge-client-obsidian/manifest.json`** — `{CURRENT} → {NEXT_PATCH}` per the late-binding placeholder convention. CC reads current value at drain start.
- **`forge-client-obsidian/INSTALL.md`** — version pin update.

CC reads other files as the investigation directs.

## Out of scope

- Re-architecting F-series semantics. Snapshots-as-files at `.forge/edges/...` stays.
- Changing the freeze affordance UX.
- Adding new test fixtures unrelated to the capture pipeline.
- Bundling new vault content.
- Touching forge-music or forge-moda.

## Don'ts

- **Don't ship a speculative fix.** The hypothesis above is a guess. Investigation findings win.
- **Don't make `set_snapshot_state` auto-create missing snapshot files.** F5 ("can't freeze what hasn't been captured") is constitutionally correct. The bug is upstream of freeze — fix capture, not freeze.
- **Don't merge investigation and fix into one commit.** The two-commit shape is load-bearing — it lets cowork review the diagnosis BEFORE the fix lands, and it gives the audit trail a clean "here's what we knew" / "here's what we did about it" structure.
- **Don't leave FORGE-DEBUG prints in production.** Phase 2 removes them.
- **Don't bump versions concretely** — use `{CURRENT} → {NEXT_PATCH}` placeholders.
- **Don't write feedback batched at the end.** Per the new cc-prompt-queue.md rule, write feedback after Phase 1 (commit the investigation, write §1.1 + §1.2), and again after Phase 2 (extend with §1.3 + §1.4 + §1.5). Or write the full feedback at the end of Phase 2 — but DO NOT defer writing the feedback file to a future drain.

## Report when done

Standard §0-§2 + the two-phase structure:

- **§0** — manifest.json before/after, commit SHAs for both phases, push, tag, release URL, SHA round-trip.
- **§1.1** — the TDD test cases (full content of `freeze-roundtrip.test.ts` quoted or summarized with case-by-case descriptions).
- **§1.2** — Phase 1 verbatim console output + 2-3 sentence diagnosis with cited line numbers.
- **§1.3** — Phase 2 fix: cited line-number diffs with before/after; explanation of why this fix follows from the §1.2 diagnosis.
- **§1.4** — post-fix verbatim test output.
- **§1.5** — full `npm test` + `pytest -q` output.
- **§2** — anything surprising during investigation; candidate follow-ups (MEMFS-to-disk sync for snapshots, etc.); honest note if the hypothesis was wrong + what the actual cause turned out to be.
