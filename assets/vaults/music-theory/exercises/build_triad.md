---
type: action
inputs:
  - tonic
  - quality
recipe_version: 2
description_hash: f31aba4ebbf7b86dbe27c7cab82b966d273315b76be4ce8713ac2c737a74e374
recipe_hash: 187dfbdcf37be6218f88ec66c80799b14afc4a88da34743120e1900ddbe97de6
python_hash: f47d924cc11799bc6316759d1936385d67e320b5de821f81446698acdb9262f1
recipe_derived_from_source_hash: f31aba4ebbf7b86dbe27c7cab82b966d273315b76be4ce8713ac2c737a74e374
source_facet: description
recipe_derived_from_description_hash: f31aba4ebbf7b86dbe27c7cab82b966d273315b76be4ce8713ac2c737a74e374
python_derived_from_recipe_hash: 187dfbdcf37be6218f88ec66c80799b14afc4a88da34743120e1900ddbe97de6
python_derived_from_source_hash: f31aba4ebbf7b86dbe27c7cab82b966d273315b76be4ce8713ac2c737a74e374
---

# Description

Return the three pitch names of a triad built on `tonic` with the given `quality` — root, third, and fifth, each an interval above the tonic. `quality` is one of "major" (major 3rd + perfect 5th), "minor" (minor 3rd + perfect 5th), "diminished" (minor 3rd + diminished 5th), or "augmented" (major 3rd + augmented 5th). `quality` defaults to major; `tonic` is required and has no default. Concept refresher: [[chord/construction/triad]], [[chord/construction/chord_quality]], [[chord/construction/root]].

## Inputs

- tonic — the triad's root note, e.g. "C4"
- quality — the triad type: "major", "minor", "diminished", "augmented"

# Recipe

Input tonic: str.
Input quality: 'major' | 'minor' | 'diminished' | 'augmented' = "major".
Let p = Call [[build_triad_chord]] with tonic=tonic, quality=quality.
Return p.

# Python

```python
from typing import Literal

def compute(context, tonic: str, quality: Literal['major', 'minor', 'diminished', 'augmented'] = 'major'):
  p = build_triad_chord(tonic=tonic, quality=quality)
  return p
```
