<!-- author: forge-music-cowork
     second-pass review: not requested — domain content cleanup
     focus: drop the canonical 7-part-with-rests workaround now that _instrument_key percMapPitch fix is bundled -->

# Percussion Lab — 7-parts-with-rests cleanup (drop redundant workaround)

## Scope

Refactor each of the 8 percussion_lab section snippets at `~/projects/forge-music/percussion_lab/*.md` to return ONLY actively-playing instrument parts, instead of the current canonical 7-part-with-rests layout. The workaround was put in place during the original v0.3.9 decomposition because `_instrument_key` in `~/projects/forge/forge/music/lib.py` was using only `type(inst).__name__` as the grouping key — so `closed_hihat` and `open_hihat` (both `HiHatCymbal`) collided during `sequence()` / `voices()` merging, dropping open-hi-hat notes into the closed stave.

That `_instrument_key` issue was fixed at forge commit `08db2ed` (extends the key to include `percMapPitch`), bundled in plugin v0.2.58+. The workaround is now redundant — `sequence()` correctly distinguishes `HiHatCymbal:42` (closed) from `HiHatCymbal:46` (open) and same for tom pitches.

Each section snippet currently builds + returns parts for kick + snare + closed_hh + open_hh + low_tom + mid_tom + crash regardless of which instruments actually play in that section (silent ones get all-rest bars). After cleanup, each snippet returns only the parts that have actual notes.

**Behavior preservation is load-bearing**: the existing `test_murmuration_after_refactor_matches_pre_refactor_structure` test must still pass. `sequence()`'s instrument-grouping (with the percMapPitch-aware key) merges same-instrument parts across sections and rest-pads inactive sections automatically — so dropping per-section empty-instrument parts should produce structurally equivalent output once the sections are sequenced together in Murmuration.

Bump `~/projects/forge-music/forge.toml` from `0.3.9` → `0.3.10`. NOTE: this drain conflicts with the Phase 4 sister piece drain at `2026-06-06-2019-percussion-lab-sister-piece-wake.md` if both drain — they both bump to 0.3.10. **Drain whichever lands first; second drain's CC must bump to 0.3.11 instead.** Cross-drain coordination via the `{CURRENT} → {NEXT_PATCH}` placeholder approach from cowork-protocol lines 204-206 doesn't strictly apply (same vault, not cross-vault), but the same defensive bump pattern applies: CC reads `forge.toml` at drain start and bumps to `{CURRENT}+1` per patch.

## Why

Each of the 8 section snippets currently has ~50 lines of all-rest boilerplate for instruments that don't play in that section:

- `solitary` has all-rest patterns for snare, closed_hh, open_hh, low_tom, mid_tom, crash (6 instruments worth of rest-only parts).
- `companions` has all-rest patterns for open_hh, low_tom, mid_tom, crash (4 instruments worth).
- `peak` has all-rest patterns for closed_hh (1 instrument).
- etc.

Total: ~50 lines per snippet × 8 sections ≈ 400 lines of boilerplate that exist purely to work around the `_instrument_key` issue that's now fixed. Removing them makes the snippets shorter, easier to read, and more honest about what each section actually does.

The percussion_lab vocabulary becomes self-evident from each snippet's Python facet: solitary's Python builds only the kick part; peak's Python builds kick + snare + open_hh + low_tom + mid_tom + crash; etc.

This is purely cleanup — audio output, MIDI velocity, dynamic marks, score rendering all unchanged. Behavior preservation is verified by the existing `test_murmuration_after_refactor_matches_pre_refactor_structure` test + the new `test_wake_*` tests from the Wake sister piece drain (if it ships first).

## Files to modify

All 8 percussion_lab section snippets. Each gets the same shape of cleanup:

- `~/projects/forge-music/percussion_lab/solitary.md`
- `~/projects/forge-music/percussion_lab/companions.md`
- `~/projects/forge-music/percussion_lab/gathering.md`
- `~/projects/forge-music/percussion_lab/swarming.md`
- `~/projects/forge-music/percussion_lab/peak.md`
- `~/projects/forge-music/percussion_lab/dispersing.md`
- `~/projects/forge-music/percussion_lab/threading.md`
- `~/projects/forge-music/percussion_lab/resting.md`

Plus:

- `~/projects/forge-music/forge.toml` — bump `version`. See cross-drain coordination note above for exact target (0.3.10 if first; 0.3.11 if Phase 4 sister piece drain landed first).
- `~/projects/forge-music/percussion_lab/README.md` — update the note about canonical 7-part layout to reflect the cleanup (one-sentence edit).

## NOT modified (HARD)

- `~/projects/forge-music/percussion/murmuration.md` — the orchestrator stays as-is. Same `sequence(context.compute("solitary"), ...)` shape works with cleaned-up sections because instrument-grouping handles the merging.
- `~/projects/forge-music/percussion_lab/wake.md` (if Phase 4 sister piece drain landed first) — same reason.
- `~/projects/forge/forge/music/lib.py` — no helper changes; the `_instrument_key` fix from `08db2ed` is already in place.
- `~/projects/forge-client-obsidian/*` — no plugin work in this drain.
- Constitution.

## Implementation notes

### Per-section active instruments

Each section's active instruments derive from its current schedule. Reading each snippet's Python facet shows which instruments have non-empty hit patterns vs all-rest patterns. CC extracts the active set per section. Reference based on current source (CC verifies during drain):

| Section | Active instruments | Workaround layout |
|---|---|---|
| solitary | kick | 7 parts (1 active + 6 all-rest) |
| companions | kick, closed_hh | 7 parts (2 active + 5 all-rest) |
| gathering | kick, closed_hh, snare | 7 parts (3 active + 4 all-rest) |
| swarming | kick, closed_hh, open_hh, snare, low_tom, mid_tom | 7 parts (6 active + 1 all-rest) |
| peak | kick, open_hh, snare, low_tom, mid_tom, crash | 7 parts (6 active + 1 all-rest) |
| dispersing | kick, closed_hh, open_hh, snare, low_tom, mid_tom | 7 parts (6 active + 1 all-rest) |
| threading | kick, closed_hh, snare | 7 parts (3 active + 4 all-rest) |
| resting | kick | 7 parts (1 active + 6 all-rest) |

CC must read each snippet's Python at drain start to verify this table against actual source. Don't blindly trust the table; the canonical source is each snippet's current `KICK = ...`, `SNARE = ...`, etc. constants.

### Refactor pattern (per snippet)

For each section snippet:

1. Identify all-rest part definitions in the Python facet (constants like `SNARE = [[]] * 4` that produce empty hit lists).
2. Remove those constants and their corresponding `_build_part(snare, SNARE)` calls.
3. Remove those parts' velocity calls (`with_velocity(...)` references to removed notes lists).
4. Adjust the final `return voices(...)` to only include the surviving active parts in canonical order (kick, snare, closed_hh, open_hh, low_tom, mid_tom, crash — but only the ones that have content).

The kick stays the anchor for the section's dynamic mark (per the existing `mark_dynamics=True` pattern from `drum_chorus.md`). Sections with no kick — there are none in the current 8 sections, so this isn't a case to handle.

### Behavior preservation

The load-bearing claim: `sequence(context.compute("solitary"), context.compute("companions"), ..., context.compute("resting"))` produces structurally equivalent output before and after the cleanup. Verification mechanism: re-run `tests/music/test_percussion_lab.py::test_murmuration_after_refactor_matches_pre_refactor_structure`.

That test checks:
- Number of parts in the final Score.
- Per-instrument note counts.
- Per-instrument measure counts.
- Instrument identities (class + `percMapPitch`).

All four should be unchanged after the cleanup because `sequence()`'s instrument-grouping creates the merged-across-sections parts correctly regardless of whether silent-section-parts are explicit (pre-cleanup) or implicit (post-cleanup — the merging adds the rest-padding automatically when an instrument doesn't appear in a contributing section's parts list).

If this test fails: the cleanup broke something. Stop, restore the snippet, investigate.

## Tests

No new tests for this drain — the load-bearing `test_murmuration_after_refactor_matches_pre_refactor_structure` already exists and the cleanup must preserve its passing state.

If the Phase 4 sister piece drain (`2026-06-06-2019-percussion-lab-sister-piece-wake.md`) landed first, those 5 new `test_wake_*` tests also must continue to pass — Wake also relies on the same `sequence()`-via-instrument-grouping merging behavior.

Run after refactor:
- `cd ~/projects/forge && pytest -q tests/music/test_percussion_lab.py -v` — every existing test in this file must still pass.
- `cd ~/projects/forge && pytest -q` — full suite. Confirm no regressions.

If any test fails post-cleanup, STOP. Don't ship a cleanup that breaks behavior preservation.

## Commit + release

- Commit all 8 section snippet refactors + README.md update + forge.toml bump to `~/projects/forge-music/` main.
- Tag the version on the forge-music repo per cross-drain coordination note (0.3.10 if Phase 4 didn't land first; 0.3.11 if it did).
- Push commits + tag to origin.
- No forge engine commits (tests not modified). No plugin bundle work. Level-2 bundle is a separate future drain.

Commit message shape:

```
[2026-06-06-2020-percussion-lab-seven-parts-cleanup] v0.3.<patch> — drop canonical 7-part workaround in percussion_lab sections

Each of the 8 section snippets at percussion_lab/*.md previously
returned a canonical 7-instrument layout with all-rest patterns
for silent instruments — a workaround for the `_instrument_key`
collision that was fixed at forge `08db2ed` (bundled v0.2.58+).
The workaround is now redundant; this drain refactors each snippet
to return only actively-playing parts.

~400 lines of all-rest boilerplate removed across 8 files. Audio
output, MIDI velocity, dynamic marks, score rendering all
unchanged — behavior preservation verified by
test_murmuration_after_refactor_matches_pre_refactor_structure
(load-bearing test from the original v0.3.9 decomposition).

sequence()'s instrument-grouping (post-percMapPitch fix) correctly
merges same-instrument parts across sections and rest-pads
inactive sections automatically. The all-rest sections previously
contributed parts that were structurally identical to what the
grouping now produces from absence.

README.md updated to reflect the new convention.
```

## Out of scope

- DO NOT modify `~/projects/forge-music/percussion/murmuration.md` — orchestrator stays as-is.
- DO NOT modify `~/projects/forge-music/percussion_lab/wake.md` if it landed first — Wake also benefits from cleaner sections without modification.
- DO NOT modify `~/projects/forge/forge/music/lib.py` (no helper changes; percMapPitch fix already shipped).
- DO NOT modify `~/projects/forge-client-obsidian/*` (no plugin bundle work).
- DO NOT modify constitution.
- DO NOT introduce `{{ slot }}` syntax — B7.3 is DRAFT only.
- DO NOT add new sections — the vocabulary is the 8 existing sections.
- DO NOT change any section's velocity profiles, dynamic marks, or hit patterns. Pure cleanup of redundant all-rest parts only.
- DO NOT bump forge-music beyond a patch increment.

## Report when done

Write feedback to `~/projects/forge-moda-bootstrap/prompts/feedback/2026-06-06-2020-percussion-lab-seven-parts-cleanup.md`:

0. **Scope-respect checklist.** ✓ 8 section snippets refactored; ✓ README.md updated; ✓ forge.toml bumped; ✗ no other files touched; ✗ no plugin work; ✗ no forge engine commits.
1. **Cross-drain coordination.** Report what `forge.toml` was at drain start; what version was bumped to. If Phase 4 sister piece drain had bumped to 0.3.10 first, this drain bumps to 0.3.11 and notes that.
2. **Refactor diff summary.** Per snippet: how many lines removed; which instruments dropped (which all-rest parts removed).
3. **Behavior preservation.** Output of `pytest -q tests/music/test_percussion_lab.py -v` — all existing tests must pass, especially `test_murmuration_after_refactor_matches_pre_refactor_structure`. Also `test_wake_*` if Phase 4 landed first.
4. **Full suite.** `pytest -q` total pass count.
5. **Commit + tag.** SHAs + pushed + tag verified.
6. **Working tree post-drain.** `git status -s` for forge-music, forge, forge-client-obsidian.

## Don'ts

- Don't `git add .` — explicit paths only.
- Don't modify section snippets beyond the all-rest-parts removal — no other Python changes, no English-facet edits.
- Don't bundle into plugin in this drain.
- Don't ship the cleanup if any percussion_lab test fails post-refactor.
- Don't force-push.
