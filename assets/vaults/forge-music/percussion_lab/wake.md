---
type: action
description: wake
inputs: []
snapshot_capture: false
---

# English


What's left after the murmuration. The flock has passed — texture lingers, voices return briefly to recall the climax, then a long fade through dispersing motion to silence. Where Murmuration is symmetric around a central peak, Wake is asymmetric — weighted toward the slow fade.

Six sections at 96 BPM in 4/4, 28 bars total, structured as a quiet opening + brief recall + long fade:

1. [[companions]](bars=8) — bars 1-8. Closed hi-hat texture remains, no kick yet. The whisper of presence after the flock has flown.
2. [[gathering]](bars=4) — bars 9-12. Snare ghosts and hi-hat eighths gather — voices stirring without committing to motion.
3. [[peak]](bars=2) — bars 13-14. A brief recall of the murmuration's peak — full kit + crash for two bars only, like a memory of climax. The shortest section.
4. [[dispersing]](bars=8) — bars 15-22. The long decrescendo fade. Decrescendo hairpin spans these 8 bars, instruments thinning across them.
5. [[threading]](bars=4) — bars 23-26. Soft snare returns over kick + hi-hat — the faint echo continuing past the dispersion.
6. [[resting]](bars=2) — bars 27-28. Kick alone for two bars, then silence.

The arc is asymmetric. The peak is brief and in the first third of the piece (bars 13-14 out of 28). The fade dominates the remainder. Same percussion vocabulary as Murmuration; different proportions; different feel.

Renders as multiple stacked staves in Verovio (one per instrument that plays anywhere across the piece); for high-fidelity rendering, download the MusicXML and open in MuseScore.

---

# Python

```python
def compute(context):
    companions = context.compute("companions", bars=8)
    gathering = context.compute("gathering", bars=4)
    peak = context.compute("peak", bars=2)
    dispersing = context.compute("dispersing", bars=8)
    threading = context.compute("threading", bars=4)
    resting = context.compute("resting", bars=2)

    return sequence(companions, gathering, peak, dispersing, threading, resting)
```

# Dependencies

[[companions]] [[gathering]] [[peak]] [[dispersing]] [[threading]] [[resting]]
