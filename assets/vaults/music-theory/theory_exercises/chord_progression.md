---
type: action
inputs:
  - key_name
  - mode_name
  - progression
recipe_version: 1
description_hash: 31992d622fb123bcc2a931eb39e1e36ac5e4ca05f0d14877889c2fe617a69722
recipe_hash: 8d055994d0a30918dfd401764bd293e55456c2638d63622d2f57ad0c0ce3bcd9
python_hash: c6b25d5b4e62f9f57ec2d5b8e4bf38d35af9af45d590fab8ebb5fcf20083bcf9
recipe_derived_from_source_hash: 31992d622fb123bcc2a931eb39e1e36ac5e4ca05f0d14877889c2fe617a69722
source_facet: recipe
recipe_derived_from_description_hash: 31992d622fb123bcc2a931eb39e1e36ac5e4ca05f0d14877889c2fe617a69722
python_derived_from_source_hash: 31992d622fb123bcc2a931eb39e1e36ac5e4ca05f0d14877889c2fe617a69722
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
def compute(context):
  return form(key_name=key_name, mode_name=mode_name, progression=progression, ts_str='4/4', tempo_bpm=90)

```
