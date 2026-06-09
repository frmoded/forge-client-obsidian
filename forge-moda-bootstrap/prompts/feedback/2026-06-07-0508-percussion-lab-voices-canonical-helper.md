---
timestamp: 2026-06-07T06:00:00Z
session_id: drain-2026-06-07-0508
prompt_modified: 2026-06-07T05:08:00Z
status: success
---

# Percussion lab — `voices_canonical()` helper + 8-section cleanup (v0.3.11)

## §0 — Scope-respect checklist

- ✓ `voices_canonical()` added to `~/projects/forge/forge/music/lib.py`.
- ✓ 7 new tests in `~/projects/forge/tests/music/test_lib.py`.
- ✓ 8 percussion_lab section snippets refactored to use `voices_canonical()`.
- ✓ `~/projects/forge-music/percussion_lab/README.md` updated.
- ✓ `~/projects/forge-music/forge.toml` bumped 0.3.10 → 0.3.11.
- ✓ Existing `voices()`, `sequence()`, `_instrument_key` untouched (additive lib.py change only).
- ✗ No `~/projects/forge-music/percussion/murmuration.md` changes.
- ✗ No `~/projects/forge-music/percussion_lab/wake.md` changes.
- ✗ No `~/projects/forge-client-obsidian/*` changes (no plugin work).
- ✗ No constitution changes.
- ✗ `peak.md` English facet unchanged (no chip-click test text).

## §1 — `voices_canonical()` implementation

Signature: `voices_canonical(kp, sp=None, chp=None, ohp=None, ltp=None, mtp=None, crp=None)`.

Key behaviors verified:

- **`kp` required**: positional argument; `None` value raises `ValueError` with explanatory message. No-args call raises `TypeError` per Python defaults.
- **Bar count derived from `kp`**: walks `kp.getElementsByClass(stream.Measure)` to find the number of bars. All rest-padded parts get the same count.
- **Time signature derived from `kp`**: reads the first `meter.TimeSignature` from `kp`'s first measure. Falls back to `4/4` if absent. All rest-padded parts get the same TS in their first measure.
- **Instrument factories for inactive slots**: `sp=None` → `snare()` produces a `SnareDrum` with `percMapPitch=38`. Same for closed (HiHatCymbal:42), open (HiHatCymbal:46), low_tom (TomTom:41), mid_tom (TomTom:47), crash (CrashCymbals:49). These are exactly the keys `_instrument_key` produces, so cross-section grouping under `sequence()` works correctly.

The function delegates to existing `voices(kp, sp_filled, chp_filled, ..., crp_filled)` after slot-filling. Existing `voices()` unchanged.

Also wired into `~/projects/forge/forge/core/executor.py` `_FORGE_MUSIC_LIB_NAMES` so snippet namespaces have `voices_canonical` available without explicit import.

## §2 — Per-section refactor summary

Active instruments table (verified against actual source):

| Section | Active | `voices_canonical(...)` call |
| --- | --- | --- |
| solitary | kick | `voices_canonical(kp)` |
| companions | kick, closed_hh | `voices_canonical(kp, chp=chp)` |
| gathering | kick, snare, closed_hh | `voices_canonical(kp, sp=sp, chp=chp)` |
| swarming | kick, snare, closed_hh, open_hh, low_tom, mid_tom | `voices_canonical(kp, sp=sp, chp=chp, ohp=ohp, ltp=ltp, mtp=mtp)` |
| peak | kick, snare, open_hh, low_tom, mid_tom, crash | `voices_canonical(kp, sp=sp, ohp=ohp, ltp=ltp, mtp=mtp, crp=crp)` |
| dispersing | kick, snare, closed_hh, open_hh, low_tom, mid_tom | `voices_canonical(kp, sp=sp, chp=chp, ohp=ohp, ltp=ltp, mtp=mtp)` |
| threading | kick, snare, closed_hh | `voices_canonical(kp, sp=sp, chp=chp)` |
| resting | kick | `voices_canonical(kp)` |

Matches CC's investigation from `feedback/2026-06-06-2020-percussion-lab-seven-parts-cleanup.md` §1.2 verbatim.

Per-section lines removed: each section dropped 1-6 all-rest constants, 1-6 `_build_part(...)` calls, removed all-rest entries from the velocity loop, and removed all-rest slots from the `voices(...)` call (now `voices_canonical(...)`).

Total: forge-music commit stat shows `10 files changed, 56 insertions(+), 115 deletions(-)`. Net ~60 lines removed across 8 sections + README + forge.toml.

## §3 — Tests

All 7 new `voices_canonical` tests pass:

```
$ .venv/bin/pytest tests/music/test_lib.py -k voices_canonical -v
tests/music/test_lib.py::test_voices_canonical_kick_only_emits_7_parts PASSED
tests/music/test_lib.py::test_voices_canonical_pads_with_correct_bar_count PASSED
tests/music/test_lib.py::test_voices_canonical_pads_with_correct_time_signature PASSED
tests/music/test_lib.py::test_voices_canonical_active_parts_pass_through_unchanged PASSED
tests/music/test_lib.py::test_voices_canonical_missing_kp_raises PASSED
tests/music/test_lib.py::test_voices_canonical_inactive_parts_have_correct_instrument_factories PASSED
tests/music/test_lib.py::test_voices_canonical_preserves_voices_function_contract PASSED

================= 7 passed, 100 deselected, 1 warning in 0.15s =================
```

Load-bearing tests (Murmuration + Wake) — all pass:

```
$ .venv/bin/pytest tests/music/test_percussion_lab.py -v
tests/music/test_percussion_lab.py::test_solitary_returns_7_parts_with_only_kick_active PASSED
tests/music/test_percussion_lab.py::test_solitary_bars_parameter_elongates PASSED
tests/music/test_percussion_lab.py::test_companions_has_kick_and_closed_hihat_active_others_silent PASSED
tests/music/test_percussion_lab.py::test_peak_includes_crash_cymbal_on_bars_1_and_3 PASSED
tests/music/test_percussion_lab.py::test_dispersing_inserts_decrescendo_hairpin PASSED
tests/music/test_percussion_lab.py::test_each_section_anchors_dynamic_mark_on_kick PASSED
tests/music/test_percussion_lab.py::test_resting_bar_1_has_kicks_on_1_and_3_bars_2_4_have_only_beat_1 PASSED
tests/music/test_percussion_lab.py::test_murmuration_after_refactor_matches_pre_refactor_structure PASSED
tests/music/test_percussion_lab.py::test_wake_returns_score_with_28_measures PASSED
tests/music/test_percussion_lab.py::test_wake_includes_crash_in_peak_section PASSED
tests/music/test_percussion_lab.py::test_wake_does_not_use_solitary_or_swarming PASSED
tests/music/test_percussion_lab.py::test_wake_dispersing_section_inserts_decrescendo_hairpin PASSED
tests/music/test_percussion_lab.py::test_wake_has_brief_peak_relative_to_fade PASSED

======================== 13 passed, 1 warning in 1.01s =========================
```

Full forge suite:

```
$ .venv/bin/pytest -q
======================= 604 passed, 1 warning in 54.80s ========================
```

604 = 597 (v0.2.72 baseline) + 7 new voices_canonical tests. No regressions.

## §4 — Behavior preservation

The Murmuration test (`test_murmuration_after_refactor_matches_pre_refactor_structure`) asserts:

- 7 unique `(class, percMapPitch)` instrument keys present in the merged score.
- Per-instrument total note counts unchanged: kick 76, snare 112, closed_hh 128, open_hh 24, low_tom 28, mid_tom 24, crash 2.
- Each instrument spans 32 measures (8 sections × 4 bars).

All assertions pass post-refactor — voices_canonical() pads the silent instruments with the correct instrument identity at the correct voice_idx, so sequence() merges across all 8 sections into one stave per (class, percMapPitch). Same as pre-refactor by construction.

Wake tests similarly assert the 28-bar arc and section-specific invariants (crash on bar 13 from the peak section, Diminuendo spanner from dispersing). All pass.

## §5 — Commits + tag

| Repo | SHA | Message |
| --- | --- | --- |
| forge | `8c2d095` | `voices_canonical() helper + 7 tests + executor namespace registration` |
| forge-music | `918cc25` | `v0.3.11 — refactor 8 sections to use voices_canonical()` |

Tag `v0.3.11` pushed to `frmoded/forge-music` (`* [new tag] v0.3.11 -> v0.3.11`).

Forge commit pushed to `frmoded/forge` (`1cc4653..8c2d095 main -> main`).

## §6 — Working tree post-drain

**forge** (`~/projects/forge/`): clean.

**forge-music** (`~/projects/forge-music/`):

```
$ git status -s
?? .forge/
?? .obsidian/
```

Only the pre-existing untracked sentinel + plugin install directories. All section snippet changes committed under `918cc25`.

**forge-client-obsidian** (`~/projects/forge-client-obsidian/`): clean (no plugin work this drain).

## §7 — Cross-drain coordination

forge.toml was at `0.3.10` at drain start (post-Wake drain). This drain bumps to `0.3.11`. The original `2026-06-06-2020-percussion-lab-seven-parts-cleanup.md` prompt that surfaced the design problem is in `prompts/questions/`; its feedback file documents the failure mode that motivated `voices_canonical()`.

The investigation chain across drains:

1. **`2026-06-06-2020-percussion-lab-seven-parts-cleanup`** — Original attempt to drop the 7-part workaround based on the hypothesis that the `08db2ed` percMapPitch fix made it redundant. CC empirically refuted the hypothesis (closed_hh ended up at different voice_idx across sections; `sequence()` split into multiple staves). Routed to `questions/` with three suggested resolutions.
2. **`2026-06-07-0508-percussion-lab-voices-canonical-helper`** (this drain) — Implemented option (c) from CC's suggestions: centralize the workaround in a single `voices_canonical()` helper. Snippets become cleaner; merge invariant preserved by construction.
