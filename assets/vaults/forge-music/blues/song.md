---
type: action
description: action
inputs: []
---

# English


The whole 12-bar blues. Three vocal choruses with an instrumental solo chorus between the second and third. Total length: 48 bars (4 choruses × 12). The arc: introduce the lyric (first [[chorus]]), repeat with more weight (second [[chorus]]), break open into the solo ([[solo_chorus]]), come back changed (third [[chorus]]). Slow blues in E, around 70 BPM, eighth-note triplet feel.

Composes four sections played end-to-end: [[chorus]] (called three times) and [[solo_chorus]] (called once between choruses 2 and 3). Each section is overlaid with a [[drum_chorus]] whose profile shapes the song's drum arc: a sparse profile (`mp`, ghost-note snares, kick+snare+sparse hi-hat) introduces the lyric; standard (`mf`, full kick+snare+hi-hat with one ghost per bar) carries the mid choruses; driving (`f`, full kit with ride cymbal, accented backbeat, opening crash) supports the solo. Each chorus's drum profile is chosen here in `song`; the drum logic lives in [[drum_chorus]].

Key, time signature, and tempo all inherited from [[form]] transitively via [[chorus]] and [[solo_chorus]]. Transposing [[form]] propagates through the whole song.

---

# Python

```python
def compute(context):
    # Section profiles shape the song's drum arc:
    # intro (sparse) → fuller chorus (standard) → solo (driving) → return (standard).
    chorus1_drums = context.compute("drum_chorus", profile='sparse')
    chorus2_drums = context.compute("drum_chorus", profile='standard')
    solo_drums    = context.compute("drum_chorus", profile='driving')
    chorus3_drums = context.compute("drum_chorus", profile='standard')

    chorus1 = voices(context.compute("chorus"),       chorus1_drums)
    chorus2 = voices(context.compute("chorus"),       chorus2_drums)
    solo    = voices(context.compute("solo_chorus"),  solo_drums)
    chorus3 = voices(context.compute("chorus"),       chorus3_drums)

    return sequence(chorus1, chorus2, solo, chorus3)
```

# Dependencies

*Synced from Python. Edit the Python and regenerate, or run "Forge: Sync edges" to refresh.*

[[chorus]] [[solo_chorus]] [[drum_chorus]]
