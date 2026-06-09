<!-- author: forge-music-cowork
     second-pass review: requested
     focus: Phases A-C add helpers + instrument wrappers to forge.music.lib
     (public API expansion). Phase D introduces a new content partition
     (percussion/) — first new subdir convention since blues/. Forge-core
     may want eyes on the lib API surface growth and whether the
     percussion/ partition needs any constitution amendment (almost
     certainly not; mirrors A5.1's subdirectory convention applied
     within a library vault). -->

# Percussion expansion: velocity + articulation + more instruments + first pure-percussion piece "Murmuration"

## Scope

Five phases batched into one BIG prompt per the user's stated preference for larger combined drains. Each phase commits + pushes independently; failure-isolation per the established pattern.

**Phase A** — Velocity helper in `forge/music/lib.py`. New `with_velocity(notes, pattern)` that applies velocity values across a note sequence per a named profile (`'human'`, `'ghost'`, `'accent'`, `'crescendo'`, `'decrescendo'`), uniform int, or cyclic list. Tests + bundle mirror + MUSIC_PROMPT_FRAGMENT addition.

**Phase B** — Articulation support for drums. Investigate music21's open vs closed hi-hat options; add helper wrappers as needed (`closed_hihat()`, `open_hihat()` as named factory functions, OR a `with_articulation(notes, kind)` helper). Tests + bundle mirror + prompt-fragment addition.

**Phase C** — More percussion instruments. Investigate music21's percussion catalog; add named factory helpers for the kit pieces a real song needs: low tom, mid tom, crash cymbal, ride cymbal. Document what's available; expose helpers for the common cases. Tests + bundle mirror.

**Phase D** — Create `~/projects/forge-music/percussion/` subdir; author the first pure-percussion piece `percussion/murmuration.md`. 32 bars in 4/4 at ~96 BPM, ~80 seconds duration. The piece's arc: a starling murmuration at dusk — one bird turns, others follow, the flock gathers, peaks in dense swirling motion, then disperses back to stillness. Uses every helper landed in Phases A-C. Bundle mirror + forge-music vault version bump.

**Phase E** — Release plugin v0.2.34 + clean-vault smoke + GH Release.

What this prompt does NOT do:
- Integrate the piece (or any percussion content) into the blues song. Percussion lives in its own partition; integration into blues is a separate future thread.
- Add drum-fill helpers, pattern-template helpers, or "play this for N bars" abstractions. Pure content + minimum capability for the piece to land.
- Migrate `blues/drums_shuffle.md` to use the new helpers. The spike snippet stays as-is (could be revisited in a follow-up cleanup, but not in scope here).
- Add `forge-music-core` style-templates (Motown groove, etc.). Library content for later.
- Fix the `<midi-player>` / Verovio rendering specifics for percussion (no clef, oval noteheads). Renderer-level concerns are forge-core; the piece is composed against current rendering reality.

## Why

The user wants to invest cycles in percussion as a first-class music-domain capability, with a pure-percussion piece as the deliverable. Current state: `drums_shuffle.md` exists as a spike; audio plays; visual renders modestly; but no dynamics, no articulation, limited instrument palette. A pure-percussion piece authored against the current toolkit would sound robotic (no velocity variation) and limited (only kick + snare + hi-hat).

This drain closes the three biggest capability gaps (velocity, articulation, instruments) AND ships a piece that uses all three. Doing them together means: (a) the helpers are exercised by real content as they land, (b) the piece pushes the music vault past "spike demo" into "actual composition," and (c) one combined drain compresses what would otherwise be 4+ small prompts.

The user is explicitly exploring forge-music as a creative environment, not just a technical demo. The piece should reflect that — evocative naming, deliberate arc, listenable result. "Murmuration" was picked for its musical-arc fit (a flock gathering and dispersing) and its richness as a metaphor (starlings forming a single mind from individuals).

## Files to investigate then modify

**Engine source (Phases A-C):**

- `~/projects/forge/forge/music/lib.py` — add `with_velocity`, articulation helpers (Phase B's findings determine shape), instrument factory helpers.
- `~/projects/forge/forge/music/llm_prompt.py` — `MUSIC_PROMPT_FRAGMENT` additions per phase.
- `~/projects/forge/tests/music/test_lib.py` — test cases for new helpers.

**Engine bundle mirror (post each engine-touching phase):**

- `~/projects/forge-client-obsidian/assets/engine/forge/music/lib.py`
- `~/projects/forge-client-obsidian/assets/engine/forge/music/llm_prompt.py`

**Content (Phase D):**

- Create `~/projects/forge-music/percussion/` subdir.
- Create `~/projects/forge-music/percussion/murmuration.md`.
- Mirror to `~/projects/forge-client-obsidian/assets/vaults/forge-music/percussion/murmuration.md`.

**Versions (Phase D + E):**

- `~/projects/forge-music/forge.toml`: 0.3.5 → 0.3.6 (Phase D).
- `~/projects/forge-client-obsidian/manifest.json`: 0.2.33 → 0.2.34 (Phase E).

## Implementation notes — Phase A (velocity helper)

### Design

Add to `forge/music/lib.py`:

```python
import random as _stdlib_random

_VELOCITY_PROFILES = {
    'human':       lambda i, n: 75 + _stdlib_random.randint(-8, 8),
    'ghost':       lambda i, n: 35 + _stdlib_random.randint(-5, 8),
    'accent':      lambda i, n: 110 + _stdlib_random.randint(-5, 10),
    'crescendo':   lambda i, n: int(40 + (90 - 40) * (i / max(n - 1, 1))),
    'decrescendo': lambda i, n: int(90 - (90 - 40) * (i / max(n - 1, 1))),
}


def with_velocity(notes, pattern):
    """Apply velocity values to a sequence of Note objects per a pattern.

    Mutates each note's `.volume.velocity` in place and returns the list
    for chaining. Rests in the sequence are skipped.

    Patterns:
      - 'human':       small random variation around 75 (±8). Default for
                       realistic-feel drumming.
      - 'ghost':       quiet (~35), for ghost notes between accents.
      - 'accent':      loud (~110), for hits that punch.
      - 'crescendo':   linear ramp from 40 to 90 across the sequence.
      - 'decrescendo': linear ramp from 90 to 40.
      - int (1-127):   uniform value across all notes.
      - list of ints:  cyclic pattern, e.g. [100, 60, 80, 60] applies
                       accent on every 4th, soft in between.

    Returns: notes (list of GeneralNote, same reference).
    """
    if isinstance(pattern, int):
        for n in notes:
            if not isinstance(n, note.Rest):
                n.volume.velocity = max(1, min(127, pattern))
        return notes
    if isinstance(pattern, list):
        if not pattern:
            raise ValueError("velocity pattern list must be non-empty")
        non_rest_idx = 0
        for n in notes:
            if isinstance(n, note.Rest):
                continue
            n.volume.velocity = max(1, min(127, pattern[non_rest_idx % len(pattern)]))
            non_rest_idx += 1
        return notes
    if pattern not in _VELOCITY_PROFILES:
        raise ValueError(
            f"unknown velocity pattern {pattern!r}; expected one of "
            f"{list(_VELOCITY_PROFILES)} or int 1-127 or list[int]"
        )
    profile_fn = _VELOCITY_PROFILES[pattern]
    non_rest_total = sum(1 for n in notes if not isinstance(n, note.Rest))
    non_rest_idx = 0
    for n in notes:
        if isinstance(n, note.Rest):
            continue
        v = profile_fn(non_rest_idx, non_rest_total)
        n.volume.velocity = max(1, min(127, v))
        non_rest_idx += 1
    return notes
```

### Tests (`tests/music/test_lib.py`)

Add cases:

1. `test_with_velocity_uniform_int` — `with_velocity([n1, n2, n3], 80)` → all three at velocity 80.
2. `test_with_velocity_cyclic_list` — `with_velocity([n1, n2, n3, n4, n5], [100, 60])` → 100, 60, 100, 60, 100.
3. `test_with_velocity_human_profile_in_range` — 'human' profile produces values in 67-83 range (75 ± 8).
4. `test_with_velocity_ghost_profile_in_range` — 'ghost' produces values in 30-43 range.
5. `test_with_velocity_accent_profile_in_range` — 'accent' produces values in 105-120 range.
6. `test_with_velocity_crescendo_first_is_quiet_last_is_loud` — crescendo profile: first note ≤ 50, last note ≥ 80.
7. `test_with_velocity_decrescendo_first_is_loud_last_is_quiet` — opposite.
8. `test_with_velocity_skips_rests` — sequence `[note, rest, note]` with pattern `[100, 60]` → notes get 100 and 60; rest is untouched.
9. `test_with_velocity_invalid_pattern_raises` — `with_velocity(notes, 'unknown')` raises ValueError.
10. `test_with_velocity_empty_list_pattern_raises` — `with_velocity(notes, [])` raises ValueError.
11. `test_with_velocity_clamps_above_127` — `with_velocity(notes, 200)` clamps to 127.
12. `test_with_velocity_clamps_below_1` — `with_velocity(notes, -5)` clamps to 1.

### Prompt-fragment addition

Add to `MUSIC_PROMPT_FRAGMENT` (find the appropriate location — after the existing helpers list):

```
- For percussion (and any rhythmic content), vary note velocities to
  avoid robotic-sounding output. Use `with_velocity(notes, pattern)`
  with 'human' as a sensible default. Use 'ghost' for soft hits between
  accented hits (e.g., snare ghost notes); 'accent' for the loud hits
  that punch. Cyclic int lists like `[100, 60, 80, 60]` apply per-beat
  emphasis patterns. Default music21 velocity is 90; uniform 90 sounds
  like a drum machine. Always apply some variation for content where
  rhythm is the focus.
```

### Commit

`[2026-06-02-1935-percussion-murmuration-...] Phase A — with_velocity helper for per-note velocity patterns`. Commit + push for `forge` (engine + tests) and `forge-client-obsidian` (bundle mirror). No version bump yet; deferred to Phase E.

## Implementation notes — Phase B (articulation: open vs closed hi-hat)

### Investigation step

Before designing helpers, investigate music21's current support:

```bash
cd ~/projects/forge && python -c "
from music21 import instrument
import inspect
# Find all Instrument subclasses that mention 'hihat', 'hi-hat', or 'cymbal' in their name or docstring.
for name, obj in inspect.getmembers(instrument):
    if inspect.isclass(obj) and issubclass(obj, instrument.Instrument):
        if 'hihat' in name.lower() or 'cymbal' in name.lower() or 'hat' in name.lower():
            print(f'{name}: midiProgram={getattr(obj(), \"midiProgram\", None)}, midiChannel={getattr(obj(), \"midiChannel\", None)}')
"
```

Report what music21 exposes. Specifically check for:
- `HiHatCymbal` (currently used in `drums_shuffle.md`)
- Any open/closed/pedal variant classes
- `SuspendedCymbal`, `CrashCymbals`, `RideCymbals`, `Cymbals`
- `Triangle`, `Cowbell`, etc. (auxiliary percussion useful for later)

Also check music21 articulation support for percussion:

```bash
cd ~/projects/forge && python -c "
from music21 import articulations
# List articulation classes
import inspect
for name, obj in inspect.getmembers(articulations):
    if inspect.isclass(obj) and issubclass(obj, articulations.Articulation):
        if name != 'Articulation':
            print(name)
"
```

Look specifically for `Accent`, `Staccato`, `Tenuto`, anything percussion-flavored.

### Design (informed by investigation)

Most likely outcome based on music21's general percussion API:
- One `HiHatCymbal` class; open vs closed is differentiated by MIDI note number (42 = closed, 46 = open) rather than separate classes.
- Standard articulations exist (`Accent`, `Staccato`) but apply more naturally to melodic content than to percussion.

Likely design:

```python
def closed_hihat():
    """Returns an instrument configured for closed hi-hat sound.
    Uses music21.instrument.HiHatCymbal with MIDI program/note 42
    (General MIDI 'Closed Hi-Hat'). Channel 10 (GM percussion)."""
    inst = instrument.HiHatCymbal()
    inst.midiChannel = 10
    inst.midiProgram = 42
    return inst


def open_hihat():
    """Returns an instrument configured for open hi-hat sound.
    Same shape as closed_hihat but MIDI program/note 46 (GM 'Open
    Hi-Hat'). When alternating closed/open in a hi-hat pattern,
    use these as two separate Parts in the voices() composition;
    visually they'll render as two staves but the audio will
    distinguish."""
    inst = instrument.HiHatCymbal()
    inst.midiChannel = 10
    inst.midiProgram = 46
    return inst


def pedal_hihat():
    """Foot-pedal hi-hat (chick). GM program 44."""
    inst = instrument.HiHatCymbal()
    inst.midiChannel = 10
    inst.midiProgram = 44
    return inst
```

Adjust per investigation findings. If music21 has distinct classes for open/closed hi-hat, use those instead.

### Tests

1. `test_closed_hihat_uses_gm_program_42` — `closed_hihat().midiProgram == 42`.
2. `test_open_hihat_uses_gm_program_46` — `open_hihat().midiProgram == 46`.
3. `test_pedal_hihat_uses_gm_program_44` — `pedal_hihat().midiProgram == 44`.
4. `test_hihat_factories_all_on_channel_10` — all three return instruments on MIDI channel 10 (GM percussion).
5. `test_hihat_factories_return_HiHatCymbal_instances` — `isinstance(closed_hihat(), instrument.HiHatCymbal)` (or whatever class music21 uses).

### Prompt-fragment addition

```
- Hi-hat has three articulations in music21: closed (default, short
  "ts" sound), open (longer "tsh" sound), pedal (foot chick). Use
  `closed_hihat()`, `open_hihat()`, `pedal_hihat()` from the lib for
  each — they configure correct GM MIDI programs (42 / 46 / 44) on
  channel 10 (percussion). Alternating closed and open across a
  pattern requires two separate Parts in `voices()` composition;
  visually that's two staves, but the audio differentiates clearly.
```

### Commit

`[2026-06-02-1935-percussion-murmuration-...] Phase B — articulation: open/closed/pedal hi-hat factory helpers`. Same commit + push pattern.

## Implementation notes — Phase C (more percussion instruments)

### Investigation step

```bash
cd ~/projects/forge && python -c "
from music21 import instrument
import inspect
# Comprehensive percussion catalog
percussion_keywords = ['drum', 'cymbal', 'tom', 'snare', 'kick', 'bass',
                       'tympani', 'timpani', 'maracas', 'triangle',
                       'woodblock', 'tambourine', 'cowbell', 'agogo',
                       'conga', 'bongo', 'tabla', 'castanets']
seen = set()
for name, obj in inspect.getmembers(instrument):
    if inspect.isclass(obj) and issubclass(obj, instrument.Instrument):
        if any(kw in name.lower() for kw in percussion_keywords):
            if name not in seen:
                seen.add(name)
                inst_obj = obj()
                print(f'{name}: midiProgram={getattr(inst_obj, \"midiProgram\", None)}, midiChannel={getattr(inst_obj, \"midiChannel\", None)}')
"
```

Capture the output verbatim in feedback. Determines what classes music21 actually exposes vs what needs custom MIDI program configuration.

### Design

Add factory helpers for the kit pieces the piece needs:

```python
def low_tom():
    """Low tom (floor tom). GM 'Low Tom' = MIDI note 41 on channel 10."""
    # If music21 has TomTom, use it; otherwise BassDrum + override.
    # Investigation step determines which.
    ...


def mid_tom():
    """Mid tom. GM 'Mid Tom 1' = MIDI note 47."""
    ...


def high_tom():
    """High tom. GM 'High Tom' = MIDI note 50."""
    ...


def crash_cymbal():
    """Crash cymbal. GM 'Crash Cymbal 1' = MIDI note 49 on channel 10."""
    ...


def ride_cymbal():
    """Ride cymbal. GM 'Ride Cymbal 1' = MIDI note 51 on channel 10."""
    ...
```

Each helper follows the same shape as Phase B's hi-hat factories: configure the right music21 instrument class + MIDI channel 10 + correct MIDI program/note.

If music21 doesn't have specific classes for some of these, use the generic `instrument.UnpitchedPercussion()` or `instrument.Percussion()` (per investigation) with explicit MIDI configuration.

### Tests

For each helper, one case asserting it returns an instrument on channel 10 with the correct MIDI program:

```python
def test_low_tom_uses_channel_10_and_gm_program_41():
    inst = low_tom()
    assert inst.midiChannel == 10
    assert inst.midiProgram == 41
```

5 helpers × 1 test each = 5 cases.

### Prompt-fragment addition

```
- Beyond kick / snare / hi-hat, common kit pieces have lib factory
  helpers: `low_tom()`, `mid_tom()`, `high_tom()` for the three toms
  (GM notes 41 / 47 / 50); `crash_cymbal()`, `ride_cymbal()` for the
  two main cymbals (GM 49 / 51). All on MIDI channel 10. Use these
  by preference over hand-configuring music21 instrument classes —
  the factories ensure correct GM channel + program for playback.
```

### Commit

`[2026-06-02-1935-percussion-murmuration-...] Phase C — percussion instrument factory helpers: toms + cymbals`.

## Implementation notes — Phase D (the piece: `percussion/murmuration.md`)

### Subdir creation

```bash
mkdir -p ~/projects/forge-music/percussion/
```

No `forge.toml` in this subdir — it's a content partition within forge-music, not a sub-library. Same convention as `blues/`.

### Snippet: `percussion/murmuration.md`

**English facet:**

```
# Murmuration

A starling flock at dusk. One bird turns; another follows; soon
thousands move as a single mind, then disperse back into the trees.
This piece traces that arc through pure percussion — no melodic
content, no harmony, just rhythm gathering and dispersing across
~80 seconds.

Eight 4-bar sections at 96 BPM in 4/4, structured symmetrically
around a peak:

  1. Solitary (bars 1-4):    Just the kick — one bird, slow turns.
  2. Companions (bars 5-8):  Add closed hi-hat — a few birds joining.
  3. Gathering (bars 9-12):  Add snare with ghost notes — dozens.
  4. Swarming (bars 13-16):  Add toms + open hi-hat punches.
  5. Murmuration (bars 17-20): Peak — crash cymbal, full kit, rolls.
  6. Dispersing (bars 21-24): Cymbal fades, toms drop, settling.
  7. Threading (bars 25-28): Back to kick + hi-hat + soft snare.
  8. Resting (bars 29-32):   Kick alone again; last hit, then silence.

The arc is the piece. Velocity carries the dynamic story: quiet at
the edges, loud at the peak. Articulation distinguishes closed-hi-hat
calm from open-hi-hat punch. Uses `with_velocity()` for the dynamic
profile per section; uses `closed_hihat()`, `open_hihat()`,
`low_tom()`, `mid_tom()`, `crash_cymbal()` from the lib.

Uses six Parts (one per instrument) per the per-instrument-Part
convention — renders as six stacked staves in Verovio. The visual
density is the price of the piece's instrumental range; for a
high-fidelity rendering, download the MusicXML and open in MuseScore.
```

**Python facet (sketch — CC fills in the per-section measure construction following the pattern):**

```python
def compute(context):
    ts = meter.TimeSignature('4/4')
    mm = tempo.MetronomeMark(number=96)
    bar_ql = ts.barDuration.quarterLength  # 4.0

    # Build each instrument as its own Part. Each Part gets 32 bars
    # of content following the section arc.

    # Section helpers: build the hits for each section per instrument.
    # Each helper returns a list of notes for a 4-bar section.

    def kick_section(section_idx):
        """Returns 4 bars of kick notes per the section arc."""
        # Solitary, Companions, Threading, Resting: kick on beats 1, 3.
        # Gathering, Swarming, Dispersing: kick on beats 1, 3 with
        #   ghost variation.
        # Murmuration: kick on every beat (1, 2, 3, 4) for density.
        # ... CC: fill in the per-section pattern ...

    def hihat_section(section_idx, is_open=False):
        """Returns 4 bars of closed (or open) hi-hat per the section arc.
        Sections 1, 8: no hi-hat (return rests).
        Sections 2, 7: closed hi-hat on every quarter.
        Sections 3, 6: closed hi-hat on every 8th.
        Sections 4: open hi-hat on beat 4, closed elsewhere.
        Section 5 (Murmuration): mix of open and closed, denser.
        """
        # ... CC: fill in ...

    def snare_section(section_idx):
        """Returns 4 bars of snare per the section arc.
        Sections 1, 2, 8: no snare.
        Section 3: ghost notes on '+' of each beat + accent on beat 4.
        Section 4: ghost + accent on 2 and 4.
        Section 5 (Murmuration): 16th-note rolls + accents everywhere.
        Section 6: pulling back — accents only.
        Section 7: occasional ghost notes.
        """

    def low_tom_section(section_idx):
        """Sections 1-3: no toms.
        Section 4: low tom on beat 2 and "and-of-4".
        Section 5: low tom fills + double-tom patterns.
        Section 6: thinning back.
        Sections 7-8: no toms.
        """

    def mid_tom_section(section_idx):
        """Similar arc to low_tom — mid tom enters at Swarming, peaks
        at Murmuration, drops at Dispersing."""

    def crash_section(section_idx):
        """Sections 1-4, 6-8: no crash.
        Section 5 (Murmuration): crash on bar-1 downbeat + bar-3 downbeat."""

    # Build each Part by concatenating section helpers and applying
    # velocity profiles per section.

    section_velocity_profiles = [
        70,             # 1 Solitary — quiet, uniform
        'human',        # 2 Companions — small variation
        'human',        # 3 Gathering — small variation, with ghost/accent mixing in for snare
        'human',        # 4 Swarming — building intensity
        'accent',       # 5 Murmuration — peak loud
        'decrescendo',  # 6 Dispersing — fading
        'human',        # 7 Threading — quiet, varied
        50,             # 8 Resting — uniform quiet
    ]

    # Use lib.bar() to construct each 4-bar measure block, applying
    # velocity before assembling. For each instrument's 32 bars:
    #   for section_idx in range(8):
    #     hits = instrument_section_fn(section_idx)
    #     with_velocity(hits, section_velocity_profiles[section_idx])
    #     # ... pack into 4 Measure objects ...

    # Compose all 6 Parts via voices().
    return voices(kick_part, snare_part, closed_hh_part, open_hh_part,
                  low_tom_part, mid_tom_part, crash_part)
```

CC: implement the section helpers and Part assembly. Aim for musical interest within each section while preserving the arc. Don't over-engineer the per-note specifics; the LLM can make musical choices within the section framing.

### Test for the piece

Add to `~/projects/forge/tests/music/test_blues_content_invariants.py` (or create new `test_percussion_content_invariants.py` if the file structure suggests separation):

```python
def test_murmuration_returns_valid_score(run_music_block):
    """percussion/murmuration: 32 bars in 4/4. Each Part's measures
    sum to 4.0 quarterLength (bar_ql for 4/4). At least 5 Parts
    (kick, snare, hi-hat closed, low tom, etc. — exact count depends
    on CC's realization)."""
    result = run_music_block("murmuration")
    assert isinstance(result, stream.Score)
    parts = list(result.parts)
    assert len(parts) >= 5
    for part in parts:
        measures = list(part.getElementsByClass(stream.Measure))
        assert len(measures) == 32, f"part has {len(measures)} bars, expected 32"
        for m in measures:
            total = sum(el.duration.quarterLength for el in m.notesAndRests)
            assert abs(total - 4.0) < 1e-6, (
                f"part {part.id} measure {m.number} total = {total}, expected 4.0"
            )


def test_murmuration_has_velocity_variation():
    """The piece should exhibit velocity variation — robotic uniform
    velocity (every hit at 90) would defeat the velocity helpers'
    purpose."""
    result = run_music_block("murmuration")
    velocities = []
    for part in result.parts:
        for n in part.flatten().notes:
            if hasattr(n, 'volume') and n.volume.velocity is not None:
                velocities.append(n.volume.velocity)
    assert len(set(velocities)) >= 5, (
        f"only {len(set(velocities))} distinct velocity values across the piece — "
        f"velocity variation isn't landing as designed"
    )
```

### Bundle mirror

```bash
mkdir -p ~/projects/forge-client-obsidian/assets/vaults/forge-music/percussion/
cp ~/projects/forge-music/percussion/murmuration.md \
   ~/projects/forge-client-obsidian/assets/vaults/forge-music/percussion/murmuration.md
diff ~/projects/forge-music/percussion/murmuration.md \
     ~/projects/forge-client-obsidian/assets/vaults/forge-music/percussion/murmuration.md
# Expect no output.
```

### Version bump

`~/projects/forge-music/forge.toml`: 0.3.5 → 0.3.6 + tag.

### Commit

`[2026-06-02-1935-percussion-murmuration-...] Phase D — percussion/ partition + murmuration piece (32 bars, 6-instrument kit, velocity + articulation showcase)`. Commit + push for `forge`, `forge-music`, `forge-client-obsidian`.

## Implementation notes — Phase E (release)

- Plugin manifest 0.2.33 → 0.2.34.
- `cd ~/projects/forge-client-obsidian && npm run build && npm run release-zip`. Capture path, size, SHA-256. Engine-bundle drift preflight must pass (will, given Phases A-D mirrored cleanly).
- Clean-vault smoke per cc-prompt-queue.md §141: extract zip into tmpdir, confirm:
  - `assets/engine/forge/music/lib.py` contains `with_velocity`, `closed_hihat`, `open_hihat`, `low_tom`, `crash_cymbal`, etc. (sanity check helpers landed in bundle).
  - `assets/vaults/forge-music/percussion/murmuration.md` exists.
  - Manifest at v0.2.34.
- `gh release create v0.2.34` with zip; SHA round-trip via `gh release view --json assets --jq`.

## Tests

**Auto-verifiable by CC (run all; report results):**

- Phase A: 12 new test cases in `tests/music/test_lib.py` for `with_velocity`. Run `pytest -q tests/music/test_lib.py`; report `X/X`.
- Phase B: 5 new test cases for hi-hat factories. Same target.
- Phase C: 5 new test cases for tom + cymbal factories. Same target.
- Phase D: 2 new test cases for the piece (shape + velocity variation). Run `pytest -q tests/music/test_percussion_content_invariants.py` (or wherever placed).
- Full suite: `pytest -q` in forge; report `X/X` (count grows by 12 + 5 + 5 + 2 = 24 from Phase A-D).
- Plugin suite: `npm test` in forge-client-obsidian; expect unchanged from v0.2.33 (148).
- Bundle-mirror drift checks: `diff forge/music/lib.py forge-client-obsidian/assets/engine/forge/music/lib.py` (no output post-each-phase). Same for `llm_prompt.py`. Vault diff `diff -r forge-music/percussion/ forge-client-obsidian/assets/vaults/forge-music/percussion/` post-Phase-D (no output).
- Engine-bundle drift preflight at release-zip time (the post-v0.2.30 infrastructure).
- Clean-vault smoke before tag (helpers + piece file presence inside zip).

**Deferred to user (Obsidian-context — the load-bearing creative payoff):**

- Install plugin v0.2.34 via `VAULT=~/forge-vaults/test1 bash ~/projects/forge-client-obsidian/scripts/install-latest.sh`. Confirm version.
- Delete `~/forge-vaults/test1/forge-music/` so the new bundle re-extracts on relaunch.
- Cmd-Q + reopen Obsidian.
- Confirm `~/forge-vaults/test1/forge-music/percussion/murmuration.md` appears in the file tree.
- Forge-click `murmuration.md` → click **Forge** ribbon icon.
- **Eyeball the rendered output:**
  - Six stacked staves (one per instrument)?
  - Sectional contrast visible (sparse early, dense in middle, sparse late)?
  - 32 bars in 4/4 with the section arc?
- **Listen via the in-Obsidian `<midi-player>`:**
  - The arc is the load-bearing artistic outcome. Quiet start; gradual layering; recognizable peak around bars 17-20; settling back; final hit.
  - Velocity variation audible (not robotic / drum-machine-flat)?
  - Open vs closed hi-hat audible distinction in the Swarming + Murmuration sections?
- Optionally: download the MusicXML, open in MuseScore for high-fidelity rendering. Confirm percussion clefs visible.
- Optionally: download the MIDI, open in GarageBand for full-instrument playback. Confirm crash cymbal, toms, hi-hat distinctions all play with their correct sounds.

## Out of scope

- Integrating drums (any) into the blues song. Percussion lives in its own partition; integration is a separate future thread when you decide to.
- Pattern-template helpers (`shuffle_drums()`, `swing_drums()`, etc.) for genre-style abstractions. Library content; not needed for this piece.
- Drum-fill abstraction helpers — fills in this piece are composed inline as part of the Murmuration section.
- Velocity profiles beyond the 5 named ('human', 'ghost', 'accent', 'crescendo', 'decrescendo') + int/list. More can be added on demand.
- Articulation beyond open/closed/pedal hi-hat. Snare rim shots, cymbal chokes, etc. are real but defer until needed.
- More auxiliary percussion (cowbell, tambourine, shaker, etc.). Add when a piece calls for them.
- Migration of `blues/drums_shuffle.md` to use the new helpers. Spike snippet stays as-is; could revisit in a future cleanup.
- Constitution amendment for the `percussion/` partition. Mirrors A5.1 (library-subdirectory) applied within a library vault. No new clause needed; if forge-core's second-pass review disagrees, restructure.
- forge-core surface questions (Verovio clef rendering, in-plugin player vs download UX, `html-midi-player` SoundFont network dependency). All known and tracked separately.

## Report when done

Standard cc-prompt-queue.md feedback structure, plus per-phase sections:

**§Phase A — Velocity helper:**
- Final `with_velocity` signature + body (inline).
- 12 test cases listed; verbatim `pytest -q` output for the new cases.
- MUSIC_PROMPT_FRAGMENT diff.
- Bundle mirror diff clean.
- Commit SHA + push.

**§Phase B — Articulation:**
- Investigation findings (music21's hi-hat / cymbal / articulation catalog).
- Factory helper designs landed.
- 5 test cases; verbatim output.
- MUSIC_PROMPT_FRAGMENT diff.
- Bundle mirror clean.
- Commit SHA + push.

**§Phase C — More instruments:**
- Investigation findings (music21's percussion catalog).
- Factory helpers landed.
- 5 test cases; verbatim output.
- MUSIC_PROMPT_FRAGMENT diff.
- Bundle mirror clean.
- Commit SHA + push.

**§Phase D — Murmuration:**
- Final English facet (inline).
- Final Python facet (inline — full content, since this is a creative artifact).
- Test results (2 cases for the piece).
- forge-music version bump 0.3.5 → 0.3.6 + tag.
- Bundle mirror clean.
- Commit SHAs + push (3 repos touched: forge, forge-music, forge-client-obsidian).

**§Phase E — Release:**
- Plugin manifest bump.
- Zip path, size, SHA-256, GH Release URL.
- SHA round-trip clean.
- Clean-vault smoke output (helpers present in bundled `lib.py`; `murmuration.md` present in bundled vault).

**§Smoke split:** auto / deferred enumerated.

**§Follow-ups noted but not built:**
- Track anything CC notices but doesn't act on (additional articulation needs surfaced by the piece, additional instruments wanted, etc.).
- Standing items from prior drains.

**§Protocol comments for driver:** observations on the 5-phase bundling, the helper-first-then-content sequence, any music21 percussion-API gotchas surfaced, anything that should inform future content-creation prompts.

**§11 Constitutional alignment** per cowork-protocol's four-level disposition:
- Phase A-C are pure helper additions (Level 1 silent approve OR Level 2 flag-and-propose if the helper API surface is notable enough to document).
- Phase D introduces a new content partition convention (`<piece-genre>/` subdir within a library vault). Per A5.1's library-subdirectory clause, this is consistent with existing convention. Likely Level 1; flag to forge-core if you disagree.

## Don'ts

- **Don't conflate phase commits.** Each phase commits + pushes before the next begins. Failure isolation per established pattern.
- **Don't over-prescribe the per-note specifics of the piece.** The English facet describes the arc; CC's Python facet realizes it within the section framing. Leave room for musical choice within each section.
- **Don't add instruments or articulation kinds beyond what the piece needs.** The piece's instrument list (kick, snare, closed hi-hat, open hi-hat, low tom, mid tom, crash cymbal) is the scope. More on demand.
- **Don't migrate `blues/drums_shuffle.md` to use the new helpers.** Spike snippet stays; cleanup separate.
- **Don't integrate the piece into the blues song.** Pure percussion lives in its own partition.
- **Don't ship a Verovio-percussion-renderer fix.** Renderer concerns are forge-core; the piece is composed against current rendering reality.
- **Don't `gh release create` for forge-music.** Tag + push only on that repo. Plugin gets the GH Release.
- **Don't skip the clean-vault smoke before tagging.** Release-shipping rule.
- **Don't skip the "test_murmuration_has_velocity_variation" test.** If the piece comes out velocity-uniform, the velocity helper is unused — defeats the prompt's whole structure. The test catches that pre-ship.
- **Don't run destructive git ops.** Standard commits + tag + push + GH release only.
