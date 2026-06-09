<!-- author: forge-music-cowork
     second-pass review: not requested — content decomposition; constitution untouched
     focus: extract Murmuration's 8 sections into reusable named snippets
     PREVIEW MODE: no commit, no push, no bundle, no release; revert via git restore -->

# Percussion Lab — decompose Murmuration into 8 section snippets (PREVIEW; no commit)

## CRITICAL: Preview-only mode — no git side effects

This prompt is an exploratory decomposition. The user wants to listen to the refactored Murmuration and confirm behavior preservation before committing. CC's git discipline:

- **DO NOT `git commit`** anything in any repo.
- **DO NOT `git push`** anything.
- **DO NOT tag** anything.
- **DO NOT bundle into the plugin** (no `sync-engine-bundle`, no `sync-bundles`).
- **DO NOT bump versions** anywhere.
- **DO NOT build a release zip.**
- **DO NOT create a GH Release.**

Deliverable = uncommitted working-tree changes in `/Users/odedfuhrmann/projects/forge-music/` and a new test file in `/Users/odedfuhrmann/projects/forge/tests/music/`. User reverts via `git restore .` + removing untracked files if the experiment doesn't land.

## Scope

Decompose `forge-music/percussion/murmuration.md` into 8 named section snippets, one per section in the existing piece, living in a new subdirectory `forge-music/percussion_lab/`. Refactor `murmuration.md`'s Python facet to be a thin orchestrator that calls the 8 sections via `context.compute`. Murmuration must produce structurally equivalent output to the current version (behavior preservation).

The 8 section snippets become the first entries in Forge's percussion vocabulary — named, callable, parameterized building blocks that can be reused by future pieces (Phase 4 will introduce a sister piece using the same 8 in a different order).

Three artifacts:

1. **`forge-music/percussion_lab/{solitary,companions,gathering,swarming,peak,dispersing,threading,resting}.md`** — 8 new action snippets, each returning a 4-bar Score (parameterized by `bars`, default 4).
2. **`forge-music/percussion/murmuration.md`** — refactored to call the 8 sections via `context.compute` (or `[[...]]` wikilinks in English facet).
3. **`forge-music/percussion_lab/README.md`** — short convention doc explaining the section-vocabulary pattern.

Plus one test file:

4. **`forge/tests/music/test_percussion_lab.py`** — content invariants + behavior-preservation tests.

## Why

User asked for blocks worthy of someone who writes music. Murmuration is currently a 250-line monolith — beautiful art but opaque as a composition surface. Decomposing into named sections turns the piece's structure into a reusable VOCABULARY: a composer can write `[[solitary]]` + `[[peak]]` + `[[resting]]` and get a different piece without re-implementing the percussion patterns.

This is the constructionist play loop the constitution (V2a v7) Mission calls out — concrete, composable, parametric building blocks that a composer can manipulate. Murmuration becomes the FIRST piece composed from those blocks. Future pieces use the same blocks in different orders.

The `percussion_lab/` subdir name signals the experimental nature — these blocks are conjectures (per the user's earlier framing), not committed canon. Sister pieces will refute or corroborate.

## Files to modify / create

All paths absolute.

**Create (new files):**
- `/Users/odedfuhrmann/projects/forge-music/percussion_lab/solitary.md`
- `/Users/odedfuhrmann/projects/forge-music/percussion_lab/companions.md`
- `/Users/odedfuhrmann/projects/forge-music/percussion_lab/gathering.md`
- `/Users/odedfuhrmann/projects/forge-music/percussion_lab/swarming.md`
- `/Users/odedfuhrmann/projects/forge-music/percussion_lab/peak.md`
- `/Users/odedfuhrmann/projects/forge-music/percussion_lab/dispersing.md`
- `/Users/odedfuhrmann/projects/forge-music/percussion_lab/threading.md`
- `/Users/odedfuhrmann/projects/forge-music/percussion_lab/resting.md`
- `/Users/odedfuhrmann/projects/forge-music/percussion_lab/README.md`
- `/Users/odedfuhrmann/projects/forge/tests/music/test_percussion_lab.py`

**Modify (existing):**
- `/Users/odedfuhrmann/projects/forge-music/percussion/murmuration.md` — refactor Python facet to thin orchestrator; update English facet with one-sentence pointer to the decomposition.

**Explicitly NOT modified:**
- `forge-music/percussion/loom.md`, `phase_cell.md`, `phase_shifter.md`, `drums_shuffle.md`
- `forge-music/blues/*` (any of it — separate domain)
- `forge-music/forge.toml` (no version bump in preview mode)
- `forge/forge/music/lib.py` (all helpers already exist)
- `forge/forge/music/llm_prompt.py` (no new rules)
- `forge/forge/core/executor.py` (no engine changes)
- `forge-client-obsidian/*` (no plugin work)
- The constitution

## Implementation notes

### Section snippet template

Each section snippet follows this shape. Frontmatter:

```yaml
---
type: action
description: <section_name>
inputs: []
snapshot_capture: false
---
```

`snapshot_capture: false` because the returned Score holds music21 Instrument instances with bound method references (per the `_force_perc_channel` lambda pattern); same opt-out as `phase_cell.md`.

English facet — NARRATIVE-FLAVORED SPEC style (per the forge-music style emerging from this work):
- One paragraph naming the section's artistic identity (the "what does this section EVOKE" line).
- One paragraph listing the mechanical contents (which instruments play, what patterns, what dynamic level).
- A note about the `bars` parameter (default 4; elongate by repeating the bar sequence cyclically; values <4 truncate to the first N bars).

Python facet — `def compute(context, bars=4):` signature. Returns a `music21.stream.Score` with only the instrument parts that ACTUALLY play in this section (no all-rest staves). The orchestrator at murmuration.md sequences sections together; music21's instrument-grouping in `voices()` will merge same-instrument parts across sections and pad inactive sections with rests automatically (as confirmed in the blues drum preview feedback).

Use the v0.2.35 percussion factories (`kick()`, `snare()`, `closed_hihat()`, `open_hihat()`, `low_tom()`, `mid_tom()`, `crash_cymbal()`) — NOT raw `instrument.BassDrum()` / `instrument.SnareDrum()` etc. The factories carry `_force_perc_channel` which fixes MuseScore rendering of multi-percussion-part scores (per v0.2.35 fix).

Use `with_velocity(notes, profile, mark_dynamics=True)` per the v0.3.8 helper extension — section's dynamic mark appears on the kick part's first note (anchor pattern from drum_chorus.md). When the section's velocity profile is `'decrescendo'`, `with_velocity` inserts a hairpin spanner — visible in score, audible in MIDI.

### Bars parameter semantics

- `bars=4` is the canonical 4-bar pattern from current Murmuration (the source of truth).
- `bars=N` (N > 4): repeat the 4-bar pattern cyclically. For section `S` with 4 bars `[B0, B1, B2, B3]`, output is `[B0, B1, B2, B3, B0, B1, B2, B3, ...]` for N total bars. The dynamic-mark goes on the FIRST bar's kick (still one mark per section, regardless of length).
- `bars=N` (N < 4): take the first N bars `[B0, ..., B_{N-1}]`. Dynamic-mark still on first.
- `bars=0`: return empty Score (no parts). Edge case for completeness.

### Per-section schedules

Extract these directly from the current `forge-music/percussion/murmuration.md` Python facet. CC reads that file and lifts each section's hit specs verbatim. Here's a quick reference (read the source for exact tuples):

| Section | Parts active | Pattern summary | Velocity profile |
|---|---|---|---|
| solitary | kick | beats 1, 3 each bar | `70` (int → mp band) |
| companions | kick, closed_hihat | kick on 1, 3; hihat quarters | `'human'` (mf) |
| gathering | kick, closed_hihat, snare | kick varies; hihat eighths; snare ghosts on and-of-each | `'human'` |
| swarming | kick, closed_hihat, open_hihat, snare, low_tom, mid_tom | full kit minus crash; syncopated; toms enter | `'human'` |
| peak | kick, open_hihat, snare, low_tom, mid_tom, crash | kick on all 4; 16th rolls on snare; crash bars 1+3 | `'accent'` (ff) |
| dispersing | kick, closed_hihat, open_hihat, snare, low_tom, mid_tom | thinning; hairpin decrescendo | `'decrescendo'` |
| threading | kick, closed_hihat, snare | quieter return; hihat quarters; snare on and-of-2, and-of-4 | `'human'` |
| resting | kick | bar 1: beats 1, 3; bars 2-4: beat 1 only | `50` (int → p band) |

CC must lift the EXACT tuples from current `murmuration.md` lines 100-225 (the per-instrument section schedules) and place them inside each section snippet. No re-imagining; behavior preservation is load-bearing.

### Murmuration orchestrator refactor

After decomposition, `murmuration.md`'s Python facet becomes:

```python
def compute(context):
    return sequence(
        context.compute("percussion_lab/solitary"),
        context.compute("percussion_lab/companions"),
        context.compute("percussion_lab/gathering"),
        context.compute("percussion_lab/swarming"),
        context.compute("percussion_lab/peak"),
        context.compute("percussion_lab/dispersing"),
        context.compute("percussion_lab/threading"),
        context.compute("percussion_lab/resting"),
    )
```

Qualified references (`percussion_lab/solitary`) are explicit and resolution-safe across subdirs. If CC verifies that bare references (`context.compute("solitary")`) resolve cross-subdir within the same vault — fine, simplify to bare. If they don't, qualified stays. Either way, log which approach landed in §5 of feedback.

The English facet's Python section is the only structural change. Update the English facet with ONE sentence at the end: *"Decomposed into 8 callable section snippets in [[percussion_lab]] so other pieces can use the same vocabulary. The arc above is the assembled order; individual sections may be called independently with custom `bars` for piece-specific variations."*

Update the auto-Dependencies block to list the 8 section snippets via wikilinks.

### `percussion_lab/README.md`

Short convention doc. ~30-50 lines. Includes:
- What this subdir is (the percussion vocabulary lab).
- The section-snippet pattern: each snippet is opinionated about its musical identity; parameter is just `bars`; returns a Score with only active instrument parts.
- The naming convention: lowercase, single concept per snippet.
- How to add a new section (one file; document its identity; lift kit-conventional naming from lib.py).
- Note that section snippets auto-discover as chips once chip plumbing lands (per C-refined schema).

### Cross-subdir resolution verification

The forge-music vault has snippets at both `percussion/` (Murmuration's home) and now `percussion_lab/` (new sections). Murmuration's `context.compute("percussion_lab/solitary")` is the safe path — A4 qualified reference dispatches directly.

CC should verify whether BARE references (`context.compute("solitary")`) also resolve from murmuration.md to percussion_lab/solitary.md. This tests whether A4's "authoring vault" scan is recursive across subdirs. Both outcomes are valuable:

- If bare works → simplify Murmuration's orchestrator to bare references. More readable.
- If bare doesn't work → qualified stays. Flag the limitation in §5; potential constitution clarification or follow-up.

A separate test case (`test_bare_reference_resolves_cross_subdir`) sets up a minimal vault and asserts behavior. If it fails, qualified-only is the answer.

## Tests

### `forge/tests/music/test_percussion_lab.py` — required cases

All run via the `run_music_block` fixture against the user's forge-music vault.

1. `test_solitary_default_returns_4_bars_of_kick_only` — call `solitary`; assert returned Score has exactly 1 part (kick), 4 measures, no other instruments.
2. `test_solitary_bars_parameter_elongates` — call `solitary` with `bars=8`; assert 8 measures, still kick-only.
3. `test_companions_includes_kick_and_closed_hihat_only` — assert 2 parts: kick + closed_hihat.
4. `test_peak_includes_crash_cymbal` — assert crash_cymbal part exists; bar 1 contains a crash note; bar 2 does not (crash on bars 1, 3 only).
5. `test_dispersing_inserts_decrescendo_hairpin` — assert a `dynamics.Diminuendo` spanner is present in the kick part (the anchor).
6. `test_each_section_anchors_dynamic_mark_on_kick` — for each of the 8 sections, assert exactly one `dynamics.Dynamic` (or `Diminuendo`/`Crescendo`) lives on the kick part. (Validates the one-mark-per-section anchor pattern.)
7. `test_resting_bar_1_has_kicks_on_1_and_3_bars_2_4_have_only_beat_1` — verify the asymmetric pattern preserved.
8. **`test_murmuration_after_refactor_matches_pre_refactor_structure`** — load-bearing behavior preservation test. Sketch:
   - Build the canonical pre-refactor Murmuration shape from CC's reading of the source (or hardcode the expected: 7 parts total, 32 measures each, expected instrument identities `[BassDrum, SnareDrum, HiHatCymbal closed, HiHatCymbal open, TomTom low, TomTom mid, CrashCymbals]`, expected non-rest note count per part).
   - Call refactored Murmuration via `run_music_block("murmuration")`.
   - Assert structural equivalence: same number of parts, same instrument identities (by class + percMapPitch), same measure count per part, same total non-rest note count per part (±0; exact match expected).

If test 8 fails, the refactor isn't behavior-preserving. CC must fix before declaring done.

### Auto-verifiable

- `cd /Users/odedfuhrmann/projects/forge && pytest -q tests/music/test_percussion_lab.py -v` — report all cases. Then full music suite: `pytest -q tests/music/`. Then full forge suite: `pytest -q`.
- DO NOT run `npm test` in the plugin — no plugin changes.
- DO NOT run `npm run sync-engine-bundle` — explicitly off (preview mode).

## Preview / smoke instructions for user (deferred — DO NOT script these)

User runs after CC delivers. Two paths, same as the blues drum preview pattern:

### Path A — open `forge-music` source vault directly

1. In Obsidian: `File → Open vault → Open folder as vault → /Users/odedfuhrmann/projects/forge-music`
2. Open `percussion/murmuration.md`.
3. Cmd-P → `Forge: Compute`.
4. Listen. Should sound IDENTICAL to the current Murmuration (the recent v0.2.37 version with visible dynamics).
5. Check the score: 7 stacked staves still rendered, dynamic marks visible on the kick staff per section (mp / mf / ff / hairpin / mf / p).

### Path B — copy files into existing test vault

```
cp -r /Users/odedfuhrmann/projects/forge-music/percussion_lab ~/forge-vaults/test1/forge-music/percussion_lab
cp /Users/odedfuhrmann/projects/forge-music/percussion/murmuration.md ~/forge-vaults/test1/forge-music/percussion/murmuration.md
```

Then Cmd-P → `Reload app without saving` → open Murmuration → Forge-compute → listen.

### What to listen for

- **Same arc, same sound.** This is a refactor — Murmuration's MIDI output should be indistinguishable from the v0.2.37 baseline.
- **Same visible score.** Same staves, same notes, same dynamic marks.
- **The DIFFERENCE is invisible** — it's structural (now 8 section snippets backing the piece) not behavioral. If anything sounds or looks different, the refactor isn't behavior-preserving.

### What it ENABLES (Phase 4)

After Phase 2 lands, you can author a sister piece in `percussion_lab/sister_piece.md` (or similar) that sequences the 8 sections in a different order — say `companions → gathering → peak → dispersing → solitary → resting` (asymmetric, peak in the third position, gradual fade). Murmuration's vocabulary, different composition.

### Revert path

```
cd /Users/odedfuhrmann/projects/forge-music && git restore percussion/murmuration.md
cd /Users/odedfuhrmann/projects/forge-music && rm -rf percussion_lab
cd /Users/odedfuhrmann/projects/forge && rm tests/music/test_percussion_lab.py
```

If Path B was used:
```
rm -rf ~/forge-vaults/test1/forge-music/percussion_lab
# murmuration.md in test vault: Cmd-Q Obsidian → rm -rf ~/forge-vaults/test1/forge-music → reopen
```

## Out of scope

- DO NOT commit, push, tag, release, bundle, or bump versions.
- DO NOT modify any other percussion snippet (loom, phase_cell, phase_shifter, drums_shuffle).
- DO NOT modify any blues snippet.
- DO NOT add a `_chips.md` for percussion_lab — chip plumbing isn't shipped yet; the snippets will auto-discover when it lands. No `_chips.md` work in this prompt.
- DO NOT extend lib.py or llm_prompt.py.
- DO NOT touch the constitution.
- DO NOT introduce new section-vocabulary entries beyond the 8 derived from Murmuration. Sister pieces and additional sections are Phase 4+.
- DO NOT propose a sister piece in this prompt's scope. That's a future prompt.
- DO NOT migrate Murmuration's velocity profile choices — preserve `70` for Solitary and `50` for Resting (not bumped to 'human' or anything else).
- DO NOT change tempo, key signature, time signature, or section count.
- DO NOT add chip frontmatter (`chip: false` etc.) — wait for the chip schema v2 prompt to ship.

## Report when done

Write feedback to `/Users/odedfuhrmann/projects/forge-moda-bootstrap/prompts/feedback/2026-06-04-2228-percussion-lab-decompose-murmuration.md`:

0. **Preview-mode confirmation.** `git status` output for all 3 repos confirming uncommitted state. Explicit "no commits / no tags / no pushes / no bundle / no version bump" check.
1. **Files created.** All 10 paths + line counts.
2. **Files modified.** Diff of `murmuration.md` showing the orchestrator refactor.
3. **Tests.** All 8 case results + full music suite + full forge suite pass counts.
4. **Cross-subdir resolution.** Report whether bare references (`context.compute("solitary")`) resolve cross-subdir from murmuration.md. If yes, note that Murmuration uses bare; if no, qualified used.
5. **Surprises / deviations.** Anything that diverged — especially in the bars-parameter cycling behavior, edge cases (bars=0, bars=1, bars=100), or test 8 (behavior preservation).
6. **Confidence in behavior preservation.** CC's reading of whether the refactored Murmuration should produce identical output. If any uncertainty, name it.
7. **User-side preview instructions.** Reproduce paths A and B above + revert path.

## Don'ts

- Don't sneak in version bumps anywhere.
- Don't run `git add`, `git commit`, `git push`.
- Don't propose follow-ups that require commits — those are post-preview-approval drains.
- Don't re-imagine the section patterns. Lift exact tuples from current `murmuration.md`.
- Don't migrate Murmuration's instrument factories to raw classes anywhere — section snippets use `kick()` / `snare()` / `closed_hihat()` / etc. (the v0.2.35 factories).
- Don't add chip-related frontmatter; wait for the chip schema v2 prompt.
- Don't add `_chips.md` to `percussion_lab/`.
- Don't make the README more than ~50 lines. It's a convention pointer, not a manual.
