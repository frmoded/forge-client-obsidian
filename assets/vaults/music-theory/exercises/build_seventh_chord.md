---
type: action
inputs:
  - tonic
  - quality
recipe_version: 2
description_hash: 9002d8aaeea54203633b107212cd35da69c8cf3927987c10a147d6ba525e89a9
recipe_hash: 79195ed2e624a9e865bc9b14f900c473b821f6310e8e4882ff97c469590d8be4
python_hash: 28b2fce3f08f346746391a1bc5ed85aa8f10119090e6e0130aab1fc8bd0e5f25
recipe_derived_from_source_hash: 9002d8aaeea54203633b107212cd35da69c8cf3927987c10a147d6ba525e89a9
source_facet: recipe
recipe_derived_from_description_hash: 9002d8aaeea54203633b107212cd35da69c8cf3927987c10a147d6ba525e89a9
python_derived_from_recipe_hash: 79195ed2e624a9e865bc9b14f900c473b821f6310e8e4882ff97c469590d8be4
---

# Description

Return the pitch names of a chord built on `tonic` by stacking thirds past the triad. `quality` selects the stack: seventh chords — "maj7" (major 7th), "dom7" (dominant/flat 7th), "min7" (minor 7th), "half_dim7" (half-diminished, ø7), "dim7" (fully diminished 7th) — or extended dominant chords that keep stacking thirds — "dom9", "dom11", "dom13". Concept refresher: [[chord/construction/seventh_chord]], [[chord/construction/extension]].

## Inputs

- tonic — the chord's root note, e.g. "C4"
- quality — the stack to build: "maj7", "dom7", "min7", "half_dim7", "dim7", "dom9", "dom11", "dom13"

# Recipe

Return Call [[build_chord]] with tonic=tonic, quality=quality.

# Python

```python
def compute(context):
  return build_chord(tonic=tonic, quality=quality)
```
