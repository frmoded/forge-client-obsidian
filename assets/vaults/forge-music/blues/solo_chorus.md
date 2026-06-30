---
type: action
---

# Description

The instrumental chorus — 12 bars, no vocal. The electric guitar
takes the lead in minor pentatonic with blue notes; the harmonic
frame from [[form]] continues underneath. The moment the song
stops singing about the feeling and just shows it, sitting between
the second and third vocal choruses. 12/8, eighth-note triplet
feel, around 70 BPM. Denser than the vocal choruses — the
emotional arc going up rather than across.

## Inputs

(none)

# Recipe

Let harmonic_frame = Call [[form]].
Let solo_line = Call [[guitar_solo_chorus]].
Return Call [[voices_list]] with sections=[harmonic_frame, solo_line].

# Python

```python
def compute(context):
    # v0.7.0: form / guitar_solo_chorus are now library notes in
    # forge.music.lib; called directly instead of via context.compute.
    harmonic_frame = form()
    solo_line = guitar_solo_chorus()
    return voices(harmonic_frame, solo_line)
```

# Dependencies

*Synced from Python. Edit the Python and regenerate, or run "Forge: Sync edges" to refresh.*

[[form]] [[guitar_solo_chorus]] [[voices_list]]
