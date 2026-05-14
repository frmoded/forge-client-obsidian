---
type: action
description: action
inputs: []
---

# English


The whole 12-bar blues. Three vocal choruses with an instrumental solo chorus between the second and third. Total length: 48 bars (4 choruses × 12). The arc: introduce the lyric (first [[chorus]]), repeat with more weight (second [[chorus]]), break open into the solo ([[solo_chorus]]), come back changed (third [[chorus]]). Slow blues in E, around 70 BPM, eighth-note triplet feel.

Composes four sections played end-to-end: [[chorus]] (called three times) and [[solo_chorus]] (called once between choruses 2 and 3). No new musical material at this level — pure structural composition of the intermediates.

Key, time signature, and tempo all inherited from [[form]] transitively via [[chorus]] and [[solo_chorus]]. Transposing [[form]] propagates through the whole song.

---

# Python

```python
def compute(context):
    chorus1 = context.compute("chorus")
    chorus2 = context.compute("chorus")
    solo = context.compute("solo_chorus")
    chorus3 = context.compute("chorus")
    return sequence(chorus1, chorus2, solo, chorus3)
```

# Dependencies

*Synced from Python. Edit the Python and regenerate, or run "Forge: Sync edges" to refresh.*

[[chorus]] [[solo_chorus]]
