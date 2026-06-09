<!-- author: forge-music-cowork
     second-pass review: not requested — music-domain helper + domain content cleanup
     focus: voices_canonical(kp, sp=None, ...) helper centralizes the 7-part canonical layout; refactor 8 sections to use it -->

# Percussion Lab — `voices_canonical()` helper + section cleanup (option C)

## Scope

This is the **revised replacement** for `~/projects/forge-moda-bootstrap/prompts/questions/2026-06-06-2020-percussion-lab-seven-parts-cleanup.md`, which CC correctly aborted to `questions/` after empirically refuting the prompt's behavior-preservation hypothesis.

The original prompt asserted that dropping the canonical 7-part layout would still preserve behavior because `_instrument_key` (post-`08db2ed`) would handle the merge. CC verified by reading `~/projects/forge/forge/music/lib.py:sequence()` that **`sequence()` groups by voice_idx FIRST, then by instrument identity within each position** — so dropping the canonical 7-part layout breaks the cross-section instrument-stave merge. The `_instrument_key` percMapPitch fix solves a different (same-voice-idx, different-pitch) problem. CC's investigation in `~/projects/forge-moda-bootstrap/prompts/feedback/2026-06-06-2020-percussion-lab-seven-parts-cleanup.md` documents the root cause precisely.

This revised prompt takes **option (c)** from CC's three suggestions: add a `voices_canonical()` helper to `~/projects/forge/forge/music/lib.py` that always emits 7 voice positions (rest-padding inactive instruments) and refactor the 8 percussion_lab section snippets to use it. The helper centralizes the canonical-7-part workaround in one place; the snippets become much cleaner (~100 lines removed each) while preserving the `sequence()` merge invariant.

Bump `~/projects/forge-music/forge.toml` v0.3.10 → v0.3.11. Tag v0.3.11. No plugin bundle work.

## Why

Each percussion_lab section snippet currently has ~50 lines of all-rest part declarations (e.g., `SNARE = [[]] * 4` + `_build_part(snare, SNARE)` + `with_velocity(snare_notes, ...)` + `voices(..., snare_part, ...)` slot) for instruments that don't actually play in that section. This boilerplate exists purely to keep every section returning 7 parts in canonical order so `sequence()` correctly merges same-instrument staves across sections.

**Option (c)** moves the workaround into a single helper. Each section snippet declares only the parts it builds; `voices_canonical(kp, sp=None, ...)` handles the canonical layout. Net win:
- ~100 lines removed per snippet × 8 = ~800 lines of boilerplate eliminated.
- Snippets become honest about what they do: `solitary` builds only kick; `peak` builds 6 parts; etc.
- The workaround knowledge lives in one place (`voices_canonical`'s implementation + docstring + tests), not duplicated across 8 snippet files.
- Existing `voices()` stays untouched — additive lib.py change, lowest blast radius.

Per the cowork-protocol Decision Lens (Papert first, speed second, lines 27-34): option (c) is best on the Papert metric (snippets read more cleanly; cost-to-add-a-new-section drops because the canonical-layout knowledge is no longer a per-snippet concern; cost-to-tweak-a-section drops because the snippet's Python facet now describes only its own content).

## Files to modify

**Engine helpers + tests:**

- `~/projects/forge/forge/music/lib.py` — ADD `voices_canonical()` function. No changes to existing `voices()`, `sequence()`, or any other helper.
- `~/projects/forge/tests/music/test_lib.py` — ADD tests for `voices_canonical()`.

**Section snippets (refactor — 8 files):**

- `~/projects/forge-music/percussion_lab/solitary.md`
- `~/projects/forge-music/percussion_lab/companions.md`
- `~/projects/forge-music/percussion_lab/gathering.md`
- `~/projects/forge-music/percussion_lab/swarming.md`
- `~/projects/forge-music/percussion_lab/peak.md`
- `~/projects/forge-music/percussion_lab/dispersing.md`
- `~/projects/forge-music/percussion_lab/threading.md`
- `~/projects/forge-music/percussion_lab/resting.md`

**Documentation + version bump:**

- `~/projects/forge-music/percussion_lab/README.md` — update the convention note to describe the new `voices_canonical()` pattern.
- `~/projects/forge-music/forge.toml` — bump `version = "0.3.10"` → `version = "0.3.11"`.

## NOT modified (HARD)

- `~/projects/forge-music/percussion/murmuration.md` — orchestrator unchanged.
- `~/projects/forge-music/percussion_lab/wake.md` — sister piece unchanged.
- `~/projects/forge/forge/music/lib.py` `voices()`, `sequence()`, `_instrument_key`, or any other existing function — additive only. New `voices_canonical()` is the only change.
- `~/projects/forge-client-obsidian/*` — no plugin bundle work in this drain.
- Constitution.
- Any forge-music content outside `percussion_lab/`.

## Implementation notes

### `voices_canonical()` helper signature + behavior

Add to `~/projects/forge/forge/music/lib.py`:

```python
def voices_canonical(kp, sp=None, chp=None, ohp=None, ltp=None, mtp=None, crp=None):
    """Stack 7 percussion parts in canonical order for percussion_lab sections.

    Each percussion_lab section snippet returns a Score with 7 voice
    positions (kick, snare, closed_hihat, open_hihat, low_tom, mid_tom,
    crash) regardless of which instruments actually play. Sections that
    don't play a given instrument pass None for that parameter; the
    helper builds an all-rest part at that voice position, using the
    bar count and time signature of the kick part (always required).

    The canonical layout is the contract `sequence()` requires:
    `sequence()` groups input parts by voice_idx FIRST, then by
    instrument identity within each position. Same-instrument staves
    across sections only merge correctly if every section emits that
    instrument at the same voice_idx. Without this canonical layout,
    closed_hihat at voice_idx 1 in companions and voice_idx 2 in
    gathering would render as two separate staves with 56 measures
    of combined-and-padded content instead of the intended single
    32-measure stave.

    Args:
        kp: kick part (REQUIRED — bar count + time signature are
            read from this).
        sp, chp, ohp, ltp, mtp, crp: optional snare, closed_hihat,
            open_hihat, low_tom, mid_tom, crash parts. None means
            "this instrument is silent in this section" — the helper
            generates an all-rest stream.Part for that voice position
            matching kp's bar count and time signature.

    Returns:
        music21.stream.Score with 7 stacked Parts in the canonical
        (kick, snare, closed_hihat, open_hihat, low_tom, mid_tom,
        crash) order. Inactive parts have rest-bars and the correct
        instrument metadata so `sequence()` groups them correctly.
    """
    ...
```

CC implements the function. Key behaviors:

- `kp` is REQUIRED. None for kp is an error (every percussion_lab section has kick — there's no use case for a kick-less section, and the helper needs at least one part to derive bar count + time signature).
- For each None parameter, build an all-rest `stream.Part` with:
  - The same number of bars as `kp` (count `kp.getElementsByClass(stream.Measure)` or equivalent).
  - The same time signature as `kp` (read from the first Measure of `kp`, or carry from kp's `.flat.getElementsByClass(meter.TimeSignature)`).
  - The correct music21 instrument matching the slot's canonical instrument (use the factory functions: `snare()` for `sp`, `closed_hihat()` for `chp`, `open_hihat()` for `ohp`, `low_tom()` for `ltp`, `mid_tom()` for `mtp`, `crash_cymbal()` for `crp`).
  - One `stream.Measure` per bar, each containing one full-bar `note.Rest(quarterLength=ts.barDuration.quarterLength)`.
- Stack the 7 parts in canonical order via `voices(kp, sp_filled, chp_filled, ohp_filled, ltp_filled, mtp_filled, crp_filled)` where `*_filled` is either the user-passed Part or the rest-padded synthetic Part.

The return is exactly what the existing 8 section snippets currently produce via their inline all-rest boilerplate. Behavior preservation is by construction.

### Per-section refactor

For each of the 8 section snippets, the Python facet changes shape from:

```python
def compute(context, bars):
    # ... constants for active instruments (e.g., KICK = ..., CHIHAT = ...)
    # ... constants for INACTIVE instruments (e.g., SNARE = [[]] * 4, OPENHH = [[]] * 4, ...)
    # ... helper functions (_cycle, _build_bar, _build_part) ...
    # ... build active parts AND all-rest parts:
    kp, kn = _build_part(kick, KICK)
    sp, sn = _build_part(snare, SNARE)       # all-rest in solitary
    chp, chn = _build_part(closed_hihat, CHIHAT)  # all-rest in some sections
    ohp, ohn = _build_part(open_hihat, OPENHH)    # all-rest in most sections
    ltp, ltn = _build_part(low_tom, LOWTOM)       # all-rest in most sections
    mtp, mtn = _build_part(mid_tom, MIDTOM)       # all-rest in most sections
    crp, crn = _build_part(crash_cymbal, CRASH)   # all-rest in all but peak
    # ... velocity loops over all parts ...
    return voices(kp, sp, chp, ohp, ltp, mtp, crp)
```

to:

```python
def compute(context, bars):
    # ... constants for ONLY the active instruments
    # ... helper functions (_cycle, _build_bar, _build_part) ...
    # ... build only active parts:
    kp, kn = _build_part(kick, KICK)
    chp, chn = _build_part(closed_hihat, CHIHAT)  # if section uses closed hi-hat
    # ... velocity loops over only the active parts ...
    return voices_canonical(kp, chp=chp)  # voices_canonical pads silent instruments
```

The exact set of active parts per section (from CC's verified investigation in `~/projects/forge-moda-bootstrap/prompts/feedback/2026-06-06-2020-percussion-lab-seven-parts-cleanup.md` §1.2):

| Section | Active instruments | `voices_canonical(...)` call shape |
|---|---|---|
| solitary | kick | `voices_canonical(kp)` |
| companions | kick, closed_hihat | `voices_canonical(kp, chp=chp)` |
| gathering | kick, snare, closed_hihat | `voices_canonical(kp, sp=sp, chp=chp)` |
| swarming | kick, snare, closed_hihat, open_hihat, low_tom, mid_tom | `voices_canonical(kp, sp=sp, chp=chp, ohp=ohp, ltp=ltp, mtp=mtp)` |
| peak | kick, snare, open_hihat, low_tom, mid_tom, crash | `voices_canonical(kp, sp=sp, ohp=ohp, ltp=ltp, mtp=mtp, crp=crp)` |
| dispersing | kick, snare, closed_hihat, open_hihat, low_tom, mid_tom | `voices_canonical(kp, sp=sp, chp=chp, ohp=ohp, ltp=ltp, mtp=mtp)` |
| threading | kick, snare, closed_hihat | `voices_canonical(kp, sp=sp, chp=chp)` |
| resting | kick | `voices_canonical(kp)` |

CC reads each snippet's current source to verify this table against actual code before refactoring.

### Tests for `voices_canonical()`

Add to `~/projects/forge/tests/music/test_lib.py`:

1. **`test_voices_canonical_kick_only_emits_7_parts`**: pass just `kp` (kick) → returned Score has exactly 7 parts in canonical order. The 6 non-kick parts are all-rest with the correct instrument metadata at each voice position.

2. **`test_voices_canonical_pads_with_correct_bar_count`**: pass `kp` with 4 bars and `chp` with 4 bars → all 7 returned parts have exactly 4 measures each. Pass `kp` with 8 bars → all 7 parts have 8 measures.

3. **`test_voices_canonical_pads_with_correct_time_signature`**: pass `kp` with `4/4` → all 7 parts have `4/4` time signature in their first measure. Pass `kp` with `12/8` → all 7 have `12/8`.

4. **`test_voices_canonical_active_parts_pass_through_unchanged`**: pass `kp` and `sp` with specific notes → those parts in the returned Score still have those notes (no transformation).

5. **`test_voices_canonical_missing_kp_raises`**: call without `kp` → raises `TypeError` or `ValueError` (whichever is natural for Python — `kp` being positional-required means TypeError on `voices_canonical()` with no args).

6. **`test_voices_canonical_inactive_parts_have_correct_instrument_factories`**: pass only `kp` → assert that the snare slot has a `SnareDrum` instrument (or whatever `snare()` factory produces), closed_hihat slot has the correct `HiHatCymbal` with `percMapPitch=42`, etc. This is the load-bearing test that proves `_instrument_key` will group correctly across sections.

7. **`test_voices_canonical_preserves_voices_function_contract`**: behavior equivalence: a hand-built 7-part `voices(kp, all_rest_sp, all_rest_chp, ...)` and `voices_canonical(kp)` should produce structurally identical Scores. Same part count, same instrument identities, same measure counts.

### Behavior preservation

The load-bearing claim: `sequence(context.compute("solitary"), context.compute("companions"), ..., context.compute("resting"))` produces structurally equivalent output before and after this refactor. Verification: existing `test_murmuration_after_refactor_matches_pre_refactor_structure` in `~/projects/forge/tests/music/test_percussion_lab.py` MUST still pass.

Similarly for Wake: `test_wake_returns_score_with_28_measures` and the other `test_wake_*` tests MUST still pass.

If either test fails: STOP, restore, investigate. Don't ship.

Run:

- `cd ~/projects/forge && pytest -q tests/music/test_lib.py -v` — confirm new tests pass.
- `cd ~/projects/forge && pytest -q tests/music/test_percussion_lab.py -v` — load-bearing behavior preservation.
- `cd ~/projects/forge && pytest -q` — full suite. Expected pass count = current baseline (582 from Wake drain) + 7 new = 589.

## Commit + release

- Commit `lib.py` + `test_lib.py` changes to `~/projects/forge/` main. No engine tag.
- Commit 8 section snippet refactors + README.md update + forge.toml bump to `~/projects/forge-music/` main.
- Tag `v0.3.11` on forge-music.
- Push commits + tag.
- No forge-client-obsidian work. No plugin bundle. Level-2 bundle is a separate future drain.

Commit message shape:

```
[2026-06-07-0508-percussion-lab-voices-canonical-helper] add voices_canonical() helper + refactor 8 sections

forge: lib.py gains voices_canonical(kp, sp=None, chp=None, ohp=None,
ltp=None, mtp=None, crp=None) — always emits 7 voice positions
matching the canonical (kick, snare, closed_hihat, open_hihat,
low_tom, mid_tom, crash) layout that sequence() needs to merge
same-instrument staves across sections. Inactive parts are
rest-padded with correct instrument metadata. Existing voices()
unchanged.

forge-music: 8 percussion_lab section snippets refactored to use
voices_canonical(). Each snippet now declares only the parts it
actually builds; the canonical-7-part workaround moves into the
helper. ~100 lines removed per snippet × 8 ≈ ~800 lines of
boilerplate eliminated.

Behavior preservation verified by
test_murmuration_after_refactor_matches_pre_refactor_structure +
test_wake_returns_score_with_28_measures (load-bearing). No
plugin bundle work in this drain.

Resolves the failure mode CC documented at
~/projects/forge-moda-bootstrap/prompts/feedback/2026-06-06-2020-percussion-lab-seven-parts-cleanup.md
where the original "drop the workaround" approach broke
sequence()'s merge invariant. The percMapPitch fix solves
same-voice-idx-different-pitch; voices_canonical() solves
cross-voice-idx canonical layout.
```

## Out of scope

- DO NOT modify existing `voices()`, `sequence()`, `_instrument_key`, or any other existing function in `~/projects/forge/forge/music/lib.py`. Additive only.
- DO NOT modify `~/projects/forge-music/percussion/murmuration.md`.
- DO NOT modify `~/projects/forge-music/percussion_lab/wake.md`.
- DO NOT touch `~/projects/forge-client-obsidian/*`.
- DO NOT modify constitution.
- DO NOT change any section's velocity profiles, dynamic marks, or hit patterns. Refactor the layout-management code only.
- DO NOT introduce `{{ slot }}` syntax (B7.3 is now live but this prompt doesn't need it).
- DO NOT bundle into plugin.

## Report when done

Write feedback to `~/projects/forge-moda-bootstrap/prompts/feedback/2026-06-07-0508-percussion-lab-voices-canonical-helper.md`:

0. **Scope-respect checklist.** ✓ `voices_canonical()` added; ✓ 7 tests in test_lib.py; ✓ 8 section snippets refactored; ✓ README.md updated; ✓ forge.toml bumped to 0.3.11; ✗ no other lib.py changes; ✗ no plugin work; ✗ Murmuration + Wake untouched.
1. **`voices_canonical()` implementation.** Show the diff of the helper. Key behaviors verified: kp-required, bar-count from kp, time-signature from kp, instrument factories for inactive slots.
2. **Per-section refactor diff summary.** Lines removed per snippet (CC measures). Confirm the active-instruments table matches CC's investigation.
3. **Tests.** All 7 new `voices_canonical` tests pass. `test_murmuration_after_refactor_matches_pre_refactor_structure` STILL passes. `test_wake_*` STILL pass. Full forge suite pass count.
4. **Behavior preservation.** Explicit before/after comparison: same part count, same instrument identities, same measure counts. The same number CC observed pre-refactor (32 measures total per kick stave in Murmuration via 8 sections × 4 bars; 28 measures in Wake).
5. **Commit + tag.** SHAs + pushed + tag v0.3.11 verified.
6. **Working tree post-drain.** `git status -s` for forge-music + forge + forge-client-obsidian.

## Don'ts

- Don't `git add .` — explicit paths only.
- Don't ship if any test fails. The behavior-preservation tests are non-negotiable; the prior drain's STOP rule applies.
- Don't refactor a section without verifying its post-refactor `voices_canonical()` call matches the active-instruments table from CC's investigation.
- Don't modify `~/projects/forge-music/percussion_lab/peak.md`'s English facet (no chip-click test text exists currently after the user's `git restore`; keep it that way).
- Don't bundle into plugin.
- Don't force-push.
