---
type: action
inputs: [notes]
input_widgets:
  notes: guitar_fretboard
description_hash: a454a72f019aa775f8d149382e27637ba113ada3e00d78dcacfc3ae497042a35
recipe_hash: 8f9b6f1105f89b720b497fabd8820f41d3ad88612ca5d1f4c3112002dc47d572
python_hash: cd44ea7005d6bb25ec270feb7e9ff4954b281e7429bfdb7bb536b5410a65da51
recipe_derived_from_source_hash: a454a72f019aa775f8d149382e27637ba113ada3e00d78dcacfc3ae497042a35
source_facet: description
recipe_derived_from_description_hash: a454a72f019aa775f8d149382e27637ba113ada3e00d78dcacfc3ae497042a35
python_derived_from_source_hash: a454a72f019aa775f8d149382e27637ba113ada3e00d78dcacfc3ae497042a35
python_derived_from_recipe_hash: 8f9b6f1105f89b720b497fabd8820f41d3ad88612ca5d1f4c3112002dc47d572
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
def compute(context, notes: list = ['E4', 'G4', 'B4']):
  return play_pitches(pitches=notes)
```
