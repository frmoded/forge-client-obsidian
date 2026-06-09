<!-- author: forge-music-cowork
     second-pass review: not requested — small lib.py change scoped to music helpers
     focus: fix sequence()/voices() collision for same-class-different-percMapPitch instruments -->

# Music lib — `_instrument_key` includes `percMapPitch` (fix sequence()/voices() collision)

## Scope

Extend `forge/forge/music/lib.py`'s `_instrument_key()` helper to include `percMapPitch` when the instrument carries one. After this fix, `sequence()` and `voices()` correctly treat `closed_hihat` (`HiHatCymbal` with `percMapPitch=42`) and `open_hihat` (`HiHatCymbal` with `percMapPitch=46`) as DIFFERENT instruments — they get their own stacked staves and their notes don't merge. Same for `low_tom` / `mid_tom` (both `TomTom` class, different pmps).

This is the **prerequisite Level-2 bundle blocker**: forge-music's v0.3.9 percussion_lab decomposition currently works around this collision with a canonical-7-part layout in every section (each snippet returns all 7 parts with rest patterns for silent instruments — ~50 lines of boilerplate per snippet). Once this lib fix lands, future drains can optionally refactor the section snippets to drop the 7-parts layout — but THAT refactor is OUT OF SCOPE here.

This drain is pure lib + tests. No vault content changes. No plugin work.

## Why

`lib.sequence()` and `lib.voices()` group parts at each voice position by instrument identity so that same-instrument parts from different inputs merge into one continuous stave. The grouping key is `_instrument_key(part)`, which today returns `type(inst).__name__` — class name only.

For melodic instruments (Vocalist, ElectricGuitar, BassDrum, SnareDrum), class identity is enough — each class is its own instrument. For percussion that uses `percMapPitch` to encode articulation on a shared class (`HiHatCymbal` with pmp 42 = closed, pmp 46 = open, pmp 44 = pedal; `TomTom` with pmp 41 = low, pmp 47 = mid, pmp 50 = high), class name collides across articulations. Two parts with different articulations get treated as the same instrument, and their notes get merged into one stave at the lower-index instrument's pitch.

This was empirically discovered during the percussion_lab decomposition preview drain (feedback §5 of `2026-06-04-2228-percussion-lab-decompose-murmuration.md`): peak section's `open_hihat` notes silently rendered as `closed_hihat` when sequenced with other sections that had `closed_hihat`. The audible regression motivated the 7-parts-always workaround.

Fix: extend the key to include `percMapPitch` when the instrument has it. Same-class-different-pitch instruments now produce distinct keys.

## Files to modify

All paths absolute.

- `/Users/odedfuhrmann/projects/forge/forge/music/lib.py` — `_instrument_key()` function (lines 79-86 in current state).
- `/Users/odedfuhrmann/projects/forge/tests/music/test_lib.py` — add test cases for the new behavior.

NOT modified:
- Any percussion_lab/ snippet (the 7-parts layout stays; refactoring is a separate concern).
- `murmuration.md` (still uses the orchestrator pattern; unaffected).
- `forge-music/forge.toml` (no vault version bump — this is engine work, not vault content).
- `forge/forge/music/llm_prompt.py` (no new authoring rules required).
- `forge-client-obsidian/*` (no plugin work in this drain).
- The constitution.

## Implementation notes

### Current `_instrument_key` (lib.py:79-86)

```python
def _instrument_key(part: stream.Part) -> str:
  """Return a string key identifying the part's instrument for grouping
  in sequence(). Parts with no instrument share an empty-string key."""
  inst = next((el for el in part.elements
               if isinstance(el, instrument.Instrument)), None)
  if inst is None:
    return ''
  return type(inst).__name__
```

### Proposed `_instrument_key` (after fix)

```python
def _instrument_key(part: stream.Part) -> str:
  """Return a string key identifying the part's instrument for grouping
  in sequence(). Parts with no instrument share an empty-string key.

  For percussion instruments that carry a `percMapPitch` (used to encode
  articulation on a shared class — e.g., `HiHatCymbal` with pmp 42 for
  closed vs pmp 46 for open, or `TomTom` with pmp 41 for low vs pmp 47
  for mid), the pitch is included in the key so same-class-different-
  articulation instruments don't collide during grouping.
  """
  inst = next((el for el in part.elements
               if isinstance(el, instrument.Instrument)), None)
  if inst is None:
    return ''
  base = type(inst).__name__
  pmp = getattr(inst, 'percMapPitch', None)
  if pmp is not None:
    return f"{base}:{pmp}"
  return base
```

### Behavior after fix

- `Vocalist()` → `"Vocalist"` (no percMapPitch attr).
- `ElectricGuitar()` → `"ElectricGuitar"`.
- `instrument.BassDrum()` → `"BassDrum"` (no pmp).
- `kick()` → `"BassDrum"` (kick factory returns `BassDrum()` without pmp).
- `snare()` → `"SnareDrum"`.
- `closed_hihat()` → `"HiHatCymbal:42"`.
- `open_hihat()` → `"HiHatCymbal:46"`.
- `pedal_hihat()` → `"HiHatCymbal:44"`.
- `low_tom()` → `"TomTom:41"`.
- `mid_tom()` → `"TomTom:47"`.
- `high_tom()` → `"TomTom:50"`.
- `crash_cymbal()` → `"CrashCymbals:49"` (yes, CrashCymbals carries pmp).
- `ride_cymbal()` → `"RideCymbals:51"`.

For non-percussion instruments without pmp, the key is unchanged from current behavior — no regression risk for melodic streams.

## Tests

Add to `/Users/odedfuhrmann/projects/forge/tests/music/test_lib.py`. CC discovers the right test class location (existing `test_lib.py` already has `_instrument_key` and `sequence()` / `voices()` test coverage; new cases belong there alongside).

### Required cases

1. **`test_instrument_key_distinguishes_hihat_articulations`** — call `_instrument_key()` on Parts with `closed_hihat()`, `open_hihat()`, `pedal_hihat()` instruments; assert all three keys differ AND all share the `"HiHatCymbal"` prefix.

2. **`test_instrument_key_distinguishes_tom_pitches`** — same shape with `low_tom()`, `mid_tom()`, `high_tom()`; assert three distinct keys all prefixed `"TomTom"`.

3. **`test_instrument_key_distinguishes_cymbals`** — same with `crash_cymbal()` vs `ride_cymbal()`; assert distinct keys.

4. **`test_instrument_key_no_percmappitch_returns_class_name_only`** — for a part containing `Vocalist()` or `ElectricGuitar()` (no pmp attr), assert the key equals just the class name (no `":"` suffix).

5. **`test_instrument_key_kick_and_snare_unchanged`** — `kick()` returns `"BassDrum"` and `snare()` returns `"SnareDrum"` (no pmp on these factories' returns); validates back-compat for the most common percussion factories.

6. **`test_sequence_keeps_closed_and_open_hihat_separate`** — INTEGRATION test:
   - Build two `stream.Score()` inputs.
   - Input A: one Part with `closed_hihat()` + 4 notes.
   - Input B: one Part with `open_hihat()` + 4 notes.
   - Call `sequence(input_a, input_b)`.
   - Assert the returned Score has exactly 2 stacked Parts (closed at top with closed-hihat instrument + 4 notes + 4 rests; open below with 4 rests + 4 notes). Verify by reading Part.elements for the Instrument identity at each stacked position.
   - This is the load-bearing test — pre-fix, this returns ONE merged part with notes at pitch 42 only.

7. **`test_voices_keeps_low_and_mid_tom_separate`** — same shape but with `voices()` and `low_tom()` / `mid_tom()`.

8. **`test_sequence_still_merges_same_articulation_across_inputs`** — regression check: two inputs both with `closed_hihat()` parts still merge correctly into a single Closed Hi-Hat stave (the merging behavior is the FEATURE, only the collision is the bug).

### Auto-verifiable

- `cd /Users/odedfuhrmann/projects/forge && pytest -q tests/music/test_lib.py -v` — report all new cases.
- `cd /Users/odedfuhrmann/projects/forge && pytest -q tests/music/` — full music suite (must include the 8 percussion_lab tests at 522-baseline). Expected pass count: 522 + 8 new = 530.
- `cd /Users/odedfuhrmann/projects/forge && pytest -q` — full forge suite. Confirm no regressions.

### Behavior preservation check

The percussion_lab section snippets currently work AROUND the collision via the 7-parts-always layout. After this fix, they STILL WORK — the 7-parts layout is now redundant boilerplate but harmless. `test_murmuration_after_refactor_matches_pre_refactor_structure` should continue to pass unchanged.

Confirm by re-running that specific test post-fix.

## Out of scope

- DO NOT modify any percussion_lab/ section snippet. The 7-parts layout stays; refactoring is a future drain.
- DO NOT modify murmuration.md.
- DO NOT modify any blues/, percussion/, or other forge-music content.
- DO NOT bump `forge-music/forge.toml` (engine fix, not vault content).
- DO NOT modify `forge-client-obsidian/` in any way — no plugin work this drain, including no bundle sync.
- DO NOT modify `forge/forge/music/llm_prompt.py` — no new authoring rules needed.
- DO NOT touch the constitution.
- DO NOT cut a plugin release.

## Report when done

Write feedback to `/Users/odedfuhrmann/projects/forge-moda-bootstrap/prompts/feedback/2026-06-06-0142-instrument-key-percmappitch-fix.md`:

0. **Scope-respect checklist.** Confirm: ✓ lib.py + test_lib.py only modified; ✗ no vault content, ✗ no plugin work, ✗ no version bump, ✗ no constitution.
1. **lib.py change.** Diff of `_instrument_key()` before/after.
2. **Tests.** All 8 new cases pass/fail counts. Full forge suite total.
3. **Behavior preservation re-check.** Specifically: `test_murmuration_after_refactor_matches_pre_refactor_structure` still passes — confirms the fix doesn't break the existing percussion_lab work.
4. **Commit + push.** SHA + commit message + verified push. No tag (engine convention).
5. **Working tree post-drain.** `git status` for forge / forge-music / forge-client-obsidian. Expected: forge has only the committed change; forge-music shows the same pre-existing untracked Path-A pollution; forge-client-obsidian clean.
6. **Follow-up surfaced for forge-music.** When the user is ready, a future drain can refactor percussion_lab/*.md to drop the 7-parts-always boilerplate and return only the actually-active parts per section. That's an aesthetic cleanup; not blocking; it'd shorten each section snippet by ~50 lines.

## Don'ts

- Don't `git add .` — explicit paths only.
- Don't sneak in unrelated lib.py polish ("while I'm in here" temptations).
- Don't bump versions anywhere.
- Don't refactor percussion_lab/ even though it's now technically possible. Separate drain when there's appetite.
- Don't run the plugin's `npm test` — no plugin work; skip its suite to keep the drain narrow.
- Don't run `sync-engine-bundle` — explicit. Bundle stays at the current state; the plugin's next release will pick up this lib change via its own bundle-sync drain.
