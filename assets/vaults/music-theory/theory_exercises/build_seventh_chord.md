---
type: action
inputs:
  - tonic
  - quality
recipe_version: 1
description_hash: 9002d8aaeea54203633b107212cd35da69c8cf3927987c10a147d6ba525e89a9
recipe_hash: 0db4754ecaba644142ca1900d9fbfeed852a66f6c3b579ec8083102460dc3185
python_hash: 5b5d868494c81c1e5a2108f6ea6a9690073d1e9b1df435813ebb08812198beb2
recipe_derived_from_source_hash: 9002d8aaeea54203633b107212cd35da69c8cf3927987c10a147d6ba525e89a9
source_facet: recipe
recipe_derived_from_description_hash: 9002d8aaeea54203633b107212cd35da69c8cf3927987c10a147d6ba525e89a9
---

# Description

Return the pitch names of a chord built on `tonic` by stacking thirds past the triad. `quality` selects the stack: seventh chords — "maj7" (major 7th), "dom7" (dominant/flat 7th), "min7" (minor 7th), "half_dim7" (half-diminished, ø7), "dim7" (fully diminished 7th) — or extended dominant chords that keep stacking thirds — "dom9", "dom11", "dom13". Concept refresher: [[chord/construction/seventh_chord]], [[chord/construction/extension]].

## Inputs

- tonic — the chord's root note, e.g. "C4"
- quality — the stack to build: "maj7", "dom7", "min7", "half_dim7", "dim7", "dom9", "dom11", "dom13"

# Recipe

Return {{ [p.nameWithOctave for p in [music21.pitch.Pitch(tonic).transpose(music21.interval.Interval(iv)) for iv in {"maj7": ["P1","M3","P5","M7"], "dom7": ["P1","M3","P5","m7"], "min7": ["P1","m3","P5","m7"], "half_dim7": ["P1","m3","d5","m7"], "dim7": ["P1","m3","d5","d7"], "dom9": ["P1","M3","P5","m7","M9"], "dom11": ["P1","M3","P5","m7","M9","P11"], "dom13": ["P1","M3","P5","m7","M9","P11","M13"]}[quality]]] }}.

# Python

```python
def compute(context):
    raise NotImplementedError(
        "build_seventh_chord: this note's Recipe describes a real "
        "music21 chord-building computation that hasn't been "
        "implemented yet (tracked separately — needs either a "
        "confirmed E-- Recipe-grammar path for raw music21 calls, or "
        "a shared chord-building library snippet). Returning None "
        "silently was worse than failing loudly, so this is a "
        "deliberate stopgap, not a bug."
    )
```
