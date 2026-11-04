---
type: action
inputs:
  - tonic
  - quality
recipe_version: 2
description_hash: 1a945751df1180bcc54047b91eb7d9df9029a56e9988673d36928c5fa6e756b2
recipe_hash: 56f46d8c825b2a5a6aee8d8b7d107ff0433fee101ebe7c42404f184009aacde8
python_hash: 577807c70c37292f83c67b282e35bc8a7e585dd6541fd652a614330bb66ce2ea
recipe_derived_from_source_hash: 1a945751df1180bcc54047b91eb7d9df9029a56e9988673d36928c5fa6e756b2
source_facet: description
recipe_derived_from_description_hash: 1a945751df1180bcc54047b91eb7d9df9029a56e9988673d36928c5fa6e756b2
python_derived_from_recipe_hash: 56f46d8c825b2a5a6aee8d8b7d107ff0433fee101ebe7c42404f184009aacde8
python_derived_from_source_hash: 1a945751df1180bcc54047b91eb7d9df9029a56e9988673d36928c5fa6e756b2
---

# Description

Return the pitch names of a chord built on `tonic` by stacking thirds past the triad. `quality` selects the stack: seventh chords — "maj7" (major 7th), "dom7" (dominant/flat 7th), "min7" (minor 7th), "half_dim7" (half-diminished, ø7), "dim7" (fully diminished 7th) — or extended dominant chords that keep stacking thirds — "dom9", "dom11", "dom13". `quality` defaults to "maj7"; `tonic` is required and has no default. The chord comes from a single call to `build_chord` with `tonic` and `quality` passed straight through, with no branching on `quality`. Concept refresher: [[chord/construction/seventh_chord]], [[chord/construction/extension]].

## Inputs

- tonic — the chord's root note, e.g. "C4"
- quality — the stack to build: "maj7", "dom7", "min7", "half_dim7", "dim7", "dom9", "dom11", "dom13"

# Recipe

Input tonic: str.
Input quality: "maj7" | "dom7" | "min7" | "half_dim7" | "dim7" | "dom9" | "dom11" | "dom13" = "maj7".
Let result = Call [[build_chord]] with tonic=tonic, quality=quality.
Return result.

# Python

```python
from typing import Literal

def compute(context, tonic: str, quality: Literal['maj7', 'dom7', 'min7', 'half_dim7', 'dim7', 'dom9', 'dom11', 'dom13'] = 'maj7'):
  result = build_chord(tonic=tonic, quality=quality)
  return result
```
