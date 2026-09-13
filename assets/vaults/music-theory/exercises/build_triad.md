---
type: action
inputs:
  - tonic
  - quality
recipe_version: 2
description_hash: 4c235cd4b75e7b1019bf0f6fc3afa6e5526eb219ff9cbdfc7908c3df002e1787
recipe_hash: 60477bb0782299226042fc241fa09170cc17374d05f5ff86cf4aa2cb07e93baa
python_hash: e930a101b558521050f956d41c2e91ccaac17e6b5dd6078ace8739111c683ff7
recipe_derived_from_source_hash: 4c235cd4b75e7b1019bf0f6fc3afa6e5526eb219ff9cbdfc7908c3df002e1787
source_facet: recipe
recipe_derived_from_description_hash: 4c235cd4b75e7b1019bf0f6fc3afa6e5526eb219ff9cbdfc7908c3df002e1787
python_derived_from_recipe_hash: 60477bb0782299226042fc241fa09170cc17374d05f5ff86cf4aa2cb07e93baa
python_derived_from_source_hash: 4c235cd4b75e7b1019bf0f6fc3afa6e5526eb219ff9cbdfc7908c3df002e1787
---

# Description

Return the three pitch names of a triad built on `tonic` with the given `quality` — root, third, and fifth, each an interval above the tonic. `quality` is one of "major" (major 3rd + perfect 5th), "minor" (minor 3rd + perfect 5th), "diminished" (minor 3rd + diminished 5th), or "augmented" (major 3rd + augmented 5th). Concept refresher: [[chord/construction/triad]], [[chord/construction/chord_quality]], [[chord/construction/root]].

## Inputs

- tonic — the triad's root note, e.g. "C4"
- quality — the triad type: "major", "minor", "diminished", "augmented"

# Recipe

Return Call [[build_triad_chord]] with tonic=tonic, quality=quality.

# Python

```python
def compute(context):
  return build_triad_chord(tonic=tonic, quality=quality)
```
