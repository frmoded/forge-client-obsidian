
---
timestamp: 2026-06-07T05:00:00Z
session_id: drain-2026-06-07-0400
prompt_modified: 2026-06-06T20:20:00Z (unchanged since prior run)
status: aborted (retry)
---

# Retry — investigation shows the prompt's behavior-preservation hypothesis is false

## Outcome

Re-routed to `prompts/questions/`. Same destination as the prior run, with concrete root-cause data added below.

## What CC did this round

1. Read `cc-prompt-queue.md` end-to-end per HARD RULE.
2. Confirmed forge.toml at `0.3.10` (post-Wake drain); planned bump to `0.3.11`.
3. Verified active-instrument table against actual source (matches the prompt's table verbatim — no surprises in WHICH instruments are active per section).
4. **Refactored all 8 percussion_lab section snippets** dropping all-rest constants + `_build_part` calls + velocity loop entries + `voices(...)` slots. Used the prompt's exact "active instruments" mapping. The refactor pattern was mechanical.
5. Ran the load-bearing tests.
6. **`test_murmuration_after_refactor_matches_pre_refactor_structure` FAILED** with `AssertionError: ('HiHatCymbal', 42): expected 32 measures (8 sections × 4 bars), got 56`.
7. **`test_wake_returns_score_with_28_measures` FAILED** similarly (got 56 for closed_hh).
8. Per the prompt's explicit STOP directive ("If this test fails: the cleanup broke something. Stop, restore the snippet, investigate"), CC restored all 8 snippets to HEAD and re-verified the baseline tests pass (13/13).

## Root cause (load-bearing finding for re-queuing the prompt)

The prompt's behavior-preservation claim hinges on:

> "sequence()'s instrument-grouping (with the percMapPitch-aware key) merges same-instrument parts across sections and rest-pads inactive sections automatically — so dropping per-section empty-instrument parts should produce structurally equivalent output once the sections are sequenced together in Murmuration."

This claim is **false**. CC verified by reading `~/projects/forge/forge/music/lib.py` `sequence()`:

```python
for voice_idx in range(n_voices):
    # Group inputs' parts at this voice position by instrument identity.
    # Each unique instrument becomes its own output stave.
    groups: dict = {}
    order: list = []
    for input_idx, parts in enumerate(per_input_parts):
        if voice_idx >= len(parts):
            continue
        src_part = parts[voice_idx]
        inst_key = _instrument_key(src_part)
        if inst_key not in groups:
            groups[inst_key] = []
            ...
```

**`sequence()` groups by `voice_idx` FIRST, then by instrument.** Different voice positions produce different output staves, regardless of instrument identity.

Pre-cleanup (workaround in place), every section's `voices()` returned 7 parts in canonical fixed order: `voices(kp, sp, chp, ohp, ltp, mtp, crp)`. Closed hi-hat was ALWAYS at voice_idx 2 across all 8 sections, so `sequence()` correctly merged them into one continuous stave.

Post-cleanup, the same instrument lands at DIFFERENT voice positions per section:

| Section | voices() | closed_hh at |
| --- | --- | --- |
| solitary (kick only) | `voices(kp)` | not present |
| companions (kick + chp) | `voices(kp, chp)` | **voice_idx 1** |
| gathering (kick, sp, chp) | `voices(kp, sp, chp)` | **voice_idx 2** |
| swarming (k, s, chp, ohp, lt, mt) | `voices(kp, sp, chp, ohp, ltp, mtp)` | **voice_idx 2** |
| peak (no closed_hh) | `voices(kp, sp, ohp, ltp, mtp, crp)` | not present |
| dispersing | `voices(kp, sp, chp, ohp, ltp, mtp)` | **voice_idx 2** |
| threading | `voices(kp, sp, chp)` | **voice_idx 2** |
| resting | `voices(kp)` | not present |

`sequence()` sees closed_hh at voice_idx 1 (companions) AND voice_idx 2 (gathering, swarming, dispersing, threading) — and treats them as **two distinct staves**. Each stave then gets rest-padded from its OWN voice's section list. Result: closed_hh appears with `4 × 4 + 8 × 4 = 48` measures across two output parts plus padding, totaling 56 — exactly the observed failure mode.

The `_instrument_key` fix at forge `08db2ed` (the prompt's premise for "the workaround is now redundant") solves a *different* problem: distinguishing same-class different-pitch instruments (closed_hh from open_hh) WHEN THEY APPEAR AT THE SAME VOICE INDEX. It does NOT solve the cross-voice-index merge problem. Removing the canonical 7-part layout re-introduces the cross-voice merge problem that the workaround was preventing.

## Verified file states

- All 8 section snippets reverted to HEAD via `git checkout HEAD --`.
- `~/projects/forge-music/forge.toml` unchanged (still 0.3.10 from Wake drain).
- `~/projects/forge/tests/music/test_percussion_lab.py` unchanged.
- `pytest -q tests/music/test_percussion_lab.py` → 13/13 pass (baseline restored).
- `git status -s` on forge-music shows only the same untracked sentinel + plugin install dirs.

## Questions for user (re-queued or amended prompt needs to address)

1. **The cleanup as specified breaks behavior preservation.** Two options to make it work:
   a. **Extend `sequence()`** in `forge/forge/music/lib.py` to group by `(instrument_identity)` GLOBALLY across all voice positions, not within each voice_idx independently. This is a substantial lib.py change — out of scope per the prompt's "DO NOT modify lib.py" constraint.
   b. **Keep the canonical 7-part layout in `voices()` calls** but elide the all-rest content. I.e., refactor to drop only the KICK/SNARE/CHIHAT/... constants for silent instruments, but still emit empty parts at the canonical voice positions via a placeholder. Net win is ~50 lines per snippet removed (constants only) instead of ~100 lines (constants + build_part + velocity + voices() entry). Less cleanup but preserves the merge invariant.
   c. **Some other layer**: a new helper like `voices_canonical(kp, sp=None, chp=None, ohp=None, ltp=None, mtp=None, crp=None)` that ALWAYS emits 7 voice positions, padding inactive ones with rest-parts at the canonical layout. The snippets become much cleaner because they just declare which parts they care about. This is a new function in lib.py — still requires lib.py modification, but the change is additive (existing `voices()` untouched).

2. **If lib.py changes are now in scope**, the prompt needs to authorize that explicitly. The current prompt says "DO NOT modify lib.py".

3. **Authoritative direction needed** before CC proceeds. The behavior-preservation contract is non-negotiable per the prompt's STOP rule, so CC cannot ship without one of the above paths being authorized.

## What CC did NOT touch this round

- No commits made (engine wiring stays at v0.2.72 commits from earlier in this drain).
- No forge-music repo state changed (all reverts via `git checkout HEAD`).
- forge.toml stays at 0.3.10.
- No release.

---

## §8 — Supersession note (2026-06-07)

This prompt was retired by driver authorization on 2026-06-07. The behavior-preservation problem identified in §root-cause was solved by the subsequent `2026-06-07-0508-percussion-lab-voices-canonical-helper.md` drain (option (c) from §1.1's three-option investigation note). That drain shipped `voices_canonical()` in `forge/forge/music/lib.py` (commit `8c2d095`) + refactored all 8 percussion_lab section snippets to use it (forge-music commit `918cc25`, v0.3.10 → v0.3.11). Cleanup goal achieved via the additive helper path; no re-queue of this prompt needed.

Moved from `questions/` to `done/` to retire from the active queue.
