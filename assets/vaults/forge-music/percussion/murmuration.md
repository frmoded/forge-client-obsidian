---
type: action
description: murmuration
inputs: []
snapshot_capture: false
---

# English


A starling flock at dusk. One bird turns; another follows; soon thousands move as a single mind, then disperse back into the trees. This piece traces that arc through pure percussion — no melodic content, no harmony, just rhythm gathering and dispersing across ~80 seconds.

Eight 4-bar sections at 96 BPM in 4/4, structured symmetrically around a peak:

1. [[solitary]](bars=4) — bars 1-4. Just the kick — one bird, slow turns.
2. [[companions]](bars=4) — bars 5-8. Add closed hi-hat — a few birds joining.
3. [[gathering]](bars=4) — bars 9-12. Add snare with ghost notes — dozens.
4. [[swarming]](bars=4) — bars 13-16. Add toms + open hi-hat punches.
5. [[peak]](bars=4) — bars 17-20. The murmuration peak — crash cymbal, full kit, rolls.
6. [[dispersing]](bars=4) — bars 21-24. Cymbal fades, toms drop, settling.
7. [[threading]](bars=4) — bars 25-28. Back to kick + hi-hat + soft snare.
8. [[resting]](bars=4) — bars 29-32. Kick alone again; last hit, then silence.

The arc is the piece. Velocity carries the dynamic story: quiet at the edges, loud at the peak. Articulation distinguishes closed-hi-hat calm from open-hi-hat punch. The dynamic arc is marked in the score itself (one Italian abbreviation per section on the kick staff: `mp` for Solitary, `mf` for Companions / Gathering / Swarming / Threading, `ff` for the Murmuration peak, a `decrescendo` hairpin across Dispersing, `p` for Resting) — visible in MuseScore, audible in MIDI — via `with_velocity(..., mark_dynamics=True)` anchored on each section's kick part.

Decomposed into 8 callable section snippets in the `percussion_lab/` library so other pieces can use the same vocabulary. The arc above is the assembled order; individual sections may be called independently with custom `bars` for piece-specific variations.

Renders as multiple stacked staves in Verovio (one per instrument); for high-fidelity rendering, download the MusicXML and open in MuseScore.

---

# Python

```python
def compute(context):
    import copy

    sections = [
        context.compute("solitary", bars=4),
        context.compute("companions", bars=4),
        context.compute("gathering", bars=4),
        context.compute("swarming", bars=4),
        context.compute("peak", bars=4),
        context.compute("dispersing", bars=4),
        context.compute("threading", bars=4),
        context.compute("resting", bars=4),
    ]

    return sequence(*sections)
```

# Dependencies

[[solitary]] [[companions]] [[gathering]] [[swarming]] [[peak]] [[dispersing]] [[threading]] [[resting]]
