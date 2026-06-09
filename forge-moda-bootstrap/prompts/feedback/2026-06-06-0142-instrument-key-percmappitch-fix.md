---
timestamp: 2026-06-06T01:42:00Z
session_id: claude-code-drain-instrument-key-fix
prompt_modified: 2026-06-06T01:42:00Z
status: success
---

# Feedback — 2026-06-06-0142 `_instrument_key` percMapPitch fix

## §0 — Scope-respect checklist

| Item | Status |
|---|---|
| `lib.py` + `test_lib.py` only modified in forge | ✓ |
| ✗ no vault content (percussion_lab/ unchanged, murmuration.md unchanged, blues/ unchanged) | ✓ |
| ✗ no plugin work (forge-client-obsidian clean) | ✓ |
| ✗ no `forge-music/forge.toml` bump | ✓ |
| ✗ no plugin manifest bump | ✓ |
| ✗ no bundle sync (`sync-engine-bundle` not run) | ✓ |
| ✗ no plugin release | ✓ |
| ✗ no tag | ✓ |
| ✗ no `forge/music/llm_prompt.py` touch | ✓ |
| ✗ no constitution edit (pre-existing `M docs/specs/constitution.md` is from your in-flight work, unchanged by this drain) | ✓ |

## §1 — lib.py change

### Before (`forge/music/lib.py:79-86`):

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

### After:

```python
def _instrument_key(part: stream.Part) -> str:
  """Return a string key identifying the part's instrument for grouping
  in sequence(). Parts with no instrument share an empty-string key.

  For percussion instruments that carry a `percMapPitch` (used to
  encode articulation on a shared class — e.g., `HiHatCymbal` with
  pmp 42 for closed vs pmp 46 for open, or `TomTom` with pmp 41 for
  low vs pmp 47 for mid), the pitch is included in the key so
  same-class-different-articulation instruments don't collide
  during grouping. Forge-music v0.3.9 — fixes the silent open→closed
  hi-hat merge in sequence() that motivated the percussion_lab
  canonical 7-part workaround.

  Non-percussion instruments (Vocalist, ElectricGuitar, etc.) carry
  no percMapPitch attribute and produce the bare class-name key
  unchanged."""
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

5-line addition (the `base` / `pmp` / conditional return). Docstring expanded to cite the percussion_lab use case.

## §2 — Tests

### 8 new TDD cases in `tests/music/test_lib.py`

```
tests/music/test_lib.py::test_instrument_key_distinguishes_hihat_articulations PASSED
tests/music/test_lib.py::test_instrument_key_distinguishes_tom_pitches PASSED
tests/music/test_lib.py::test_instrument_key_distinguishes_cymbals PASSED
tests/music/test_lib.py::test_instrument_key_no_percmappitch_returns_class_name_only PASSED
tests/music/test_lib.py::test_instrument_key_kick_and_snare_carry_pmp_suffix PASSED
tests/music/test_lib.py::test_sequence_keeps_closed_and_open_hihat_separate PASSED
tests/music/test_lib.py::test_voices_keeps_low_and_mid_tom_separate PASSED
tests/music/test_lib.py::test_sequence_still_merges_same_articulation_across_inputs PASSED
================= 8 passed, 92 deselected, 1 warning in 0.06s ==================
```

### Pre-fix output (selected, captured during TDD)

```
FAILED tests/music/test_lib.py::test_instrument_key_distinguishes_hihat_articulations
FAILED tests/music/test_lib.py::test_instrument_key_distinguishes_tom_pitches
FAILED tests/music/test_lib.py::test_instrument_key_kick_and_snare_carry_pmp_suffix
FAILED tests/music/test_lib.py::test_sequence_keeps_closed_and_open_hihat_separate
FAILED tests/music/test_lib.py::test_voices_keeps_low_and_mid_tom_separate
============ 5 failed, 3 passed, 92 deselected, 1 warning in 0.14s =============
```

5 of the 8 cases failed pre-fix; the 3 that passed were:
- `cymbals` (Crash + Ride are different music21 classes, trivially distinct).
- `no_percmappitch` (Vocalist/ElectricGuitar produce class-name keys with or without the fix).
- `still_merges_same_articulation` (the FEATURE, not the bug).

### Full forge suite

```
======================= 539 passed, 1 warning in 50.97s ========================
```

531 baseline (post-A4.1 drain) + 8 new = 539 total. No regressions.

## §3 — Behavior preservation re-check

`tests/music/test_percussion_lab.py` — all 8 still pass post-fix:

```
tests/music/test_percussion_lab.py::test_solitary_returns_7_parts_with_only_kick_active PASSED
tests/music/test_percussion_lab.py::test_solitary_bars_parameter_elongates PASSED
tests/music/test_percussion_lab.py::test_companions_has_kick_and_closed_hihat_active_others_silent PASSED
tests/music/test_percussion_lab.py::test_peak_includes_crash_cymbal_on_bars_1_and_3 PASSED
tests/music/test_percussion_lab.py::test_dispersing_inserts_decrescendo_hairpin PASSED
tests/music/test_percussion_lab.py::test_each_section_anchors_dynamic_mark_on_kick PASSED
tests/music/test_percussion_lab.py::test_resting_bar_1_has_kicks_on_1_and_3_bars_2_4_have_only_beat_1 PASSED
tests/music/test_percussion_lab.py::test_murmuration_after_refactor_matches_pre_refactor_structure PASSED
========================= 8 passed, 1 warning in 0.43s =========================
```

The load-bearing `test_murmuration_after_refactor_matches_pre_refactor_structure` is green — the percussion-lab decomposition's canonical 7-part workaround continues to produce the same per-instrument note counts after the fix. The workaround is now redundant but not breaking.

## §4 — Commit + push

**SHA:** `08db2ed`
**Files changed:** 2 (`forge/music/lib.py`, `tests/music/test_lib.py`). +180 / –2.
**Tag:** none (engine convention — engine commits don't get version tags; only forge-music vault releases do).

**Push:**
```
To github.com:frmoded/forge.git
   f3bbf89..08db2ed  main -> main
```

## §5 — Working tree post-drain

### forge

```
$ git status --short
 M docs/specs/constitution.md
```

Pre-existing modification to `docs/specs/constitution.md` (your in-flight constitution work, NOT touched by this drain). Otherwise clean.

### forge-music

```
$ git status --short
?? .forge/
```

Just the pre-existing untracked `.forge/` directory. Path-A pollution from earlier sessions has been cleaned. percussion_lab/ + percussion/murmuration.md untouched.

### forge-client-obsidian

```
$ git status --short
(empty — clean)
```

No plugin work in this drain per scope.

## §6 — Surprises during implementation

**Empirical correction to prompt's premise about kick/snare percMapPitch.** The prompt claimed:

> - `instrument.BassDrum()` → `"BassDrum"` (no pmp).
> - `kick()` → `"BassDrum"` (kick factory returns `BassDrum()` without pmp).
> - `snare()` → `"SnareDrum"`.

But empirically (verified via `getattr(inst, 'percMapPitch', None)`):

```
kick: type=BassDrum percMapPitch=35
snare: type=SnareDrum percMapPitch=38
```

music21's `BassDrum` and `SnareDrum` classes set `percMapPitch` to their respective General MIDI defaults (35 and 38). So post-fix keys are `"BassDrum:35"` and `"SnareDrum:38"`, NOT bare `"BassDrum"` / `"SnareDrum"`.

This was the prompt's test case 5 originally — I renamed to `test_instrument_key_kick_and_snare_carry_pmp_suffix` and asserted the actual post-fix shape. **The fix's intent is unaffected**: kick and snare each have only one factory, so the constant pmp suffix uniquely identifies them; merging-kicks-across-inputs still works. The merging behavior validated by `test_sequence_still_merges_same_articulation_across_inputs`.

Documented in the test file's preamble + the commit message body so future readers can find the correction quickly.

**voices() takes `instruments` as STRING list, not Instrument list.** My first version of `test_voices_keeps_low_and_mid_tom_separate` passed `[low_tom(), mid_tom()]` to the `instruments=` kwarg. That hit `instrument.fromString('TomTom' object)` → `AttributeError: 'TomTom' object has no attribute 'replace'`. Reading `lib.py:53-76` confirmed the API: `instruments: list[str] | None` and `instrument.fromString(inst_name)`. Fixed by attaching instruments directly to Parts via the existing `_make_part_with_instrument` helper, then passing the Parts to `voices()` without the kwarg. Test now exercises `voices()` per-input-Part stacking with pre-attached instruments — same effective check, correct API.

**The percussion-lab 7-parts-always workaround stays.** This drain explicitly does NOT refactor percussion_lab/*.md to drop the canonical 7-part layout. Per prompt §Out-of-scope. The workaround is now redundant but harmless; if forge-music wants the cleanup, a future drain can shorten each section snippet by ~50 lines. Documented as standing followup §6.

**No bundle sync, no plugin release.** Per prompt §Don'ts ("Don't run `sync-engine-bundle` — explicit. Bundle stays at the current state; the plugin's next release will pick up this lib change via its own bundle-sync drain"). So cohort vaults running v0.2.57 do NOT yet have this fix. The forge-music v0.3.9 Level-2 bundle drain (standing followup #1) is the natural next ship that would carry this fix into the plugin bundle.

## §7 — Follow-up surfaced for forge-music

**Percussion-lab 7-parts-always cleanup** (aesthetic; not blocking). Each section snippet in `forge-music/percussion_lab/*.md` currently returns the canonical 7-part layout — kick, snare, closed_hihat, open_hihat, low_tom, mid_tom, crash — with rest patterns for silent instruments. This was the workaround for the now-fixed `_instrument_key` collision. With this fix in place, sections can return only their actually-active parts, and `sequence()` will correctly merge same-articulation parts across sections without collisions.

A future forge-music drain may refactor the 8 percussion_lab snippets to drop the boilerplate, shortening each by ~50 lines. The audible output would be identical. Not blocking; flag for whenever forge-music cowork has appetite for cleanup.

---

**Audit-trail close:** prompt moves to `prompts/done/`. Drain stops; queue empty.

**Standing followups (now 6):**
1. forge-music v0.3.9 Level-2 bundle drain (unblocked by v0.2.57 A4.1; would also carry this lib fix into the plugin bundle).
2. forge-music v2 `_chips.md` — their lane.
3. forge-music.bak.0.3.0/ scanning gate — future chip-palette polish drain.
4. Stage 3+ E-- migration roadmap.
5. `[[percussion_lab]]` directory-wikilink decision in Murmuration narrative (cosmetic).
6. **NEW**: percussion_lab 7-parts-always cleanup — refactor section snippets to drop the now-redundant canonical 7-part workaround.
7. (cc) glue-to-pure-core audit candidates across the v0.2.4x arc.
