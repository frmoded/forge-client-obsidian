---
type: action
inputs:
  - contour_choice
input_enums:
  contour_choice:
    - ascending
    - descending
    - arch
    - valley
description_hash: 561affa21cfa86ba261a09a1786737c690e09f788102529aa4c01d6b627f5442
recipe_hash: edbd0f3f9f67bdbc4bb5324ef1a3bf378a75388ca9eb1548e0f9b80f5d911d36
python_hash: 398bca07d32a843e01ddb9ae1e555b23b266aea5d44ccdd3368e18201b2c18c7
recipe_derived_from_source_hash: 561affa21cfa86ba261a09a1786737c690e09f788102529aa4c01d6b627f5442
source_facet: description
recipe_derived_from_description_hash: 561affa21cfa86ba261a09a1786737c690e09f788102529aa4c01d6b627f5442
python_derived_from_recipe_hash: edbd0f3f9f67bdbc4bb5324ef1a3bf378a75388ca9eb1548e0f9b80f5d911d36
python_derived_from_source_hash: 561affa21cfa86ba261a09a1786737c690e09f788102529aa4c01d6b627f5442
---

# Description

A demo of [[melodic_line]]: pick a contour shape from the dropdown and
hear a four-note phrase over C major at moderate tempo.

Where [[rhythmic_line]] holds the pitch still so you hear only the
rhythm, this holds the rhythm still — every contour is the same
`q q q h` — so the only thing changing is the shape of the line. Try
`arch` against `valley` to hear how much a phrase's character is the
direction it travels.

## Inputs

- contour_choice — the melodic shape to play, picked from a dropdown ("ascending", "descending", "arch", "valley")

# Recipe

Let pitches = {{ {"ascending": ["C4", "E4", "G4", "C5"], "descending": ["C5", "G4", "E4", "C4"], "arch": ["C4", "E4", "G4", "E4"], "valley": ["G4", "E4", "C4", "E4"]}[contour_choice] }}.
Return Call [[melodic_line]] with pattern=["q", "q", "q", "h"], pitches=pitches.

# Python

```python
def compute(context, contour_choice):
    contour = context.get("contour_choice", "arch")
    result = context.compute("melodic_line", contour=contour)
    return result
```
