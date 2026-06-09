# v0.2.73 — slot resolution second pass writes stale `# Python`

**Date queued**: 2026-06-07
**Driver**: forge-core (Oded)
**Target plugin version**: bump per placeholder — `{CURRENT} → {NEXT_PATCH}` (expected `0.2.72 → 0.2.73`). Read `~/projects/forge-client-obsidian/manifest.json` first per cc-prompt-queue.md §347; pause and flag if not at 0.2.72.

## §0 — Reproduction (driver-verified at v0.2.72)

User-side smoke against `~/forge-vaults/bluh/forge-moda/slot_demo.md`. Steps 1-4 of the v0.2.72 smoke pass cleanly; **Step 5 (English-edit invalidation) fails partially**:

1. After first Forge-click in Step 2: `# Python` heading written with storybook greeting; `english_hash: 43415de15a03032addd6f759f30d51718c451c52f3d31e56e00a1526cbc33a54` written to frontmatter. ✓
2. Step 4 (second click, cache hit): NO cache-miss log; output panel shows same greeting. ✓
3. **Step 5: user edits English slot text** from `{{a friendly hello...children's storybook}}` to `{{a formal hello...Victorian letter}}` and saves. Forge-click. Observed:
   - Console: `Forge: slot cache miss { snippetId: 'forge-moda/slot_demo', missingCount: 1 }` ✓
   - Console: `Forge: slot cache write succeeded { ... count: 1 }` ✓
   - `english_hash` on disk UPDATES to new value `5fe21a3d85ff8df536854a08a8c22556b249a236858f2d7d5737b98b4b6ccada` ✓
   - **`# Python` heading on disk DOES NOT UPDATE** — still shows the storybook greeting from Step 2.
   - `grep -c "^# Python"` = 1 (single heading, content stale; not a duplicate-heading issue).

This means the second-pass compute + cache-write path EITHER (a) writes the cache successfully but with the OLD Python content (engine returning stale code), OR (b) writes `english_hash` to frontmatter but silently fails to replace the `# Python` body content.

The user has been verified to NOT have a triple-brace typo (they cleaned up an earlier `{{{` artifact before the failing repro; the failing repro has clean `{{a formal hello...}}`).

## §1 — Investigation phase (commit before fix — HARD RULE)

Per cc-prompt-queue.md §78 (investigation-before-design rider for non-obvious bugs): the failure mode admits MULTIPLE plausible root causes. Investigation must commit findings BEFORE the fix commit so the fix design follows from data, not from any single speculation.

Three hypotheses (do NOT assume which fires):

### §1.1 — Hypothesis A: `writePythonAndEnglishHash` body-merge defect

`~/projects/forge-client-obsidian/src/python-cache-writer-core.ts` `replaceOrInsertPythonHeading` may have a defect where:
- `replaceOrInsertEnglishHash` correctly updates the frontmatter `english_hash` line.
- `replaceOrInsertPythonHeading` finds the existing `# Python` heading but silently fails to replace its content (e.g., end-of-section detection scoops up the wrong line range, or the splice writes new content without removing old).

To investigate: write a regression test that constructs the exact body shape on disk (after Step 3 write — has frontmatter with old english_hash, `# English` with Victorian text, `# Python` with storybook code) and calls `writePythonAndEnglishHash(body, { pythonCode: NEW_VICTORIAN, englishHash: NEW_HASH, stripStaleSlots: true })`. Assert that the output body's `# Python` block contains NEW_VICTORIAN, not the storybook code. If the test passes against current code, hypothesis A is refuted.

### §1.2 — Hypothesis B: Engine returns OLD code on second pass despite `slot_resolutions` argument

`~/projects/forge/forge/core/executor.py` `resolve_action_code(snippet, slot_resolutions=None)` (commit `1cc4653`) may take the cached-`# Python` early-return path on the second compute even when `slot_resolutions` is provided. Specifically:

```python
if code is not None:  # # Python exists (OLD storybook)
  if facet_form == "canonical" and edit_mode != "python":
    stored_hash = meta.get("english_hash")
    english = extract_section(snippet["body"], "English")
    current_hash = compute_english_hash(english) if english else None
    if stored_hash == current_hash:
      return code
    # fall through
  else:
    return code  # NOT canonical OR edit_mode == python → return OLD
```

Two failure shapes here:
- The `else: return code` branch fires because `facet_form` parses as not-`"canonical"` (e.g., snippet body's frontmatter was rewritten by Obsidian and `facet_form` field was dropped or transformed).
- The `if stored_hash == current_hash: return code` branch fires because `stored_hash` (from frontmatter) coincidentally equals `current_hash` (from English) — would require a SnippetRegistry-cache staleness OR a hash-determinism bug.

To investigate: write a regression test in `~/projects/forge/tests/core/test_executor_slots.py` that constructs a snippet with `# Python` (storybook), `# English` (Victorian), frontmatter english_hash matching the storybook English (mismatch with Victorian), `facet_form: canonical`, and calls `resolve_action_code(snip, slot_resolutions={NEW_KEY: NEW_VICTORIAN_EXPR})`. Assert the returned code is the NEW transpiled output, NOT the stored storybook code. If the test passes, hypothesis B is refuted.

ALSO check: `_forge_run_snippet` and `_forge_compute_with_python` in `~/projects/forge-client-obsidian/src/pyodide-host.ts` (Python side) — verify they return the CODE that `resolve_action_code` produced (not a separate code path that re-reads `# Python` from disk).

### §1.3 — Hypothesis C: Obsidian dropped `facet_form: canonical` from frontmatter

Obsidian's YAML editor can rewrite frontmatter on save, reordering fields and sometimes dropping unrecognized ones. If `facet_form: canonical` was dropped after the user's edit:
- Engine's `resolve_action_code` takes the `else: return code` branch
- Returns OLD storybook code without ever hitting the canonical hash check
- `_forge_compute_with_python` returns OLD code as the third tuple element
- Plugin's `writePythonAndEnglishHash` writes OLD code to `# Python` (which is what's already there → no visible change)
- The cache-miss log we saw in console MUST have come from the FIRST compute, before the second compute (with `slot_resolutions`) bypassed the canonical path

To investigate: examine the on-disk frontmatter of `~/forge-vaults/bluh/forge-moda/slot_demo.md` post-Step-5. If `facet_form: canonical` is missing, hypothesis C is the root cause. Cannot reproduce CC-side without driver access; instead, add a defensive engine-side log/warning when a snippet has `# Python` cached but `facet_form` is absent AND the English content has changed.

### §1.4 — Investigation commit

Title: `[2026-06-07-0600-slot-resolution-second-pass-writes-stale-python] phase 1: investigation of stale # Python write`

Investigation note at `~/projects/forge/docs/investigations/v0.2.73-slot-resolution-stale-python.md`. For each hypothesis (A, B, C):
- Write the regression test described above.
- Run it.
- Report whether it passes or fails against current v0.2.72 code.
- Cite line numbers for the code paths under examination.

**A failing test confirms a hypothesis. A passing test refutes one.** Investigation completes when at least one hypothesis is confirmed OR all three are refuted (in which case route to `questions/` with the data).

## §2 — Fix phase (TDD per cc-prompt-queue.md §57)

The fix design depends on which hypothesis Phase 1 confirms. CC drafts the fix AFTER Phase 1 completes, using these guidelines:

- **If A confirmed (writePythonAndEnglishHash defect)**: fix the body-merge defect, ensure the regression test passes. Pure-core change at `python-cache-writer-core.ts`. Plugin-suite test count update.
- **If B confirmed (engine returns OLD code on second pass)**: fix the resolve_action_code path so `slot_resolutions` correctly forces re-transpile regardless of cached `# Python`. May require restructuring the early-return logic (e.g., only return cached code if `slot_resolutions is None`, since the caller passing resolutions signals re-transpile intent). Engine-suite test count update.
- **If C confirmed (Obsidian dropped facet_form)**: add a defensive engine warning + a chapter-9-relevant note for forge-doc about frontmatter stability. The fix is partly engine-side (resilience) and partly authoring-discipline (forge-doc teaches students that the `facet_form` field is load-bearing). Not a v0.2.73 hotfix necessarily; could route to questions/ for design.

Per cc-prompt-queue.md §57-74:
1. Failing test FIRST (the one written in Phase 1 that confirmed the hypothesis).
2. Run, confirm fails.
3. Implement fix.
4. Re-run, confirm passes.
5. Full suite (engine + plugin).

## §3 — User-side smoke (CC writes post-implementation)

Pre-spec'd Step 1 per cc-prompt-queue.md §187: the EXACT reproduction from §0 of this prompt — Step 5 cache invalidation on Victorian slot text edit must produce both NEW `english_hash` AND NEW `# Python` body containing a Victorian-style greeting.

Plus regression check: Steps 2-4 of v0.2.72 smoke still pass (initial cache write + cache hit deterministic).

Plus migration check: vaults with v0.2.72 stale `# Python` (post-Step-5 broken state) get cleaned up on first compute under v0.2.73.

CC actually runs as much as possible from sandbox (helper-level pure-core tests prove the merge logic correct OR the engine return logic correct) and defers Obsidian-context steps to user.

## §4 — Release ship

Per cc-prompt-queue.md §339:

1. Bump `manifest.json` per placeholder.
2. NO `forge-moda/forge.toml` bump (no bundled-vault content change). Declare opt-out explicitly in §0 of feedback.
3. `scripts/release.sh` per current automation.
4. Tag pushed, GH release published.

No forge-transpile redeploy needed — server-side unchanged.

## §5 — Feedback file shape

Per cc-prompt-queue.md §30-46 + §66-74:

- §0 — release coordinates.
- §1 — Investigation findings (per §1.1 / §1.2 / §1.3 — which hypothesis confirmed, which refuted, with verbatim test output for each).
- §2 — TDD continuity for the fix (5 checkpoints).
- §3 — User-side smoke checklist per §3 of this prompt.
- §4 — Auto-smoke results.
- §5 — Open follow-ups (e.g., if hypothesis C confirmed, forge-doc teaching note flagged).

## §6 — Self-contained context for CC

- v0.2.72 feedback (immediately prior ship): `~/projects/forge-moda-bootstrap/prompts/feedback/2026-06-07-0400-slot-resolution-unify-into-python-facet.md`.
- v0.2.72 engine commit: `1cc4653` (forge).
- v0.2.72 plugin commit: `5a9d3cc` (forge-client-obsidian).
- Constitution B7.3 (authoritative contract): `~/projects/forge/docs/specs/constitution.md` (~line 430). Just amended this session to clarify slot-free vs slot-bearing distinction. Re-read end-to-end.
- The new "Assert cannot only with concrete error" HARD RULE: `~/projects/forge-moda-bootstrap/cowork-forge-protocol.md`. Applies to feedback assertions.
- The new "Forge-core's CC-drain review is always-on, never skipped" HARD RULE: same protocol file §77. Already operative.
- Driver's repro vault: `~/forge-vaults/bluh`. Snippet: `forge-moda/slot_demo.md`.
- Stored english_hash values from driver smoke (for cross-language hash parity verification):
  - Storybook: `43415de15a03032addd6f759f30d51718c451c52f3d31e56e00a1526cbc33a54`
  - Victorian (with triple-brace typo): `781c5a7b5ad18c73ae37994b5d7a9d2f21093cef5acf337bddd9823147e903ad`
  - Victorian (clean): `5fe21a3d85ff8df536854a08a8c22556b249a236858f2d7d5737b98b4b6ccada`

## §7 — Acceptance criteria

- Investigation commit lands BEFORE fix commit; identifies which hypothesis (A/B/C) is the root cause.
- Failing test FIRST per TDD HARD RULE.
- Fix lands; failing test passes; full suites green.
- User-side smoke step 1 = exact reproduction of §0 failing case; passes.
- v0.2.73 released cleanly via release.sh.
- Feedback per §5 shape.

If investigation refutes ALL three hypotheses, STOP and route to `questions/`. Don't speculatively chain more guesses.
