---
type: action
inputs:
  - pattern_choice
input_enums:
  pattern_choice:
    - swing
    - waltz
    - even_eighths
    - syncopated
description_hash: c6915a4ae6e51e67dc4d97237b10e6996e54f4b846dd8b61484e7fd2223d5814
recipe_hash: b21a7469f8b390aea509329de30e93bf68996149a33459c6c4acd3d46a52959d
python_hash: df39fe4e5acba91843f869d16b51d9dd8979c233172f093e45003873c0313dde
recipe_derived_from_source_hash: c6915a4ae6e51e67dc4d97237b10e6996e54f4b846dd8b61484e7fd2223d5814
source_facet: description
recipe_derived_from_description_hash: c6915a4ae6e51e67dc4d97237b10e6996e54f4b846dd8b61484e7fd2223d5814
python_derived_from_recipe_hash: b21a7469f8b390aea509329de30e93bf68996149a33459c6c4acd3d46a52959d
python_derived_from_source_hash: c6915a4ae6e51e67dc4d97237b10e6996e54f4b846dd8b61484e7fd2223d5814
---

# Description

A demo of [[rhythmic_line]]: pick a canned pattern from the dropdown and
hear the rhythm played on middle C.

Rhythm first, notes later — every pattern here is one pitch, so the only
thing you are listening to is the placement in time. Try `waltz` against
`even_eighths` to hear how much of a groove is duration alone.

## Inputs

- pattern_choice — the rhythmic pattern to play, picked from a dropdown ("swing", "waltz", "even_eighths", "syncopated")

# Recipe

Let pattern = {{ {"swing": ["q", "e", "e", "q", "e", "e"], "waltz": ["q", "q", "q"], "even_eighths": ["e", "e", "e", "e", "e", "e", "e", "e"], "syncopated": ["e", "q", "e", "q", "e", "q", "e"]}[pattern_choice] }}.
Return Call [[rhythmic_line]] with pattern=pattern.

# Python

```python
def compute(context):
  pattern = {"swing": ["q", "e", "e", "q", "e", "e"], "waltz": ["q", "q", "q"], "even_eighths": ["e", "e", "e", "e", "e", "e", "e", "e"], "syncopated": ["e", "q", "e", "q", "e", "q", "e"]}[pattern_choice]
  return rhythmic_line(pattern=pattern)

```
