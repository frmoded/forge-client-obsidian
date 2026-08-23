---
type: action
inputs:
  - notes
input_widgets:
  notes: piano
description_hash: 420dd910b2cbc2d0b825dbd9737cdb54efe984e4e2cf35eacaaf64095b290829
recipe_hash: b95f0b399e161cb41606115a7fbfb6230c89a7896a5bb0d7541aebc427d036a1
python_hash: ac707eb36202433bb524ff2dd7558e66b826c1a2d571b761f609a9eef4ccc2f4
recipe_derived_from_source_hash: 420dd910b2cbc2d0b825dbd9737cdb54efe984e4e2cf35eacaaf64095b290829
source_facet: description
recipe_derived_from_description_hash: 420dd910b2cbc2d0b825dbd9737cdb54efe984e4e2cf35eacaaf64095b290829
python_derived_from_source_hash: 420dd910b2cbc2d0b825dbd9737cdb54efe984e4e2cf35eacaaf64095b290829
python_derived_from_recipe_hash: b95f0b399e161cb41606115a7fbfb6230c89a7896a5bb0d7541aebc427d036a1
---

# Description

Click keys on the piano. Forge will play them back.

## Inputs

- notes — the pitches to play, picked on an interactive piano-keyboard widget

# Recipe
Return Call [[play_pitches]] with pitches=notes.

# Python

```python
def compute(context):
  return play_pitches(pitches=notes)

```
