---
type: action
inputs:
  - tonic
  - quality
recipe_version: 1
sync_state: stale-recipe
description_hash: 9002d8aaeea54203633b107212cd35da69c8cf3927987c10a147d6ba525e89a9
recipe_hash: 0db4754ecaba644142ca1900d9fbfeed852a66f6c3b579ec8083102460dc3185
python_hash: e5d1a4fc162f7e942b790e395406201fb6b83935dfe1843a475fc8837c15f097
recipe_derived_from_source_hash: 9002d8aaeea54203633b107212cd35da69c8cf3927987c10a147d6ba525e89a9
source_facet: recipe
recipe_derived_from_description_hash: 9002d8aaeea54203633b107212cd35da69c8cf3927987c10a147d6ba525e89a9
---

# Description

Return the pitch names of a chord built on `tonic` by stacking thirds past the triad. `quality` selects the stack: seventh chords — "maj7" (major 7th), "dom7" (dominant/flat 7th), "min7" (minor 7th), "half_dim7" (half-diminished, ø7), "dim7" (fully diminished 7th) — or extended dominant chords that keep stacking thirds — "dom9", "dom11", "dom13". Concept refresher: [[chord/construction/seventh_chord]], [[chord/construction/extension]].

# Recipe

Return {{ [p.nameWithOctave for p in [music21.pitch.Pitch(tonic).transpose(music21.interval.Interval(iv)) for iv in {"maj7": ["P1","M3","P5","M7"], "dom7": ["P1","M3","P5","m7"], "min7": ["P1","m3","P5","m7"], "half_dim7": ["P1","m3","d5","m7"], "dim7": ["P1","m3","d5","d7"], "dom9": ["P1","M3","P5","m7","M9"], "dom11": ["P1","M3","P5","m7","M9","P11"], "dom13": ["P1","M3","P5","m7","M9","P11","M13"]}[quality]]] }}.

# Python

```python
def compute(context):
    return None
```
