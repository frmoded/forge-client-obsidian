<!-- author: forge-music-cowork
     second-pass review: not requested — domain content, well within established percussion_lab vocabulary
     focus: author a sister piece to Murmuration using the same 8 section snippets in a different arc -->

# Percussion Lab — sister piece "Wake" (Phase 4)

## Scope

Author a second percussion composition using the existing `~/projects/forge-music/percussion_lab/` section snippets in a DIFFERENT arc than Murmuration. The piece is **`Wake`** — what's left after the murmuration has passed. The arc is asymmetric (peak briefly in the middle, weighted toward the fade) rather than Murmuration's symmetric peak-centered shape.

**File**: `~/projects/forge-music/percussion_lab/wake.md` — new file. Single action snippet that calls the 8 section snippets via `context.compute(...)` in a sequence different from Murmuration's. No new section snippets — the percussion_lab vocabulary is the constraint.

Bump `~/projects/forge-music/forge.toml` from `0.3.9` → `0.3.10`. Commit + push to forge-music main. Tag `v0.3.10`. NO plugin bundle work (the Level-2 bundle would be a separate future drain).

## Why

The percussion_lab decomposition (v0.3.9) ships 8 named section snippets (`solitary`, `companions`, `gathering`, `swarming`, `peak`, `dispersing`, `threading`, `resting`) — a reusable vocabulary. Murmuration is the canonical piece composed from them with a symmetric arc. The thesis was: a second piece using the same vocabulary in a different order would be artistically distinct, not just a shuffled Murmuration.

**Wake** tests that thesis. Different arc shape (asymmetric, peak in the middle but brief, long fade). Different artistic concept ("what's left after the flock has passed" vs Murmuration's "the flock itself"). Same building blocks; emergent composition.

Per the cowork-protocol's "draft now, queue now, ship now" disposition, this drain proves the section vocabulary works for more than one piece, validating the v0.3.9 decomposition retroactively.

## Files to create

- `~/projects/forge-music/percussion_lab/wake.md` — NEW. Single action snippet.

## Files to modify

- `~/projects/forge-music/forge.toml` — bump `version = "0.3.9"` → `version = "0.3.10"`.

## NOT modified (HARD)

- Any of the 8 existing percussion_lab section snippets (`solitary`, `companions`, `gathering`, `swarming`, `peak`, `dispersing`, `threading`, `resting`).
- `~/projects/forge-music/percussion/murmuration.md` — sister piece is independent; doesn't modify the canonical Murmuration.
- `~/projects/forge-music/percussion_lab/README.md`.
- `~/projects/forge-music/blues/*`.
- `~/projects/forge/forge/music/lib.py` — no helper changes.
- `~/projects/forge-client-obsidian/*` — no plugin bundle work in this drain.
- The constitution.

## Implementation notes

### `wake.md` shape

Frontmatter:

```yaml
---
type: action
description: wake
inputs: []
snapshot_capture: false
---
```

`snapshot_capture: false` because the returned `music21.stream.Score` contains music21 Instrument instances with bound method references (via the `_force_perc_channel` lambda from forge `08db2ed` lib.py) that the wire-format snapshot can't serialize — same opt-out pattern as `percussion_lab/peak.md`.

English facet — narrative-flavored canonical E-- per constitution V2a v9 clause B7.1. Suggested structure (CC may tighten the prose):

```markdown
# English


What's left after the murmuration. The flock has passed — texture lingers, voices return briefly to recall the climax, then a long fade through dispersing motion to silence. Where Murmuration is symmetric around a central peak, Wake is asymmetric — weighted toward the slow fade.

Six sections at 96 BPM in 4/4, 28 bars total, structured as a quiet opening + brief recall + long fade:

1. [[companions]](bars=8) — bars 1-8. Closed hi-hat texture remains, no kick yet. The whisper of presence after the flock has flown.
2. [[gathering]](bars=4) — bars 9-12. Snare ghosts and hi-hat eighths gather — voices stirring without committing to motion.
3. [[peak]](bars=2) — bars 13-14. A brief recall of the murmuration's peak — full kit + crash for two bars only, like a memory of climax. The shortest section.
4. [[dispersing]](bars=8) — bars 15-22. The long decrescendo fade. Decrescendo hairpin spans these 8 bars, instruments thinning across them.
5. [[threading]](bars=4) — bars 23-26. Soft snare returns over kick + hi-hat — the faint echo continuing past the dispersion.
6. [[resting]](bars=27-28) — bars 27-28. Kick alone for two bars, then silence.

The arc is asymmetric. The peak is brief and in the first third of the piece (bars 13-14 out of 28). The fade dominates the remainder. Same percussion vocabulary as Murmuration; different proportions; different feel.

Renders as multiple stacked staves in Verovio (one per instrument that plays anywhere across the piece); for high-fidelity rendering, download the MusicXML and open in MuseScore.
```

Python facet:

```python
def compute(context):
    companions = context.compute("companions", bars=8)
    gathering = context.compute("gathering", bars=4)
    peak = context.compute("peak", bars=2)
    dispersing = context.compute("dispersing", bars=8)
    threading = context.compute("threading", bars=4)
    resting = context.compute("resting", bars=2)

    return sequence(companions, gathering, peak, dispersing, threading, resting)
```

Dependencies block at file bottom (auto-derivable from Python; CC may auto-update or hand-author for now):

```markdown
# Dependencies

[[companions]] [[gathering]] [[peak]] [[dispersing]] [[threading]] [[resting]]
```

(6 wikilinks — only the sections Wake actually uses; `solitary` and `swarming` are absent.)

### Total bar count derivation

28 bars = 8 + 4 + 2 + 8 + 4 + 2. At 96 BPM in 4/4, ~70 seconds. Slightly shorter than Murmuration (~80 sec); proportional difference in arc shape is what matters, not duration.

### Behavior verification at compute time

Each `context.compute("<name>", bars=N)` call goes through A4.1 Probe 2 (constitution V2a v9 line 155 onward — shipped in plugin v0.2.57) since Wake lives in `percussion_lab/` and the callees do too (same directory). Sibling-subdir resolution applies; bare references work. Same pattern Murmuration uses at `~/projects/forge-music/percussion/murmuration.md`.

## Tests

Add to `~/projects/forge/tests/music/test_percussion_lab.py` (extends the existing test file from forge `bd69afc`):

1. `test_wake_returns_score_with_28_measures` — call `wake`; assert returned Score has parts with total 28 measures each. (`sequence()`'s instrument-grouping merges across sections; each unique instrument-key gets one continuous part.)
2. `test_wake_includes_crash_in_peak_section` — verify the crash cymbal part has notes specifically at bar 13 (the first measure of `peak` in Wake's arc, where `peak`'s bar-1 crash lands).
3. `test_wake_does_not_use_solitary_or_swarming` — read `wake.md` source, assert that `solitary` and `swarming` do NOT appear in either the English facet or the Python facet. (The hypothesis being tested: a sister piece skips sections; verifying that hypothesis empirically.)
4. `test_wake_dispersing_section_inserts_decrescendo_hairpin` — verify a `dynamics.Diminuendo` spanner is present in some part during bars 15-22 (the dispersing section).
5. `test_wake_has_brief_peak_relative_to_fade` — assert that the peak section (bars 13-14) is significantly shorter than the dispersing section (bars 15-22). Specifically: peak measure count = 2, dispersing measure count = 8. Ratio 1:4. This is the "asymmetric arc" hypothesis encoded.

Run:
- `cd ~/projects/forge && pytest -q tests/music/test_percussion_lab.py -v` — report all cases. Expected new total: existing baseline (likely 547 with the slot_cache tests from forge `0a0887f`) + 5 new = 552.
- `cd ~/projects/forge && pytest -q` — full forge suite. Expected pass count for §0 reporting.

## Commit + release

- Commit Wake + forge.toml bump to `~/projects/forge-music/` main.
- Tag `v0.3.10` on the forge-music repo (matches the pattern of v0.3.7 / v0.3.8 / v0.3.9 from prior drains).
- Push commits + tag to origin.
- Commit `tests/music/test_percussion_lab.py` additions to `~/projects/forge/` main. No tag on forge (engine convention).
- NO plugin bundle work. Level-2 bundle into forge-client-obsidian is a SEPARATE future drain.

Commit message shape (per cowork-protocol commit message convention):

```
[2026-06-06-2019-percussion-lab-sister-piece-wake] v0.3.10 — Wake sister piece using percussion_lab section vocabulary

Asymmetric 28-bar percussion piece composed from the existing 8
percussion_lab section snippets in a different order than
Murmuration. Quiet opening (companions × 8), brief recall of peak
(2 bars), long fade (dispersing × 8 + threading × 4 + resting × 2).
Tests the v0.3.9 decomposition's reusability claim: same vocabulary,
different arc, distinct artistic feel.

skips solitary and swarming entirely. Validates that section
snippets compose into pieces with different proportions, not just
shuffled orders.

A4.1 Probe 2 sibling-subdir resolution (V2a v9, plugin v0.2.57)
handles wake.md's bare `context.compute("companions")` etc. calls
to neighboring percussion_lab/*.md snippets.

5 new tests in tests/music/test_percussion_lab.py exercise: 28-bar
total, peak section presence, solitary/swarming absence, dispersing
hairpin, asymmetric peak-vs-fade ratio.
```

## Out of scope

- DO NOT modify any of the 8 section snippets (they're stable v0.3.9 vocabulary; this drain composes them, doesn't change them).
- DO NOT modify `~/projects/forge-music/percussion/murmuration.md`.
- DO NOT modify `~/projects/forge/forge/music/lib.py` (no helper changes needed).
- DO NOT modify `~/projects/forge-client-obsidian/` in any way (no bundle sync; no manifest bump; no plugin release).
- DO NOT modify constitution.
- DO NOT introduce `{{ slot }}` syntax — B7.3 is DRAFT only, not yet implemented.
- DO NOT compose Wake with any sections other than the existing 8. The constraint is the existing vocabulary; pieces emerge from order + bar-count, not by adding new sections.
- DO NOT add a piece-level English facet that overrides percussion_lab section identity (e.g., don't redescribe `peak` in Wake's English; just reference `[[peak]](bars=2)` and let the section snippet's own English speak for itself when the reader clicks the wikilink).

## Report when done

Write feedback to `~/projects/forge-moda-bootstrap/prompts/feedback/2026-06-06-2019-percussion-lab-sister-piece-wake.md`:

0. **Scope-respect checklist.** ✓ `wake.md` created; ✓ `forge-music/forge.toml` bumped to 0.3.10; ✓ 5 tests added to forge `tests/music/test_percussion_lab.py`; ✗ no other files touched.
1. **Commits + tag.** SHAs + pushed + tag v0.3.10 verified.
2. **wake.md content.** Show the file's English + Python + Dependencies. CC may have refined prose; show what landed.
3. **Tests.** All 5 new cases + full forge suite pass count.
4. **Working tree post-drain.** `git status -s` for forge-music, forge, forge-client-obsidian (last two should be clean except for any pre-existing forge constitution.md state from forge-core's recent work).
5. **B7.1 conformance check.** `grep -c '\[\[[a-z_]*\]\](bars=' wake.md` should return 6 (6 sections used in Wake).
6. **Surprises / deviations** — anything that diverged from the prompt's design.

## Don'ts

- Don't `git add .` — explicit paths only.
- Don't bundle into plugin in this drain.
- Don't tag forge engine (engine convention: no tags).
- Don't introduce sister-piece sections beyond what's referenced.
- Don't restructure the English facet beyond the suggested numbered list.
- Don't force-push or sign tags unless the repo's convention does.
