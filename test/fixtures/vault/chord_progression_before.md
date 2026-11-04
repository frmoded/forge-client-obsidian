---
type: action
inputs:
  - key_name
  - mode_name
  - progression
recipe_version: 1
description_hash: 7eb58c1f8a0ab9ecc10cc6f3cf053b238260a2f009435d56636bd6145785b0ed
recipe_hash: 8d055994d0a30918dfd401764bd293e55456c2638d63622d2f57ad0c0ce3bcd9
python_hash: fb6972d689024ff8cd1c1afa432a88d8829c5996a583d824ba7ff66028de84d3
recipe_derived_from_source_hash: 7eb58c1f8a0ab9ecc10cc6f3cf053b238260a2f009435d56636bd6145785b0ed
source_facet: recipe
recipe_derived_from_description_hash: 7eb58c1f8a0ab9ecc10cc6f3cf053b238260a2f009435d56636bd6145785b0ed
python_derived_from_source_hash: 8d055994d0a30918dfd401764bd293e55456c2638d63622d2f57ad0c0ce3bcd9
python_derived_from_recipe_hash: 8d055994d0a30918dfd401764bd293e55456c2638d63622d2f57ad0c0ce3bcd9
---

# Description

Return a music21 Score realizing your Roman-numeral `progression` (e.g. ["I", "IV", "I", "V", "I"]) as concrete triads in `key_name`/`mode_name` — press Run to hear it. Build different progressions to compare how they punctuate: ending V→I resolves fully (authentic cadence), IV→I is softer (plagal, the "amen"), stopping on V leaves it hanging (half cadence), V→vi surprises instead of resolving (deceptive cadence). All seven diatonic scale-degree triads (I ii iii IV V vi vii°) are available to build with. Concept refresher: [[chord/function/diatonic_chord]], [[chord/function/harmonic_function]], [[chord/function/chord_progression]], [[chord/function/cadence]].

## Inputs

- key_name — the key's tonic, e.g. "C"
- mode_name — the mode, e.g. "major"
- progression — the Roman-numeral chord sequence to realize, e.g. ["I", "IV", "I", "V", "I"]

# Recipe

Return Call [[form]] with key_name=key_name, mode_name=mode_name, progression=progression, ts_str="4/4", tempo_bpm=90.

# Python

```python
def compute(context, key_name, mode_name, progression):
  return form(key_name=key_name, mode_name=mode_name, progression=progression, ts_str='4/4', tempo_bpm=90)
```
