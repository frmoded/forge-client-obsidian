<!-- author: forge-music-cowork; second-pass review: requested -->
<!-- Reason for second-pass: Phase B touches forge-engine source (`forge/music/llm_prompt.py`), which affects all music-domain /generate calls globally. Forge-core may want eyes on which rules are pruned vs kept. Phases A and C are pure music-domain content work. -->

# Music vault content polish (3-phase: ref audit, prompt-fragment review, content bug fixes)

## Scope

Three tightly-related music-domain polish items in one prompt, structured so the lower-risk items commit independently before the bug-fix work begins. Each phase commits + pushes on completion (default-on git ops); if Phase C fails, Phases A and B are already shipped.

**Phase A — Reference audit in `forge-music/blues/`.** Per v0.2.26 caller-scoped bare-resolution behavior, bare `[[<name>]]` references inside a library subdir now resolve to siblings first. Audit each blues snippet's bare references, confirm intent matches the new resolution behavior, and either qualify references when intent diverges OR delete the colliding inert top-level scaffolds when no callers depend on them.

**Phase B — `MUSIC_PROMPT_FRAGMENT` review in `forge/music/llm_prompt.py`.** The fragment has accumulated ~20 rules over earlier prompt-engineering sessions. v0.2.27 made the music domain actually work in Pyodide, so future `/generate` calls will start exercising these rules in production. Prune obsolete rules (silent-part guidance is now obsolete given `lib.sequence`'s instrument-aware grouping), tighten validated ones, add a `[[ ]]` rule reflecting v0.2.26's caller-scoped resolution.

**Phase C — Content bug fixes in blues snippets (TDD HARD RULE).** Two known content bugs: (a) mode forcing in pentatonic calls regardless of `found_key.mode` — actually intentional for blues but undocumented; needs an English comment explaining the deliberate override; (b) bar arithmetic shortfalls in 12/8 (some measures sum to less than 6.0 quarterLength). Surgical fixes only — no melodic rewrites.

What this prompt does NOT do:
- Rewrite blues melodic content (no note-by-note redesign; preserve compositional intent).
- Migrate measure construction to `lib.bar()` (defensive against future drift but bigger change; separate prompt).
- Add new blues snippets or new content beyond bug fixes.
- Touch forge-moda, forge-core constitution, or any non-music repo beyond what Phase B requires.
- Decide whether `forge-music/blues/` should be promoted to a sub-library with its own `forge.toml` (still deferred).

## Why

v0.2.26 (caller-scoped resolution) and v0.2.27 (music21 + lib bundled in Pyodide) closed the engine/plumbing gaps. Forge-clicking any blues snippet now resolves and computes. The remaining gating concerns are content-side:

1. Bare-ref ambiguity from v0.2.26's caller-scoped resolution: blues snippets reference `[[form]]` and `[[twelve_bar_blues_progression]]`, which now resolve to `blues/form` and `blues/twelve_bar_blues_progression` (siblings) instead of the top-level scaffolds. This is the intended behavior, but worth confirming + cleaning up the inert scaffolds if they have no consumers.

2. The music prompt fragment was authored before `lib.sequence` was instrument-aware (which now groups same-instrument parts across sections and splits different-instrument parts into separate staves automatically). Some fragment rules instruct the LLM to manually build silent rest-filled parts — that pattern is now obsolete and should be removed before generating snippets in production.

3. Two content bugs in blues snippets that will surface on first compute: mode handling and bar arithmetic. Mode handling is actually correct (intentional minor-pentatonic-over-major for blues) but undocumented and looks like a bug on read; bar arithmetic shortfalls are genuine fixable bugs.

## Files to investigate then modify

**Phase A:**
- Read: all `~/projects/forge-music/blues/*.md` (8 files).
- Read: `~/projects/forge-music/form.md` (top-level scaffold, v0.3.0).
- Read: `~/projects/forge-music/twelve_bar_blues_progression.md` (top-level scaffold).
- Grep for callers of the top-level scaffolds across `~/projects/` (especially `forge-music/`, `forge-moda/`, and anywhere `forge-music/form` or `forge-music/twelve_bar_blues_progression` qualified IDs might appear).
- Modify (conditional on findings): blues snippets where bare refs need qualification; OR top-level scaffolds if they can be safely deleted.
- Mirror any blues-file changes to `~/projects/forge-client-obsidian/assets/vaults/forge-music/blues/`.

**Phase B:**
- Read + modify: `~/projects/forge/forge/music/llm_prompt.py` — the `MUSIC_PROMPT_FRAGMENT` constant.
- Mirror to: `~/projects/forge-client-obsidian/assets/engine/forge/music/llm_prompt.py`.
- Read (for reference): `~/projects/forge/forge/music/lib.py` to confirm which patterns the lib now handles automatically.

**Phase C:**
- Read + modify: blues snippets identified by Phase C's investigation step as having bar-arithmetic shortfalls. Likely candidates per earlier conversational session: `vocal_phrase_b.md`, possibly `vocal_phrase_a.md`, possibly `guitar_solo_chorus.md`. Investigation step confirms which.
- Add: `~/projects/forge/tests/music/test_blues_content_invariants.py` (new file) — TDD failing tests for the bar-arithmetic invariant, exercising representative blues snippet bodies via `exec_python` against a stub `context.compute("form")`.
- Mirror any blues-file changes to `~/projects/forge-client-obsidian/assets/vaults/forge-music/blues/`.

## Implementation notes — Phase A (reference audit)

1. **Inventory bare references.** For each `~/projects/forge-music/blues/*.md`:
   ```bash
   grep -nE '\[\[[^]]+\]\]' ~/projects/forge-music/blues/<file>.md
   ```
   Capture: filename → list of unique bare-reference names.

2. **Classify each reference.** For each unique bare name across the inventory, decide:
   - **Sibling-only** (e.g., `[[chorus]]`, `[[vocal_phrase_a]]`, `[[solo_chorus]]`): no top-level collision. v0.2.26 resolves to sibling. No action.
   - **Collision** (likely `[[form]]` and `[[twelve_bar_blues_progression]]`): top-level scaffold exists AND a sibling exists. v0.2.26 caller-scoped resolution now binds to the sibling. Confirm intent matches by reading the snippet's English facet: does the author mean the elaborated `blues/form` or the v0.3.0 scaffold? Likely all intend sibling.
   - **Top-level-only**: no sibling exists. v0.2.26 falls through to resolution-order walk. No action.

3. **Audit colliding top-level scaffolds for external callers.**
   ```bash
   grep -rn 'forge-music/form\|"form"' ~/projects/ \
     --include='*.md' --include='*.py' --include='*.ts' \
     --exclude-dir='node_modules' --exclude-dir='.venv' \
     --exclude-dir='.git' --exclude-dir='dist' \
     --exclude-dir='_assets'
   grep -rn 'forge-music/twelve_bar_blues_progression\|"twelve_bar_blues_progression"' ~/projects/ \
     --include='*.md' --include='*.py' --include='*.ts' \
     --exclude-dir='node_modules' --exclude-dir='.venv' \
     --exclude-dir='.git' --exclude-dir='dist' \
     --exclude-dir='_assets'
   ```
   Goal: confirm no qualified `forge-music/form` or `forge-music/twelve_bar_blues_progression` references exist outside the blues subdir or the top-level scaffold itself. If clean, the top-level scaffolds are inert and can be deleted.

4. **Decision tree based on findings:**
   - **Case: all blues bare refs intended-sibling AND top-level scaffolds have no external callers** → delete the two top-level scaffolds (`~/projects/forge-music/form.md` and `~/projects/forge-music/twelve_bar_blues_progression.md`) and their bundle mirrors. Document the deletion in the feedback.
   - **Case: all blues bare refs intended-sibling AND top-level scaffolds have external callers** → leave scaffolds in place. Document the callers and the decision to keep them.
   - **Case: any blues bare ref intended top-level scaffold** → qualify that specific reference in the snippet (`[[forge-music/form]]` or whatever the qualified ID is). Document each qualification.

5. **Mirror changes to bundle.** If anything in `~/projects/forge-music/` changed, copy the changed files to `~/projects/forge-client-obsidian/assets/vaults/forge-music/`. `diff -r` between the two trees should produce no output after the sync.

6. **Commit Phase A.** Commit message prefix `[2026-06-02-0025-music-content-polish-3-phase] Phase A — ` followed by a one-line summary of what landed (e.g., "deleted inert top-level scaffolds; blues refs unchanged"). Push to `origin/main` for both `forge-music` and `forge-client-obsidian`. Bump forge-music vault version 0.3.1 → 0.3.2 if content changed; bump plugin manifest to v0.2.28 if the bundle changed.

7. **Tests for Phase A.** Pure content audit + delete operations; no engine-side test needed unless a code change happens. If scaffolds get deleted, add a test in `forge/tests/test_snippet_resolution.py` (or similar) that asserts: in a fresh vault with `domains = ["music"]`, the bundled `forge-music` library indexes `blues/form` but NOT `form` (top-level). This locks in the deletion and prevents accidental re-introduction.

## Implementation notes — Phase B (prompt fragment review)

1. **Read the current fragment.** `cat ~/projects/forge/forge/music/llm_prompt.py`. Enumerate every bullet rule in `MUSIC_PROMPT_FRAGMENT`. Number them for the audit.

2. **For each rule, classify as keep / prune / tighten / add.** Specific guidance:

   - **PRUNE rules about manually building silent rest-filled parts.** `lib.sequence` is now instrument-aware — same-instrument parts at the same voice position merge automatically, different-instrument parts split into separate staves with rest-padding for inactive sections. The prior fragment had a substantial rule instructing the LLM to manually build silent parts when sections had different active instruments; that rule is fully obsolete. Remove it. The shorter "do not manually replicate voices()/sequence()" sub-rule should stay (still relevant for cases where the LLM is tempted to iterate `getElementsByClass(stream.Part)` and append manually).

   - **KEEP rules about bar arithmetic.** Even with `lib.bar()` available, snippets that construct measures manually (as the blues content does) still need to follow the rule. Keep the rule that says "every Measure's notes and rests must total exactly `bar_ql = ts.barDuration.quarterLength`."

   - **KEEP rule about `copy.deepcopy`** for element copying between streams. Still relevant when authors iterate `notesAndRests` and append.

   - **KEEP rule about `context.compute` kwargs** (don't invent kwargs the callee doesn't accept). Still relevant.

   - **KEEP rule about `flatten()` removing container structure.** Still relevant.

   - **KEEP rule about thinking-out-loud comments.** Still relevant.

   - **KEEP rule about frame snippets attaching all three of key/ts/mm.** Still relevant.

   - **TIGHTEN rule about register / "high entry" anchoring.** Still relevant; verify wording is current.

   - **TIGHTEN rule about MetronomeMark referent.** Still relevant; verify wording is current.

   - **ADD a rule about v0.2.26 caller-scoped bare resolution.** New rule, roughly:
     ```
     - Bare `[[snippet_name]]` references inside a library subdirectory
       (e.g., a snippet at `forge-music/blues/song.md` writing
       `[[chorus]]`) resolve to siblings in the same directory FIRST,
       per v0.2.26's caller-scoped resolution. You do NOT need to
       write `[[blues/chorus]]` from inside `blues/song.md` — bare
       `[[chorus]]` is sufficient and resolves correctly. Qualified
       references (`[[forge-music/some_other_snippet]]`) are still
       resolved as absolute paths and bypass caller-scope.
     ```

   - **REVIEW any rule that mentions "MusicXML output rendering" or "Verovio".** v0.2.27 is the first version where this is actually exercised in Pyodide. Keep if the rule guides authors toward Score-returning shapes (still correct); prune if it speculates about renderer behavior that hasn't been validated.

3. **Apply changes to `~/projects/forge/forge/music/llm_prompt.py`.** Preserve the docstring at the top of the file. Preserve the `register_fragment(MUSIC_PROMPT_FRAGMENT)` call at the bottom. Only modify the `MUSIC_PROMPT_FRAGMENT` string content.

4. **Mirror to bundle.** Copy the modified file to `~/projects/forge-client-obsidian/assets/engine/forge/music/llm_prompt.py`. Verify with `diff` — should produce no output post-copy. (Per the recurring engine-bundle-drift observation across v0.2.26 and v0.2.27, this manual copy is the third drain to surface the gap; not in this prompt's scope to fix, but flag in feedback as a follow-up if not already queued.)

5. **Commit Phase B.** Commit message prefix `[2026-06-02-0025-music-content-polish-3-phase] Phase B — ` followed by a one-line summary (e.g., "prune obsolete silent-part rules; add caller-scoped resolution rule"). Push to `origin/main` for both `forge` and `forge-client-obsidian`. No version bump on forge (no convention there); bump plugin manifest if not already bumped in Phase A.

6. **Tests for Phase B.** Phase B is prompt-fragment editing — not directly testable by suite. Three complementary checks:
   - **Static check:** `python -c "from forge.music.llm_prompt import MUSIC_PROMPT_FRAGMENT; print(len(MUSIC_PROMPT_FRAGMENT))"` — confirms the module still imports cleanly post-edit.
   - **Fragment shape check:** add or update a test in `forge/tests/test_llm_prompts.py` asserting that `build_system_prompt()` includes the music fragment string in its output and that it includes specific phrases from the new/kept rules. Specific assertions: contains `"caller-scoped"`, contains `"bar_ql"`, does NOT contain `"silent rest-filled"` (the pruned phrase). Names the load-bearing rules without depending on exact wording.
   - **Re-generation smoke (deferred to user).** Listed in §Manual smoke below: pick one blues snippet, run `/generate` against it in Obsidian, eyeball the resulting Python facet for absence of the pruned patterns (manual silent-part construction, position-based manual merging).

## Implementation notes — Phase C (content bug fixes, TDD HARD RULE)

### Phase C investigation step

Before TDD-failing-first, confirm the bugs are reproducible in the current content.

1. **Bar-arithmetic shortfall investigation.** For each blues snippet, parse its Python facet, locate every `stream.Measure` construction, and compute the sum of `quarterLength` values appended to it. Report any Measure where the sum ≠ `bar_ql` (6.0 for 12/8). This produces a concrete list of (file, measure_number, actual_total) that need fixing. If the investigation finds zero shortfalls, Phase C's bar-arithmetic portion becomes a no-op — the rumor was stale, document and skip.

2. **Mode-forcing investigation.** For each blues snippet that calls `pentatonic(...)`, check whether the `mode=` kwarg is hardcoded (e.g., `mode='minor'`) regardless of `found_key.mode`. Report each instance. If hardcoded, the question is whether the hardcoding is intentional (blues vocal melody uses minor pentatonic over major chords by genre convention) or accidental.

3. **Reproduce the bugs in a failing test BEFORE applying fixes.**

### Phase C TDD §1.1 — tests added pre-fix

Create `~/projects/forge/tests/music/test_blues_content_invariants.py` (new file). Inline the relevant snippet bodies as Python string fixtures (per cc-prompt-queue.md §80 fixture-drift rider: include a static drift-check at test-start that reads the actual snippet file from `~/projects/forge-music/blues/` and asserts the inlined body matches the on-disk version, so fixture drift fails the suite rather than silently passing against stale fixtures).

Test cases:

**Cases for the bar-arithmetic invariant** (one per snippet identified in the investigation step):

1. `test_<snippet>_bars_sum_to_bar_ql` — for each blues snippet that constructs `stream.Measure` objects directly, execute its `compute(context)` against a stub `context.compute("form")` returning a known 12/8 Score, then iterate each `stream.Measure` in the result and assert `sum(el.quarterLength for el in measure.notesAndRests) == bar_ql` (which is `6.0` for 12/8). Pre-fix: this fails for each snippet with a shortfall.

**Cases for the mode-handling decision** (Phase C investigation determines whether these are needed):

2. `test_<snippet>_minor_pentatonic_over_form_key` — if mode forcing is determined to be intentional (blues convention), the test asserts that when `form` returns a Score in any mode (major or minor or modal), the blues snippet's vocal line uses minor pentatonic scale degrees. This LOCKS IN the intentional behavior so it doesn't get "fixed" accidentally by a future content drain.

3. `test_<snippet>_documents_mode_override` — assert that the snippet's English facet contains an explicit note explaining the deliberate minor-pentatonic override regardless of form's mode. Pre-fix: fails because no English facet documents the override; the override looks like a bug on read.

Pre-fix run:
```bash
cd ~/projects/forge && pytest -q tests/music/test_blues_content_invariants.py
```

Capture verbatim output. Cases 1 should fail with `AssertionError: measure N total = X, expected 6.0` for each shortfall. Cases 2 may pass against current code (if mode forcing is already intentional and consistent); case 3 will fail (no English facet documents the override yet).

### Phase C TDD §1.3 — fixes

**Bar-arithmetic fixes** (Approach B — surgical):

For each `(file, measure_number, actual_total)` from the investigation, find the missing duration and add a trailing `note.Rest(quarterLength=<missing>)` to the measure construction. Do NOT rewrite melodic content; do NOT redistribute existing note durations. Surgical only.

Example transformation in `vocal_phrase_b.md` Python facet (hypothetical):
```python
# Before — bar 3 sums to 5.5, short by 0.5
m3 = stream.Measure(number=3)
m3.insert(0, note.Note('B4', quarterLength=1.5))
m3.insert(1.5, note.Note('A4', quarterLength=2.0))
m3.insert(3.5, note.Note('G4', quarterLength=2.0))
part.append(m3)

# After — bar 3 sums to 6.0 with trailing rest
m3 = stream.Measure(number=3)
m3.insert(0, note.Note('B4', quarterLength=1.5))
m3.insert(1.5, note.Note('A4', quarterLength=2.0))
m3.insert(3.5, note.Note('G4', quarterLength=2.0))
m3.insert(5.5, note.Rest(quarterLength=0.5))  # pad to bar_ql
part.append(m3)
```

The trailing rest is the safest fix — preserves all existing notes' timings. If the investigation finds shortfalls that aren't trivially paddable at the end (e.g., a missing 0.5 ql in the middle), report in feedback and apply the minimal surgical fix that yields a 6.0-total measure.

**Mode-handling fix** (documentation, not behavior change):

Add to each affected snippet's English facet a sentence like: "Uses minor pentatonic regardless of form's declared mode — this is the blues convention: minor pentatonic over the major-mode chord progression. Do not 'fix' the mode= kwarg to track form.mode."

This is purely documentation. The Python facet's `pentatonic(ks, mode='minor', ...)` stays unchanged.

### Phase C TDD §1.4 — post-fix run

```bash
cd ~/projects/forge && pytest -q tests/music/test_blues_content_invariants.py
```

All cases pass. Capture verbatim.

### Phase C TDD §1.5 — full suite

```bash
cd ~/projects/forge && pytest -q
cd ~/projects/forge-client-obsidian && npm test
```

Capture both verbatim. Engine count grows by however many new test cases landed; plugin count unchanged (Phase C doesn't add plugin tests).

### Phase C commit

Commit message prefix `[2026-06-02-0025-music-content-polish-3-phase] Phase C — ` followed by a one-line summary (e.g., "fix bar-arithmetic shortfalls in 3 blues snippets; document minor-pentatonic override convention"). Push to `origin/main` for both `forge` and `forge-music`. Mirror modified blues snippets to `~/projects/forge-client-obsidian/assets/vaults/forge-music/blues/`. Bump forge-music vault version 0.3.2 → 0.3.3. Bump plugin manifest if not already bumped this drain.

## Release

After all three phases land and commit:

- Build plugin release zip: `cd ~/projects/forge-client-obsidian && npm run build && npm run release-zip`. Capture path, size, SHA-256.
- Clean-vault smoke per cc-prompt-queue.md §141: extract the zip into a fresh tmpdir, confirm: blues subdir intact (8 files OR 8-minus-any-scaffold-deletions), `assets/engine/forge/music/llm_prompt.py` matches the updated fragment, manifest at the new version.
- `gh release create v<new>` with the zip attached.
- SHA round-trip via `gh release view --json assets --jq` per v0.2.25 protocol-comment §2 (the cleaner pattern that replaced the curl+grep approach).

## Tests

**Auto-verifiable by CC (run all; report results):**

- Phase A: grep outputs (bare-ref inventory, external-caller audit). If scaffolds deleted, the new `test_snippet_resolution` case asserting `blues/form` exists but top-level `form` does NOT exists in the indexed library.
- Phase B: `python -c "from forge.music.llm_prompt import MUSIC_PROMPT_FRAGMENT"` succeeds; updated `forge/tests/test_llm_prompts.py` cases assert specific phrases present/absent.
- Phase C: TDD §1.1–§1.5 verbatim outputs per cc-prompt-queue.md bug-fix structure.
- Full suites at end: `pytest -q` in forge, `npm test` in forge-client-obsidian. Report `X/X` counts for both.
- Engine-bundle drift verifications: `diff` between `~/projects/forge/forge/music/{llm_prompt,lib}.py` and `~/projects/forge-client-obsidian/assets/engine/forge/music/{llm_prompt,lib}.py` post-Phase-B. Both should produce no output.
- Vault-bundle drift verification: `diff -r ~/projects/forge-music/ ~/projects/forge-client-obsidian/assets/vaults/forge-music/`. Should produce no output post-all-phases.
- Clean-vault smoke before tagging release.

**Deferred to user (Obsidian-context):**

- Install the new plugin version into `~/forge-vaults/test1` via `VAULT=~/forge-vaults/test1 bash scripts/install-latest.sh`. Confirm version line.
- Reload Obsidian, confirm `forge-music/blues/` re-extracted (and any scaffold deletions visible in the file tree).
- Re-run Forge-click on `blues/song.md` post-Phase-C — confirm no compute errors and (this is the v0.2.27-confirmed path) blues compute still returns a Score.
- Open one blues snippet via `/generate` (right-click → "Forge: Regenerate Python from English" or whatever the gesture is) and eyeball the resulting Python facet for absence of pruned patterns (no manual silent-part construction).
- Visual quality check on the rendered MusicXML output if Phase C's bar-arithmetic fixes affect engraving.

## Out of scope

- Melodic rewrites in blues snippets (preserve compositional intent).
- Migrating measure construction from manual `stream.Measure()` to `lib.bar()` (defensive against future drift; separate prompt).
- Snippet-by-snippet rewrites to use `lib.voices()` / `lib.sequence()` where currently using `stream.Score()` + manual part assembly (separate prompt).
- Promoting `forge-music/blues/` to a sub-library with its own `forge.toml` (still deferred — depends on whether a second sub-content-area emerges).
- Forge-core's three cross-cutting follow-ups (auto re-extract on `forge.toml` change, engine-bundle drift check, micropip protocol rider). Those need forge-core ownership.
- Any `forge-moda` work.
- Constitution edits.

## Report when done

Standard cc-prompt-queue.md feedback structure, plus per-phase sections:

**§Phase A:**
- Bare-ref inventory (per-file table: file → bare names → resolves-to → action).
- External-caller audit for top-level scaffolds (grep output verbatim).
- Decision-tree branch taken (scaffolds deleted / kept / partial).
- Files modified or deleted.
- Commit SHA + version bump (if any).

**§Phase B:**
- Pre-fragment-text and post-fragment-text diffs (full diff of `MUSIC_PROMPT_FRAGMENT` content; not a description).
- Per-rule classification (kept / pruned / tightened / added).
- `test_llm_prompts.py` cases added or updated.
- Bundle-mirror diff confirmation (both `llm_prompt.py` files byte-equal).
- Commit SHA + version bump (if any).

**§Phase C:**
- Investigation findings (bar-arithmetic per-snippet shortfall table; mode-forcing per-snippet status).
- TDD §1.1–§1.5 per cc-prompt-queue.md bug-fix structure. Verbatim terminal output, not summaries.
- Files modified.
- Commit SHA + version bump.

**§Release:**
- Plugin zip path, size, SHA-256.
- Clean-vault smoke output (file listing of bundled blues subdir, llm_prompt.py grep for new/absent phrases, manifest version).
- GH Release URL.
- SHA round-trip verification.
- `releases/latest` confirms new version.

**§Smoke split:**
- Auto-verified-by-CC list (enumerated).
- Deferred-to-user list (enumerated).

**§Follow-ups noted but not built.**

**§Protocol comments for driver** — observations on how the 3-phase bundling worked. Specifically: did the phased commits actually allow partial-success recovery, or did it end up being all-or-nothing? Did Phase C's TDD discipline interact cleanly with Phases A+B already-committed? Worth noting for future cowork-protocol guidance on bundled-prompt shapes.

## Don'ts

- **Don't conflate phase commits.** Each phase commits independently and pushes before the next phase begins. This is the failure-isolation guarantee. If Phase C fails, A and B are already shipped.
- **Don't skip TDD for Phase C.** Phase C is bug-fix shape; TDD HARD RULE applies. Failing-test-first is mandatory. If the failing tests pass against current code (e.g., the bar-arithmetic rumor was stale), do NOT ship a speculative fix — pivot to investigation or close as a no-op.
- **Don't rewrite blues melodic content.** Bar-arithmetic fixes are surgical (add trailing rests); they do not redistribute or replace existing notes.
- **Don't delete top-level scaffolds without the Phase A external-caller audit.** If grep finds qualified `forge-music/form` references anywhere, leaving the scaffold is the safer call.
- **Don't add new rules to `MUSIC_PROMPT_FRAGMENT` beyond what Phase B's classification names.** The fragment is already long; only add the v0.2.26 caller-scoped resolution rule explicitly identified in Phase B.
- **Don't modify `lib.py`.** Phase B touches `llm_prompt.py` only. Behavior changes to the helpers are out of scope.
- **Don't `gh release create` for the forge-music vault repo.** That repo has no release convention. Tag + push only.
- **Don't run any destructive git op** (force-push, reset --hard, branch deletion).
- **Don't skip the per-phase commit + push** even if you think it'd be faster to commit at the end. The failure-isolation guarantee is the whole point of phasing.
