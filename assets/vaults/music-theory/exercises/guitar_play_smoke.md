---
type: action
inputs: [notes]
input_widgets:
  notes: guitar_fretboard
description_hash: 26384201293efd47c539e93201a4d2152ae91fd3f2278d943d530e2dd850ed52
recipe_hash: 8f9b6f1105f89b720b497fabd8820f41d3ad88612ca5d1f4c3112002dc47d572
python_hash: ac707eb36202433bb524ff2dd7558e66b826c1a2d571b761f609a9eef4ccc2f4
recipe_derived_from_source_hash: 26384201293efd47c539e93201a4d2152ae91fd3f2278d943d530e2dd850ed52
source_facet: description
recipe_derived_from_description_hash: 26384201293efd47c539e93201a4d2152ae91fd3f2278d943d530e2dd850ed52
python_derived_from_source_hash: 26384201293efd47c539e93201a4d2152ae91fd3f2278d943d530e2dd850ed52
python_derived_from_recipe_hash: b95f0b399e161cb41606115a7fbfb6230c89a7896a5bb0d7541aebc427d036a1
recipe_version: 1
---

# Description

Pick notes on the fretboard. Forge will play them back.

## Inputs

- notes — the pitches to play, picked on an interactive fretboard widget

# Recipe
Input notes: list = ["E4", "G4", "B4"].
Return Call [[play_pitches]] with pitches=notes.

# Python

```python
def compute(context):
  return play_pitches(pitches=notes)

```
