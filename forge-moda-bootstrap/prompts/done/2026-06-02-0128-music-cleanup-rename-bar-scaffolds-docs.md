<!-- author: forge-music-cowork
     second-pass review: requested
     focus: Phase A renames a public helper in forge.music.lib (pentatonic
     → minor_pentatonic + major_pentatonic) — forge-core may want eyes on
     deprecation-alias vs hard-rename, since future music vaults could
     depend on the current name. Phase C deletes vault content (top-level
     scaffolds) — vault-content lifecycle is constitution-adjacent. -->

# Music vault cleanup — 4-phase (helper rename, lib.bar migration, scaffold deletion, README refresh)

## Scope

Five cleanup items batched into four phases. Each phase commits + pushes
independently per the v0.2.28 bundled-phase precedent; if a later phase
fails, earlier phases are already shipped.

**Phase A — Rename `pentatonic` to `minor_pentatonic` + `major_pentatonic` (item #1) AND document `lib.sequence`'s instrument-aware grouping (item #4).** Both touch `forge/music/lib.py` + the bundled mirror; one combined commit for the engine-side change.

**Phase B — Blues snippet migration (item #2 + tail of #1).** For each blues snippet that calls `pentatonic(...)`: rename to `minor_pentatonic(...)` or `major_pentatonic(...)` based on the existing kwarg. For each snippet that constructs `stream.Measure` manually with a trailing-rest pad: migrate to `lib.bar(*notes, time_signature=ts)` where applicable. Remove the now-obsolete "Do NOT 'fix' the `mode='minor'` kwarg" English-facet notes — function names now self-document.

**Phase C — Delete top-level scaffolds (item #3).** Delete `~/projects/forge-music/form.md` and `~/projects/forge-music/twelve_bar_blues_progression.md` plus their bundle mirrors. The v0.2.28 Phase A audit already confirmed these are inert in production; this drain executes the deletion. Auto-mode classifier may flag — the prompt explicitly authorizes the deletion; CC should proceed (with AskUserQuestion fallback if the classifier interrupts despite authorization).

**Phase D — Refresh `~/projects/forge-music/README.md` (item #5).** Update to reflect v0.3.x state: bundled distribution, `blues/` subdir, `domains = ["music"]` declaration, how to add new snippets.

What this prompt does NOT do:
- Re-design any blues melodic content.
- Touch forge-moda or any other domain.
- Add a deprecation alias for `pentatonic` (recommendation: clean rename, no alias — only callers are the blues snippets we're updating in the same drain. If forge-core's second-pass review prefers a deprecation period, restructure to keep `pentatonic` as a `warnings.warn(...)`-emitting wrapper for one release).
- Address the engine-bundle drift-check (separate forge-core prompt, repeatedly flagged).
- Refresh `forge-moda-bootstrap/forge-music-status.md` (different file; can be a separate small prompt).

## Why

The v0.2.28 Phase C fix introduced an inline `_pad(measure, total)` helper and "Do NOT 'fix' the `mode='minor'` kwarg" English-facet notes in three blues snippets. Both are defensive-prose / defensive-helper workarounds for structural issues:

- `pentatonic(ks, mode='minor')` reads as a bug when `ks.mode` is `'major'`. The English-facet "Do NOT fix" note papers over the smell instead of fixing it. Renaming to `minor_pentatonic(ks)` makes the function name *be* the documentation; the defensive English vanishes.

- `_pad(measure, total)` works around `note.Rest(quarterLength=0)` defaulting to 1.0. But `lib.bar()` already handles trailing-rest padding correctly (`if remaining > 0`). The Phase C fix was surgical; the architectural fix is to migrate measure construction to `lib.bar()` so the bug class can't recur.

- The top-level scaffolds (`forge-music/form.md`, `forge-music/twelve_bar_blues_progression.md`) are inert per v0.2.28 audit but on disk. New content authors see two `form.md` files and wonder which is canonical; the `/generate` inventory surfaces both. Deletion eliminates dual-file confusion.

- `lib.sequence`'s instrument-aware grouping has been re-flagged by CC in two consecutive feedback files as "either intentional voice-merging or a content bug." It's intentional. A docstring expansion + a one-sentence prompt-fragment rule closes the loop so future drains don't re-investigate.

- `forge-music/README.md` is stale relative to v0.3.x state.

Doing these together: cleanup before features, so any feature work (e.g., from the Berklee captured-thought doc — prosody, melody-shape vocabulary, etc.) lands against a cleaner baseline. Per the user's stated preference, larger combined prompts ship faster than serial small prompts.

## Files to investigate then modify

**Engine source:**
- `~/projects/forge/forge/music/lib.py` — rename `pentatonic` → `minor_pentatonic` + `major_pentatonic`; add docstring expansion to `sequence`.
- `~/projects/forge/forge/music/llm_prompt.py` — update `pentatonic` references (4 grep hits); add 1-sentence rule about `sequence`'s instrument-aware grouping.
- `~/projects/forge/tests/music/test_lib.py` — update test cases referencing `pentatonic`; add cases for `minor_pentatonic` + `major_pentatonic` if not already coverage-equivalent.

**Engine bundle mirror:**
- `~/projects/forge-client-obsidian/assets/engine/forge/music/lib.py` — sync from source post-Phase-A.
- `~/projects/forge-client-obsidian/assets/engine/forge/music/llm_prompt.py` — sync from source post-Phase-A.

**Blues vault content:**
- `~/projects/forge-music/blues/vocal_phrase_a.md` — rename `pentatonic` call(s); migrate measure construction to `lib.bar()` (remove `_pad` helper); remove obsolete "Do NOT fix" English note.
- `~/projects/forge-music/blues/vocal_phrase_b.md` — same shape (5 `pentatonic` calls per grep + check for manual measure construction + obsolete English note).
- `~/projects/forge-music/blues/guitar_solo_chorus.md` — same shape (6 `pentatonic` calls + check for manual measure construction + obsolete English note).
- Bundle mirror: `~/projects/forge-client-obsidian/assets/vaults/forge-music/blues/{vocal_phrase_a,vocal_phrase_b,guitar_solo_chorus}.md`.

**Scaffold deletion (Phase C):**
- DELETE `~/projects/forge-music/form.md`.
- DELETE `~/projects/forge-music/twelve_bar_blues_progression.md`.
- DELETE `~/projects/forge-client-obsidian/assets/vaults/forge-music/form.md`.
- DELETE `~/projects/forge-client-obsidian/assets/vaults/forge-music/twelve_bar_blues_progression.md`.

**Documentation (Phase D):**
- `~/projects/forge-music/README.md` — refresh.

**Version + release:**
- `~/projects/forge-music/forge.toml` — bump 0.3.2 → 0.3.3.
- `~/projects/forge-client-obsidian/manifest.json` — bump 0.2.28 → 0.2.29.

## Implementation notes — Phase A (rename `pentatonic` + document `lib.sequence`)

1. **Read `forge/music/lib.py`'s `pentatonic` function.** Capture its signature, body, and docstring. Note the existing parameter set (likely `ks`, `mode`, `octave_range`, possibly `include_blue`).

2. **Factor shared logic into a private helper.** Extract the body (the actual scale-degree generation) into `_pentatonic_intervals(mode, octave_range, include_blue=False)` — returns the list of intervals for the named mode. Then:
   ```python
   def minor_pentatonic(ks, octave_range=(4, 5), include_blue=False):
       """Returns minor pentatonic scale pitches over the given octave range.

       For blues vocal/instrumental lines: use this even when ks.mode is
       'major'. The minor-pentatonic-over-major-progression pattern is the
       blues convention; the function name documents the deliberate
       choice. See blues vault snippets for the canonical use.
       """
       intervals = _pentatonic_intervals(mode='minor',
                                         octave_range=octave_range,
                                         include_blue=include_blue)
       return _intervals_to_pitches(ks.tonic, octave_range, intervals)


   def major_pentatonic(ks, octave_range=(4, 5)):
       """Returns major pentatonic scale pitches over the given octave range.

       Use for content that wants to track the underlying mode (most folk,
       pop, hymnody). For blues, prefer minor_pentatonic() regardless of
       ks.mode.
       """
       intervals = _pentatonic_intervals(mode='major',
                                         octave_range=octave_range)
       return _intervals_to_pitches(ks.tonic, octave_range, intervals)
   ```
   Adjust kwargs to match the existing `pentatonic` signature. The blue-note kwarg only makes sense for the minor variant; drop it from `major_pentatonic` if present in the original.

3. **Remove the old `pentatonic` function.** Hard rename, no deprecation alias. Justification: the only callers are the blues snippets being updated in Phase B; no other vaults depend on `pentatonic`. If forge-core's second-pass review prefers a deprecation period, restructure to keep `pentatonic` as a `warnings.warn(...)`-emitting wrapper that delegates to `minor_pentatonic` or `major_pentatonic` based on its `mode` kwarg.

4. **Update `lib.sequence` docstring.** Add a paragraph explaining instrument-aware grouping:
   ```
   When sections passed to sequence have parts with different instruments
   at the same voice position, sequence groups parts by instrument
   identity rather than by position. Each unique instrument across the
   inputs becomes a separate output stave, with rest measures filling
   sections where that instrument is inactive.

   Example: sequence(chorus, chorus, solo_chorus, chorus) where each
   chorus = [Piano, Vocalist] and solo_chorus = [Piano, ElectricGuitar]
   produces 3 output staves (Piano continuous across all 4 sections,
   Vocalist active in choruses with rests in solo_chorus's slot,
   ElectricGuitar active in solo_chorus with rests in chorus slots).
   This is the intended behavior for mixed-instrument compositions —
   not a content bug.
   ```

5. **Update `forge/tests/music/test_lib.py`.** Find existing test cases that use `pentatonic(..., mode='minor')` and rename to `minor_pentatonic(...)`. Find cases using `pentatonic(..., mode='major')` and rename to `major_pentatonic(...)`. Add new cases for each new function if coverage gaps exist (e.g., `test_minor_pentatonic_includes_blue_note`, `test_major_pentatonic_no_blue_note_kwarg`).

6. **Update `forge/music/llm_prompt.py` MUSIC_PROMPT_FRAGMENT.** Find the 4 `pentatonic` mentions (per grep at prompt-authoring time). Update examples to reference `minor_pentatonic` / `major_pentatonic`. Add a sentence to the lib.sequence rule mentioning instrument-aware grouping (echo the docstring's example shape, condensed).

7. **Mirror to bundle.** `cp forge/music/lib.py forge-client-obsidian/assets/engine/forge/music/lib.py` and same for `llm_prompt.py`. Verify with `diff` — should produce no output.

8. **Run `pytest -q` in forge.** All tests pass. Report `X/X` count.

9. **Commit Phase A.** Message: `[2026-06-02-0128-music-cleanup-rename-bar-scaffolds-docs] Phase A — pentatonic → minor_pentatonic + major_pentatonic rename; lib.sequence docstring + prompt rule for instrument-aware grouping`. Commit + push for both `forge` and `forge-client-obsidian`. No version bump on forge; bump plugin manifest at end of drain only.

## Implementation notes — Phase B (blues snippet migration)

1. **Per-snippet investigation.** For each of `vocal_phrase_a.md`, `vocal_phrase_b.md`, `guitar_solo_chorus.md`:
   - Grep for `pentatonic(` — list each call site with line number.
   - Grep for `stream.Measure(` AND `_pad(` AND `note.Rest(quarterLength=bar_ql` — identify manual measure construction with trailing-rest pad.
   - Identify the "Do NOT 'fix' the `mode='minor'` kwarg" English-facet notes.

2. **Rename pentatonic calls.** For each call site found in step 1, replace `pentatonic(ks, mode='minor', ...)` with `minor_pentatonic(ks, ...)` and `pentatonic(ks, mode='major', ...)` with `major_pentatonic(ks, ...)`. Drop the `mode=` kwarg entirely from the call sites.

3. **Migrate manual measure construction to `lib.bar()` where applicable.**
   - For `vocal_phrase_a.md` (has `_pad` helper): replace each
     ```python
     m = stream.Measure(number=N)
     m.append(n1)
     m.append(n2)
     ...
     _pad(m, total)
     part.append(m)
     ```
     with
     ```python
     part.append(bar(n1, n2, ..., time_signature=ts, number=N))
     ```
     Delete the `_pad` helper definition once all call sites are migrated.
   - For other snippets: only migrate IF the snippet has the same manual `stream.Measure` + append + pad pattern AND the migration doesn't change observable behavior (measure count, total quarterLengths). If a snippet uses `m.insert(0, ...)` or other non-trivial offset placement, leave it alone — `lib.bar()` uses simple sequential appends.
   - Document each migration decision in feedback: snippet → "migrated" or "skipped because X".

4. **Remove obsolete "Do NOT fix" English-facet notes.** For each of the three snippets, find the sentence introduced in v0.2.28 Phase C that reads "Uses minor pentatonic regardless of [[form]]'s declared mode... Do NOT 'fix' the `mode='minor'` kwarg to track `found_key.mode`; the override is intentional." Replace with a shorter, function-name-grounded version: "Uses `minor_pentatonic(...)` — the minor-pentatonic-over-major-progression pattern is the blues convention." The function name now carries the explanation; the defensive imperative is no longer needed.

5. **Verify blues snippet bar arithmetic still passes.** Run `pytest -q tests/music/test_blues_content_invariants.py` — the v0.2.28 tests should still pass post-migration. If they fail, the migration changed observable behavior — investigate before proceeding.

6. **Add a shape-preservation test.** New test case in `tests/music/test_blues_content_invariants.py`:
   ```python
   def test_vocal_phrase_a_returns_score_with_4_measures():
       """Phase B migration to lib.bar() must preserve measure count.
       Pre-migration shape: Score with 1 Part containing 4 Measures."""
       result = run_music_block(VOCAL_PHRASE_A_BODY, with_form_stub=True)
       assert isinstance(result, stream.Score)
       parts = list(result.getElementsByClass(stream.Part))
       assert len(parts) == 1
       measures = list(parts[0].getElementsByClass(stream.Measure))
       assert len(measures) == 4
   ```
   Add analogous shape-preservation tests for `vocal_phrase_b` and `guitar_solo_chorus` if their measure counts are known constants.

7. **Mirror to bundle.** Copy each modified blues snippet from `~/projects/forge-music/blues/<file>.md` to `~/projects/forge-client-obsidian/assets/vaults/forge-music/blues/<file>.md`. Verify with `diff -r`.

8. **Run full suite.** `pytest -q` in forge and `npm test` in forge-client-obsidian. Both should pass; engine count grows by however many shape-preservation tests landed.

9. **Commit Phase B.** Message: `[2026-06-02-0128-music-cleanup-rename-bar-scaffolds-docs] Phase B — blues snippets: rename pentatonic calls, migrate measure construction to lib.bar() where applicable, remove obsolete defensive English`. Commit + push for `forge`, `forge-music`, `forge-client-obsidian`. Bump `forge-music/forge.toml` version 0.3.2 → 0.3.3 + tag.

## Implementation notes — Phase C (scaffold deletion)

1. **Write a failing test first (TDD HARD RULE applies — Phase C is bug-fix shape: "fix the dual-file confusion by removing the inert files").**
   New test in `forge/tests/test_snippet_resolution.py` (or new file `forge/tests/music/test_no_top_level_scaffolds.py`):
   ```python
   def test_forge_music_has_no_top_level_form_or_progression():
       """v0.3.3: top-level scaffolds removed. Only the blues subdir
       versions of form and twelve_bar_blues_progression remain. This
       test locks in the deletion against accidental re-introduction."""
       registry = build_registry_from_path("~/projects/forge-music/")
       vault = registry.get_vault("forge-music")
       assert "form" not in vault, (
           "top-level forge-music/form.md should be deleted; "
           "only blues/form.md should remain"
       )
       assert "twelve_bar_blues_progression" not in vault, (
           "top-level forge-music/twelve_bar_blues_progression.md should "
           "be deleted; only blues/twelve_bar_blues_progression.md should "
           "remain"
       )
       assert "blues/form" in vault, "blues/form.md must still exist"
       assert "blues/twelve_bar_blues_progression" in vault, (
           "blues/twelve_bar_blues_progression.md must still exist"
       )
   ```
   Run pre-deletion: should fail (top-level form is currently indexed).

2. **Delete the four files.**
   ```bash
   rm ~/projects/forge-music/form.md
   rm ~/projects/forge-music/twelve_bar_blues_progression.md
   rm ~/projects/forge-client-obsidian/assets/vaults/forge-music/form.md
   rm ~/projects/forge-client-obsidian/assets/vaults/forge-music/twelve_bar_blues_progression.md
   ```
   **Explicit authorization for the deletion:** the v0.2.28 Phase A external-caller audit confirmed no production code depends on the top-level qualified IDs `forge-music/form` or `forge-music/twelve_bar_blues_progression`. Documented in `prompts/feedback/2026-06-02-0025-music-content-polish-3-phase.md` §Phase A. If auto-mode classifier flags the deletion despite this authorization, use `AskUserQuestion` with "Phase C-authorized deletion per v0.2.28 audit; proceed?" as the question and "proceed" as the recommended-first option.

3. **Run the new test.** Should now pass.

4. **Run full suite.** `pytest -q` in forge. All tests pass.

5. **Commit Phase C.** Message: `[2026-06-02-0128-music-cleanup-rename-bar-scaffolds-docs] Phase C — delete inert top-level scaffolds (form.md, twelve_bar_blues_progression.md); blues/ versions are canonical`. Commit + push for `forge`, `forge-music`, `forge-client-obsidian`. Bump `forge-music/forge.toml` version 0.3.3 → 0.3.4 + tag (deletion is a content change).

## Implementation notes — Phase D (README refresh)

1. **Read current `~/projects/forge-music/README.md`.** Identify stale content (any v0.2.x references, references to deleted scaffolds, missing v0.3.x context).

2. **Update sections.** Cover:
   - **What forge-music is** (one paragraph): a Forge vault for music composition, distributed bundled with the forge-client-obsidian plugin. Activated by declaring `domains = ["music"]` in a user vault's `forge.toml`.
   - **Layout** (one paragraph + tree): top-level has `forge.toml`, `README.md`, `LICENSE`, `NOTICE`. `blues/` subdir contains the 8 blues snippets. No top-level snippet files post-v0.3.4 deletion.
   - **How to use** (numbered steps, brief): declare `domains = ["music"]`; reload Obsidian; the bundled vault extracts into `<vault>/forge-music/`; Forge-click any blues snippet.
   - **Adding new snippets** (paragraph): write a new `.md` file in the user vault root (or in `blues/`); follow snippet conventions; click Forge.
   - **Music domain globals available** (one paragraph or bullet list): `music21`, `stream`, `note`, `chord`, `meter`, `key`, `tempo`, `pitch`, `duration`, `instrument`, `harmony`, `roman`, plus composition helpers `bar`, `voices`, `sequence`, `repeat`, `minor_pentatonic`, `major_pentatonic`.

3. **No version bump.** README is docs; vault version was bumped in Phase C.

4. **Mirror to bundle.** `cp ~/projects/forge-music/README.md ~/projects/forge-client-obsidian/assets/vaults/forge-music/README.md`. Verify with `diff` — should produce no output.

5. **Commit Phase D.** Message: `[2026-06-02-0128-music-cleanup-rename-bar-scaffolds-docs] Phase D — README refresh for v0.3.x state`. Commit + push for `forge-music` and `forge-client-obsidian`. No tag (README change, vault version already 0.3.4 post-Phase-C).

## Release

After all four phases land and commit:

- Build plugin release zip: `cd ~/projects/forge-client-obsidian && npm run build && npm run release-zip`. Capture path, size, SHA-256.
- Plugin manifest bump 0.2.28 → 0.2.29 (single bump at end; no per-phase manifest bumps).
- Commit plugin manifest bump separately: `[2026-06-02-0128-music-cleanup-rename-bar-scaffolds-docs] v0.2.29 — bundle music cleanup (rename + lib.bar migration + scaffold deletion + README)`.
- Clean-vault smoke per cc-prompt-queue.md §141: extract zip into fresh tmpdir, confirm:
  - `assets/engine/forge/music/lib.py` contains `minor_pentatonic` and `major_pentatonic`, does NOT contain `def pentatonic(` (sanity check that rename landed in bundle).
  - `assets/vaults/forge-music/blues/` has 8 files.
  - `assets/vaults/forge-music/` does NOT contain `form.md` or `twelve_bar_blues_progression.md` at top level.
  - Manifest at v0.2.29.
- `gh release create v0.2.29` with the zip attached.
- SHA round-trip via `gh release view --json assets --jq` per v0.2.25 protocol-comment §2.

## Tests

**Auto-verifiable by CC (run all; report results):**

- Phase A: `pytest -q forge/tests/music/test_lib.py` post-rename — all updated cases pass; new `minor_pentatonic` / `major_pentatonic` cases pass.
- Phase B: `pytest -q forge/tests/music/test_blues_content_invariants.py` — v0.2.28 bar-arithmetic tests still pass post-migration; new shape-preservation tests pass.
- Phase C TDD: failing test pre-deletion → passes post-deletion. Verbatim per cc-prompt-queue.md §1.1–§1.5 structure.
- Full suites at end: `pytest -q` in forge (engine count grows by Phase A's new test cases + Phase B's shape-preservation cases + Phase C's 1 test); `npm test` in forge-client-obsidian (unchanged from v0.2.28's 148).
- Bundle-mirror drift checks:
  - `diff forge/music/lib.py forge-client-obsidian/assets/engine/forge/music/lib.py` — no output post-Phase-A.
  - `diff forge/music/llm_prompt.py forge-client-obsidian/assets/engine/forge/music/llm_prompt.py` — no output post-Phase-A.
  - `diff -r forge-music/blues/ forge-client-obsidian/assets/vaults/forge-music/blues/` — no output post-Phase-B.
  - `ls forge-client-obsidian/assets/vaults/forge-music/` post-Phase-C — no `form.md`, no `twelve_bar_blues_progression.md`, blues/ present.
  - `diff forge-music/README.md forge-client-obsidian/assets/vaults/forge-music/README.md` — no output post-Phase-D.
- Clean-vault smoke before tagging release.

**Deferred to user (Obsidian-context):**

- Install plugin v0.2.29 via `VAULT=~/forge-vaults/test1 bash ~/projects/forge-client-obsidian/scripts/install-latest.sh`. Confirm version.
- Delete extracted `~/forge-vaults/test1/forge-music/` so `ensureBundledForgeMusic` re-extracts the new v0.3.4 bundle (the welcome.ts short-circuit otherwise keeps the v0.3.2 copy).
- Full Obsidian relaunch (Cmd-Q then reopen).
- Confirm `~/forge-vaults/test1/forge-music/` shows: blues/ subdir with 8 files; README.md; LICENSE; NOTICE; forge.toml. NO top-level form.md or twelve_bar_blues_progression.md.
- Forge-click `forge-music/blues/song.md` — confirm compute succeeds with the renamed helpers (no `NameError: name 'pentatonic' is not defined`).
- Optionally Forge-click `forge-music/blues/vocal_phrase_a.md` — confirm `lib.bar()` migration produces visually identical engraving to v0.2.28 (bars same width, same note positions).

## Out of scope

- Adding new music helpers (counterpoint, contour, etc. from the Berklee captured-thought doc).
- Engine-bundle drift-check (forge-core, repeatedly flagged).
- Auto re-extract bundled libraries on forge.toml change (v0.2.27 follow-up, still pending).
- DOMAIN_AVAILABILITY fail-loud registry (v1.0 audit, repeatedly flagged).
- forge-moda or any other domain.
- forge-music-status.md refresh (separate small prompt if desired).
- Changes to blues melodic content (only rename + structural migration; preserve all notes, durations, lyrics).
- Adding a deprecation alias for `pentatonic` (recommendation: clean rename — if forge-core's second-pass review prefers deprecation, restructure).

## Report when done

Standard cc-prompt-queue.md feedback structure, plus per-phase sections:

**§Phase A:**
- `pentatonic` rename diff (full diff of lib.py pre/post).
- `lib.sequence` docstring + MUSIC_PROMPT_FRAGMENT rule diffs.
- Test cases updated + added (list).
- Bundle-mirror diff confirmation.
- Commit SHA + push confirmation.

**§Phase B (per-snippet):**
- For each of `vocal_phrase_a.md`, `vocal_phrase_b.md`, `guitar_solo_chorus.md`:
  - `pentatonic` call sites renamed (count + before/after).
  - Manual measure construction migrated to `lib.bar()` OR skipped (with reason).
  - Obsolete "Do NOT fix" English-facet note removed (before/after).
- `_pad` helper removal confirmation (if applicable).
- Shape-preservation test results.
- Existing v0.2.28 bar-arithmetic tests confirm still passing.
- Commit SHA + push.

**§Phase C (TDD HARD RULE):**
- §1.1 — failing test added.
- §1.2 — verbatim pre-deletion test output (FAIL).
- §1.3 — deletion executed (files removed); if AskUserQuestion was needed, document the question + answer.
- §1.4 — verbatim post-deletion test output (PASS).
- §1.5 — full-suite output.

**§Phase D:**
- README diff (full pre/post).
- Bundle-mirror confirmation.
- Commit SHA + push.

**§Release:**
- Plugin zip path, size, SHA-256.
- Clean-vault smoke output (all 4 sub-checks listed in §Release).
- GH Release URL + SHA round-trip.

**§Smoke split:**
- Auto-verified-by-CC enumerated.
- Deferred-to-user enumerated.

**§Follow-ups noted but not built.**

**§Protocol comments for driver** — observations on how the 4-phase bundling worked, especially: did Phase B (the longest phase) intersect cleanly with Phase A's renamed helpers? Did Phase C's TDD discipline (failing-first for a deletion) feel natural or forced? Worth flagging for cowork-protocol calibration.

## Don'ts

- **Don't conflate phase commits.** Each phase commits + pushes before the next begins. Failure isolation. Phase A first (engine), then B (blues snippets, depends on A), then C (deletion, independent), then D (README, independent), then release.
- **Don't add a deprecation alias for `pentatonic` without explicit forge-core direction.** Clean rename is the recommendation; deprecation alias is a forge-core-second-pass call.
- **Don't migrate measure construction to `lib.bar()` if it would change observable behavior.** Skip + document. Shape-preservation tests are the load-bearing check.
- **Don't change blues melodic content.** Notes, durations, rests, lyrics all preserved. Only structural patterns change (helper names, measure-construction idiom).
- **Don't skip the failing-test-first step in Phase C.** Even for deletion, TDD-failing-first locks in the regression guard against accidental re-introduction.
- **Don't proceed past Phase C if AskUserQuestion is needed and the user denies.** Route to questions/ with the question + context. Phases A, B, D would already be committed; Phase C is the only one that needs the user decision.
- **Don't `gh release create` for forge-music vault.** Tag + push only on that repo. Plugin gets the GH Release.
- **Don't run destructive git ops** (force-push, reset --hard, branch delete) beyond the file deletions explicitly authorized in Phase C.
- **Don't bundle the manifest bump into per-phase commits.** Single manifest bump at end-of-drain, after all four phases land. Per v0.2.28 protocol-comments §6.
