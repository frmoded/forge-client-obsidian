---
type: action
description: action
inputs: []
---

# English


The instrumental chorus — 12 bars, no vocal. The guitar takes the lead via [[guitar_solo_chorus]]; the harmonic frame from [[form]] continues underneath. Sits between vocal choruses 2 and 3 in the song.

Composes [[form]]'s harmonic progression with [[guitar_solo_chorus]]'s improvisational solo line, played simultaneously. No new musical material introduced at this level — pure structural composition of the two leaves.

Inherits key, time signature (12/8), and tempo (around 70 BPM, eighth-note triplet feel) from [[form]] so the chorus stays coherent with the rest of the song under any of those changing.

---

# Python

```python
def compute(context):
    harmonic_frame = context.compute("form")
    solo_line = context.compute("guitar_solo_chorus")
    return voices(harmonic_frame, solo_line)
```

# Dependencies

*Synced from Python. Edit the Python and regenerate, or run "Forge: Sync edges" to refresh.*

[[form]] [[guitar_solo_chorus]]
