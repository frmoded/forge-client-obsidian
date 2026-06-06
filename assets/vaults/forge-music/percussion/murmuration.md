---
type: action
description: murmuration
inputs: []
snapshot_capture: false
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

The arc is the piece. Velocity carries the dynamic story: quiet at the edges, loud at the peak. Articulation distinguishes closed-hi-hat calm from open-hi-hat punch. The dynamic arc is marked in the score itself (one Italian abbreviation per section on the kick staff: `mp` for Solitary, `mf` for Companions / Gathering / Swarming / Threading, `ff` for the Murmuration peak, a `decrescendo` hairpin across Dispersing, `p` for Resting) — visible in MuseScore, audible in MIDI — via `with_velocity(..., mark_dynamics=True)` anchored on each section's kick part.

Decomposed into 8 callable section snippets in [[percussion_lab]] so other pieces can use the same vocabulary. The arc above is the assembled order; individual sections may be called independently with custom `bars` for piece-specific variations.

Renders as multiple stacked staves in Verovio (one per instrument); for high-fidelity rendering, download the MusicXML and open in MuseScore.

---

# Python

```python
def compute(context):
    # Bare references — match the existing forge-music compose pattern
    # (e.g., blues/song.md calls bare "chorus" / "drum_chorus"). In the
    # test fixture forge-music is scanned as the authoring vault so
    # basenames index flat. In production with forge-music as a
    # library vault, cross-subdir bare lookups have a known limitation
    # (caller-scoped probe checks the caller's own subdir only); see
    # the feedback file §4 for the full resolution-behavior analysis.
    return sequence(
        context.compute("solitary"),
        context.compute("companions"),
        context.compute("gathering"),
        context.compute("swarming"),
        context.compute("peak"),
        context.compute("dispersing"),
        context.compute("threading"),
        context.compute("resting"),
    )
```

# Dependencies

[[solitary]] [[companions]] [[gathering]] [[swarming]] [[peak]] [[dispersing]] [[threading]] [[resting]]
