---
type: action
inputs:
  - tonic
  - quality
recipe_version: 2
description_hash: 4c235cd4b75e7b1019bf0f6fc3afa6e5526eb219ff9cbdfc7908c3df002e1787
recipe_hash: 0a40fd9255e117b359a711182fcee9df76fe8b70f8063f8baf512603ebf03061
python_hash: 8894cd2e1988cad9185532ff351edb3d1090ec8fea0301eeb66d7f987fe60151
recipe_derived_from_source_hash: 4c235cd4b75e7b1019bf0f6fc3afa6e5526eb219ff9cbdfc7908c3df002e1787
source_facet: recipe
recipe_derived_from_description_hash: 4c235cd4b75e7b1019bf0f6fc3afa6e5526eb219ff9cbdfc7908c3df002e1787
python_derived_from_recipe_hash: 0a40fd9255e117b359a711182fcee9df76fe8b70f8063f8baf512603ebf03061
python_derived_from_source_hash: 0a40fd9255e117b359a711182fcee9df76fe8b70f8063f8baf512603ebf03061
---

# Description

Return the three pitch names of a triad built on `tonic` with the given `quality` — root, third, and fifth, each an interval above the tonic. `quality` is one of "major" (major 3rd + perfect 5th), "minor" (minor 3rd + perfect 5th), "diminished" (minor 3rd + diminished 5th), or "augmented" (major 3rd + augmented 5th). Concept refresher: [[chord/construction/triad]], [[chord/construction/chord_quality]], [[chord/construction/root]].

## Inputs

- tonic — the triad's root note, e.g. "C4"
- quality — the triad type: "major", "minor", "diminished", "augmented"

# Recipe

Input tonic: str.
Input quality: 'major' | 'minor' | 'diminished' | 'augmented' = "major".
Return Call [[build_triad_chord]] with tonic=tonic, quality=quality.

# Python

```python
from typing import Literal

def compute(context, tonic: str, quality: Literal['major', 'minor', 'diminished', 'augmented'] = 'major'):
  return build_triad_chord(tonic=tonic, quality=quality)
```
