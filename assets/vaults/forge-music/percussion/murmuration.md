---
type: action
description: murmuration
inputs: []
---

# English


A starling flock at dusk. One bird turns; another follows; soon thousands move as a single mind, then disperse back into the trees. This piece traces that arc through pure percussion — no melodic content, no harmony, just rhythm gathering and dispersing across ~80 seconds.

Eight 4-bar sections at 96 BPM in 4/4, structured symmetrically around a peak:

1. **Solitary** (bars 1-4): Just the kick — one bird, slow turns.
2. **Companions** (bars 5-8): Add closed hi-hat — a few birds joining.
3. **Gathering** (bars 9-12): Add snare with ghost notes — dozens.
4. **Swarming** (bars 13-16): Add toms + open hi-hat punches.
5. **Murmuration** (bars 17-20): Peak — crash cymbal, full kit, rolls.
6. **Dispersing** (bars 21-24): Cymbal fades, toms drop, settling.
7. **Threading** (bars 25-28): Back to kick + hi-hat + soft snare.
8. **Resting** (bars 29-32): Kick alone again; last hit, then silence.

The arc is the piece. Velocity carries the dynamic story: quiet at the edges, loud at the peak. Articulation distinguishes closed-hi-hat calm from open-hi-hat punch. Uses `with_velocity()` for the dynamic profile per section; uses `closed_hihat()`, `open_hihat()`, `low_tom()`, `mid_tom()`, `crash_cymbal()` from the lib.

The dynamic arc is now marked in the score itself (`pp` at edges, `ff` at the Murmuration peak, hairpins on Crescendo/Decrescendo sections) — visible in MuseScore, not just heard in MIDI — via `with_velocity(..., mark_dynamics=True)`.

Renders as multiple stacked staves in Verovio (one per instrument); for high-fidelity rendering, download the MusicXML and open in MuseScore.

---

# Python

```python
def compute(context):
    import copy as _copy
    ts = meter.TimeSignature('4/4')
    mm = tempo.MetronomeMark(number=96)
    bar_ql = ts.barDuration.quarterLength  # 4.0
    eighth = 0.5
    sixteenth = 0.25
    quarter = 1.0

    # Velocity profiles per section.
    section_profiles = [
        70,             # 1 Solitary
        'human',        # 2 Companions
        'human',        # 3 Gathering
        'human',        # 4 Swarming
        'accent',       # 5 Murmuration peak
        'decrescendo',  # 6 Dispersing
        'human',        # 7 Threading
        50,             # 8 Resting
    ]

    # ---- Per-instrument, per-section hit builders. Each returns a
    # list of length-4 lists of Measures (1 sublist per section, 4
    # bars each). ----

    def kick_bar(pattern):
        """pattern is a list of (offset_in_quarters, duration) pairs.
        Bars without hits fill with a single Rest of bar_ql."""
        items = []
        cursor = 0.0
        for off, dur in pattern:
            if off > cursor:
                items.append(note.Rest(quarterLength=off - cursor))
                cursor = off
            items.append(note.Note('C4', quarterLength=dur))
            cursor += dur
        if cursor < bar_ql:
            items.append(note.Rest(quarterLength=bar_ql - cursor))
        return items

    def make_section_measures(section_idx, bar_patterns, profile):
        """bar_patterns: 4 lists (one per bar). Each is a list of
        (offset, duration) hit specs (empty list = full rest bar).
        Returns 4 Measures. Velocity profile applied to non-rest notes
        across the section."""
        measures = []
        all_notes = []
        for bar_idx, pattern in enumerate(bar_patterns):
            measure_number = section_idx * 4 + bar_idx + 1
            items = kick_bar(pattern) if pattern else [note.Rest(quarterLength=bar_ql)]
            for it in items:
                if isinstance(it, note.Note):
                    all_notes.append(it)
            m = stream.Measure(number=measure_number)
            if measure_number == 1:
                m.append(_copy.deepcopy(ts))
                m.append(_copy.deepcopy(mm))
            for it in items:
                m.append(it)
            measures.append(m)
        with_velocity(all_notes, profile, mark_dynamics=True)
        return measures

    # ---- Per-instrument section schedules ----

    # Kick: present in every section. Density grows toward Murmuration.
    kick_sections = [
        # Solitary: beats 1, 3
        [[(0.0, 0.25), (2.0, 0.25)]] * 4,
        # Companions: beats 1, 3
        [[(0.0, 0.25), (2.0, 0.25)]] * 4,
        # Gathering: beats 1, 3 + occasional and-of-2
        [[(0.0, 0.25), (1.5, 0.25), (2.0, 0.25)],
         [(0.0, 0.25), (2.0, 0.25)],
         [(0.0, 0.25), (1.5, 0.25), (2.0, 0.25)],
         [(0.0, 0.25), (2.0, 0.25), (3.5, 0.25)]],
        # Swarming: beats 1, 3 + more syncopation
        [[(0.0, 0.25), (1.5, 0.25), (2.0, 0.25), (3.5, 0.25)],
         [(0.0, 0.25), (2.0, 0.25)],
         [(0.0, 0.25), (1.5, 0.25), (2.0, 0.25), (3.5, 0.25)],
         [(0.0, 0.25), (2.0, 0.25)]],
        # Murmuration: kick on every beat
        [[(0.0, 0.25), (1.0, 0.25), (2.0, 0.25), (3.0, 0.25)]] * 4,
        # Dispersing: thinning out
        [[(0.0, 0.25), (2.0, 0.25), (3.5, 0.25)],
         [(0.0, 0.25), (2.0, 0.25)],
         [(0.0, 0.25), (2.0, 0.25)],
         [(0.0, 0.25)]],
        # Threading: beats 1, 3
        [[(0.0, 0.25), (2.0, 0.25)]] * 4,
        # Resting: bar 1 hit, then silence
        [[(0.0, 0.25), (2.0, 0.25)],
         [(0.0, 0.25)],
         [(0.0, 0.25)],
         [(0.0, 0.25)]],
    ]

    # Closed hi-hat: enters at Companions, present through Threading.
    closed_hh_sections = [
        # Solitary: silent
        [[]] * 4,
        # Companions: quarter notes
        [[(0.0, 0.25), (1.0, 0.25), (2.0, 0.25), (3.0, 0.25)]] * 4,
        # Gathering: eighths
        [[(i * 0.5, 0.25) for i in range(8)]] * 4,
        # Swarming: eighths
        [[(i * 0.5, 0.25) for i in range(8)]] * 4,
        # Murmuration: silent (open hi-hat takes over)
        [[]] * 4,
        # Dispersing: back to eighths but quieter (handled via velocity profile)
        [[(i * 0.5, 0.25) for i in range(8)]] * 4,
        # Threading: quarter notes
        [[(0.0, 0.25), (1.0, 0.25), (2.0, 0.25), (3.0, 0.25)]] * 4,
        # Resting: silent
        [[]] * 4,
    ]

    # Open hi-hat: enters Swarming on the "and of 4" of each bar, leads
    # the Murmuration section.
    open_hh_sections = [
        [[]] * 4,
        [[]] * 4,
        [[]] * 4,
        # Swarming: open on "and of 4"
        [[(3.5, 0.25)]] * 4,
        # Murmuration: open on every beat (the wash)
        [[(0.0, 0.25), (1.0, 0.25), (2.0, 0.25), (3.0, 0.25)]] * 4,
        # Dispersing: open on beat 1 only
        [[(0.0, 0.25)]] * 4,
        [[]] * 4,
        [[]] * 4,
    ]

    # Snare: enters Gathering with ghost notes; peaks Murmuration with rolls.
    snare_sections = [
        [[]] * 4,
        [[]] * 4,
        # Gathering: ghost notes on "and" of each beat
        [[(0.5, 0.25), (1.5, 0.25), (2.5, 0.25), (3.5, 0.25)]] * 4,
        # Swarming: backbeats (2, 4) + ghost notes
        [[(0.5, 0.25), (1.0, 0.25), (2.5, 0.25), (3.0, 0.25)]] * 4,
        # Murmuration: 16th-note rolls
        [[(i * 0.25, 0.25) for i in range(16)]] * 4,
        # Dispersing: backbeats only
        [[(1.0, 0.25), (3.0, 0.25)]] * 4,
        # Threading: occasional ghost notes
        [[(1.5, 0.25), (3.5, 0.25)]] * 4,
        [[]] * 4,
    ]

    # Low tom: enters Swarming, peaks Murmuration, drops Dispersing.
    low_tom_sections = [
        [[]] * 4,
        [[]] * 4,
        [[]] * 4,
        # Swarming: low tom on beat 2 + and-of-4
        [[(1.0, 0.25), (3.5, 0.25)]] * 4,
        # Murmuration: low tom on every beat
        [[(0.0, 0.25), (1.0, 0.25), (2.0, 0.25), (3.0, 0.25)]] * 4,
        # Dispersing: thinning
        [[(1.0, 0.25)]] * 4,
        [[]] * 4,
        [[]] * 4,
    ]

    # Mid tom: enters Swarming alongside low tom; peaks Murmuration.
    mid_tom_sections = [
        [[]] * 4,
        [[]] * 4,
        [[]] * 4,
        # Swarming: mid tom on "and of 2"
        [[(1.5, 0.25)]] * 4,
        # Murmuration: mid tom on offbeats
        [[(0.5, 0.25), (1.5, 0.25), (2.5, 0.25), (3.5, 0.25)]] * 4,
        # Dispersing
        [[(1.5, 0.25)]] * 4,
        [[]] * 4,
        [[]] * 4,
    ]

    # Crash cymbal: ONLY in Murmuration, on bars 1 and 3 downbeats.
    crash_sections = [
        [[]] * 4,
        [[]] * 4,
        [[]] * 4,
        [[]] * 4,
        # Murmuration: crash on bar-1 + bar-3 downbeat (section bars 1, 3)
        [[(0.0, 0.25)], [], [(0.0, 0.25)], []],
        [[]] * 4,
        [[]] * 4,
        [[]] * 4,
    ]

    # ---- Assemble Parts ----

    def build_part(inst, sections):
        part = stream.Part()
        part.append(inst)
        for section_idx, bar_patterns in enumerate(sections):
            measures = make_section_measures(
                section_idx, bar_patterns, section_profiles[section_idx]
            )
            for m in measures:
                part.append(m)
        return part

    kick_part      = build_part(instrument.BassDrum(),    kick_sections)
    closed_hh_part = build_part(closed_hihat(),           closed_hh_sections)
    open_hh_part   = build_part(open_hihat(),             open_hh_sections)
    snare_part     = build_part(instrument.SnareDrum(),   snare_sections)
    low_tom_part   = build_part(low_tom(),                low_tom_sections)
    mid_tom_part   = build_part(mid_tom(),                mid_tom_sections)
    crash_part     = build_part(crash_cymbal(),           crash_sections)

    return voices(
        kick_part, snare_part, closed_hh_part, open_hh_part,
        low_tom_part, mid_tom_part, crash_part,
    )
```
