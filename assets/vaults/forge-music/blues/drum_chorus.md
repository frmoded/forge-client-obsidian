---
type: action
edit_mode: python
snapshot_capture: false
---

# Description

One 12-bar drum chorus parameterized by a profile name. The profile picks instrumentation, articulation, and dynamic level so the same call site can produce three different feels by changing one string. Used by [[song]] to give the 4-chorus arc audible/visible variety.

Three profiles:

- **sparse** (`mp`): kick on beats 1 and 3, snare on beats 2 and 4 plus a ghost note on the and-of-3 each bar, closed hi-hat on beats 1 and 3 only. No crash. The quietest profile — feels like an introduction.
- **standard** (`mf`): kick on beats 1 and 3, snare on beats 2 and 4 plus one ghost on and-of-4 each bar, closed hi-hat on all four dotted-quarter beats. No crash. Mid-density — typical chorus feel.
- **driving** (`f`): kick on all four beats, snare on beats 2 and 4 with accent velocity (no ghosts) on the backbeat, ride cymbal on all four beats (instead of closed hi-hat), crash cymbal on bar 1 beat 1. Loudest and fullest — supports the solo.

Velocity arc is marked in the score (`with_velocity(..., mark_dynamics=True)`) — the dynamic mark sits on the kick part as the section anchor so MuseScore shows one Italian abbreviation per chorus rather than one per drum staff. 12 bars in 12/8 at the same tempo the rest of the blues vault inherits from [[form]].

`snapshot_capture: false` because the returned Score holds music21 Instrument instances with bound method references (the `_force_perc_channel` lambda) that the wire-format snapshot can't serialize — same opt-out pattern as `percussion/phase_cell.md`.

# Recipe

<!-- engineer-mode: this snippet's logic lives in # Python. The
frontmatter carries `edit_mode: python` so Forge-click runs the
Python directly instead of transpiling Recipe → Python. -->

# Python

```python
def compute(context, profile='standard'):
    import copy as _copy
    ts = meter.TimeSignature('12/8')
    bar_ql = ts.barDuration.quarterLength  # 6.0
    eighth = 0.5
    dotted_q = 1.5

    # Dotted-quarter beat positions in quarterLength: 0, 1.5, 3.0, 4.5.
    BEAT_1, BEAT_2, BEAT_3, BEAT_4 = 0.0, 1.5, 3.0, 4.5

    def _drum_bar(hit_specs, bar_idx, attach_metadata):
        """hit_specs: list of (offset_in_quarters, duration_in_quarters)
        in ascending offset order. Fills gaps with Rests; pads tail to
        bar_ql. Returns (measure, list_of_non_rest_notes)."""
        m = stream.Measure(number=bar_idx + 1)
        if attach_metadata:
            m.append(ts)
        notes_added = []
        cursor = 0.0
        for off, dur in sorted(hit_specs):
            gap = off - cursor
            if gap > 0:
                m.append(note.Rest(quarterLength=gap))
                cursor += gap
            n = note.Note('C4', quarterLength=dur)
            m.append(n)
            notes_added.append(n)
            cursor += dur
        remaining = bar_ql - cursor
        if remaining > 0:
            m.append(note.Rest(quarterLength=remaining))
        return m, notes_added

    def build_part(inst_factory, per_bar_specs):
        """per_bar_specs: list of 12 hit-spec lists (one per bar).
        Returns (part, flat_list_of_non_rest_notes_across_part)."""
        part = stream.Part()
        part.append(inst_factory())
        all_notes = []
        for bar_idx in range(12):
            m, notes_in_bar = _drum_bar(
                per_bar_specs[bar_idx], bar_idx,
                attach_metadata=(bar_idx == 0),
            )
            part.append(m)
            all_notes.extend(notes_in_bar)
        return part, all_notes

    # --- Per-profile schedules ---

    if profile == 'sparse':
        kick_specs   = [[(BEAT_1, 0.5), (BEAT_3, 0.5)]] * 12
        snare_normal = [[(BEAT_2, 0.5), (BEAT_4, 0.5)]] * 12
        snare_ghost  = [[(BEAT_3 + eighth, eighth)]] * 12
        hh_specs     = [[(BEAT_1, 0.5), (BEAT_3, 0.5)]] * 12
        # No crash, no ride.

        kick_part,   kick_notes   = build_part(kick,          kick_specs)
        snare_part,  snare_notes  = build_part(snare,         snare_normal)
        ghost_part,  ghost_notes  = build_part(snare,         snare_ghost)
        hh_part,     hh_notes     = build_part(closed_hihat,  hh_specs)

        # Velocity: normal hits at 'mp' (uniform 60); ghosts at 'ghost' profile.
        anchor_first = kick_notes[:1]
        with_velocity(anchor_first, 65, mark_dynamics=True)  # mp mark on kick bar 1
        with_velocity(kick_notes[1:],  65)                   # rest of kick uniform
        with_velocity(snare_notes,     65)                   # snare uniform
        with_velocity(hh_notes,        65)                   # hi-hat uniform
        with_velocity(ghost_notes,     'ghost')              # ghost notes at ~35

        parts = [kick_part, snare_part, ghost_part, hh_part]

    elif profile == 'driving':
        kick_specs        = [[(BEAT_1, 0.5), (BEAT_2, 0.5),
                              (BEAT_3, 0.5), (BEAT_4, 0.5)]] * 12
        snare_backbeat    = [[(BEAT_2, 0.5), (BEAT_4, 0.5)]] * 12
        ride_specs        = [[(BEAT_1, 0.5), (BEAT_2, 0.5),
                              (BEAT_3, 0.5), (BEAT_4, 0.5)]] * 12
        crash_specs       = [[(BEAT_1, 0.5)]] + [[]] * 11   # crash only bar 1

        kick_part,  kick_notes  = build_part(kick,         kick_specs)
        snare_part, snare_notes = build_part(snare,        snare_backbeat)
        ride_part,  ride_notes  = build_part(ride_cymbal,  ride_specs)
        crash_part, crash_notes = build_part(crash_cymbal, crash_specs)

        # Driving: kick + ride on 'human' (mf nominal); snare backbeat at 'accent';
        # crash at uniform 100 (no separate mark).
        anchor_first = kick_notes[:1]
        with_velocity(anchor_first, 'human', mark_dynamics=True)  # mf mark on bar 1
        with_velocity(kick_notes[1:], 'human')                    # rest of kick
        with_velocity(snare_notes,    'accent')                   # backbeat ff
        with_velocity(ride_notes,     'human')                    # ride mf
        with_velocity(crash_notes,    100)                        # crash strong

        parts = [kick_part, snare_part, ride_part, crash_part]

    else:  # 'standard'
        kick_specs    = [[(BEAT_1, 0.5), (BEAT_3, 0.5)]] * 12
        snare_normal  = [[(BEAT_2, 0.5), (BEAT_4, 0.5)]] * 12
        snare_ghost   = [[(BEAT_4 + eighth, eighth)]] * 12
        hh_specs      = [[(BEAT_1, 0.5), (BEAT_2, 0.5),
                          (BEAT_3, 0.5), (BEAT_4, 0.5)]] * 12

        kick_part,  kick_notes  = build_part(kick,         kick_specs)
        snare_part, snare_notes = build_part(snare,        snare_normal)
        ghost_part, ghost_notes = build_part(snare,        snare_ghost)
        hh_part,    hh_notes    = build_part(closed_hihat, hh_specs)

        anchor_first = kick_notes[:1]
        with_velocity(anchor_first, 'human', mark_dynamics=True)  # mf mark on kick bar 1
        with_velocity(kick_notes[1:], 'human')
        with_velocity(snare_notes,    'human')
        with_velocity(hh_notes,       'human')
        with_velocity(ghost_notes,    'ghost')

        parts = [kick_part, snare_part, ghost_part, hh_part]

    return voices(*parts)
```
