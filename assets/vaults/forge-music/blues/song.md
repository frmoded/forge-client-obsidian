---
type: action
---

# Description

A slow E blues, four 12-bar choruses, vocal lead with drums underneath.
The first chorus introduces the lyric; the second repeats with more
weight; the third opens to an instrumental solo on guitar; the fourth
comes back changed. Around 70 BPM, eighth-note triplet feel.

The drum arc shapes the dynamics: sparse for the intro, building
through standard for the second vocal, driving under the solo, then
back to standard for the closing chorus. The choruses are vocal
([[chorus]]) except the third, which is the instrumental [[solo_chorus]].

## Inputs

(none)

# Recipe

Let chorus1_drums = Call [[drum_chorus]] with profile="sparse".
Let chorus2_drums = Call [[drum_chorus]] with profile="standard".
Let solo_drums = Call [[drum_chorus]] with profile="driving".
Let chorus3_drums = Call [[drum_chorus]] with profile="standard".

Let chorus1_vocal = Call [[chorus]].
Let chorus2_vocal = Call [[chorus]].
Let chorus3_vocal = Call [[chorus]].
Let solo_line = Call [[solo_chorus]].

Let chorus1 = Call [[voices_list]] with sections=[chorus1_vocal, chorus1_drums].
Let chorus2 = Call [[voices_list]] with sections=[chorus2_vocal, chorus2_drums].
Let solo = Call [[voices_list]] with sections=[solo_line, solo_drums].
Let chorus3 = Call [[voices_list]] with sections=[chorus3_vocal, chorus3_drums].

Return Call [[sequence_list]] with sections=[chorus1, chorus2, solo, chorus3].

# Python

```python
def compute(context):
    # Section profiles shape the song's drum arc:
    # intro (sparse) → fuller chorus (standard) → solo (driving) → return (standard).
    # v0.7.0: drum_chorus is now a library note in forge.music.lib;
    # called directly instead of via context.compute.
    chorus1_drums = drum_chorus(profile='sparse')
    chorus2_drums = drum_chorus(profile='standard')
    solo_drums    = drum_chorus(profile='driving')
    chorus3_drums = drum_chorus(profile='standard')

    chorus1 = voices(context.compute("chorus"),       chorus1_drums)
    chorus2 = voices(context.compute("chorus"),       chorus2_drums)
    solo    = voices(context.compute("solo_chorus"),  solo_drums)
    chorus3 = voices(context.compute("chorus"),       chorus3_drums)

    return sequence(chorus1, chorus2, solo, chorus3)
```

# Dependencies

*Synced from Python. Edit the Python and regenerate, or run "Forge: Sync edges" to refresh.*

[[chorus]] [[solo_chorus]] [[drum_chorus]] [[voices_list]] [[sequence_list]]
