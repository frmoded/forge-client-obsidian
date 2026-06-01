---
type: action
description: action
inputs: []
---

# English


One 12-bar vocal chorus of the blues — the basic repeating unit of the song. Composes the AAB vocal lyric over the harmonic frame: [[vocal_phrase_a]] twice (bars 1-4 and 5-8, the AA) and [[vocal_phrase_b]] once (bars 9-12, the B), played simultaneously with the harmonic accompaniment from [[form]].

Twelve bars in 12/8, slow blues feel. Inherits key, time signature (12/8), and tempo (around 70 BPM, eighth-note triplet feel) from [[form]] so the chorus stays coherent with the rest of the song under any of those changing.

No new musical material introduced at this level — pure structural composition of the three leaves: the harmonic frame from [[form]] underneath, the AAB vocal arc on top via two calls to [[vocal_phrase_a]] and one to [[vocal_phrase_b]].

---

# Python

```python
def compute(context):
    form_score = context.compute("form")
    phrase_a = context.compute("vocal_phrase_a")
    phrase_b = context.compute("vocal_phrase_b")

    vocal_line = sequence(repeat(phrase_a, 2), phrase_b)
    return voices(form_score, vocal_line)
```

# Dependencies

*Synced from Python. Edit the Python and regenerate, or run "Forge: Sync edges" to refresh.*

[[form]] [[vocal_phrase_a]] [[vocal_phrase_b]]
