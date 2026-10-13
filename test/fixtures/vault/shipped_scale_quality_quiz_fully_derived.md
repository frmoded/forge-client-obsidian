---
type: action
inputs:
  - guess
source_facet: description
description_hash: 7edc10dfb862d470419b7a7a41ca9a21ddad7c9e06fbba784033089fb8508973
recipe_hash: a92b12967d4e68c48b4034e5c67704680cf8e71b8c5eac05d467586dede65ae2
python_hash: 55550ebd094c3323527fb44f3b9f65836369f4c01908830a6b4c232c2e52fe65
recipe_derived_from_description_hash: 7edc10dfb862d470419b7a7a41ca9a21ddad7c9e06fbba784033089fb8508973
recipe_derived_from_source_hash: 7edc10dfb862d470419b7a7a41ca9a21ddad7c9e06fbba784033089fb8508973
python_derived_from_recipe_hash: a92b12967d4e68c48b4034e5c67704680cf8e71b8c5eac05d467586dede65ae2
python_derived_from_source_hash: 7edc10dfb862d470419b7a7a41ca9a21ddad7c9e06fbba784033089fb8508973
recipe_version: 1
---

# Description

Which scale quality is built from the intervals **W‑W‑H‑W‑W‑W‑H** (whole, whole, half, whole, whole, whole, half)?

Pick from the dropdown and press **Run**. Concept refresher: [[scales/Scales]].

# Recipe

Input guess: 'major' | 'minor' | 'diminished' | 'augmented' = "major".
Let choices = ["major", "minor", "diminished", "augmented"].
If guess == "major":
    Let guess_index = 0.
Otherwise:
    If guess == "minor":
        Let guess_index = 1.
    Otherwise:
        If guess == "diminished":
            Let guess_index = 2.
        Otherwise:
            Let guess_index = 3.
Return Call [[mcq]] with question="Which quality has intervals W-W-H-W-W-W-H?", choices=choices, correct_index=0, guess=guess_index, explanation="The W-W-H-W-W-W-H pattern is the definition of the major scale — see [[scales/Scales]].".

# Python

```python
from typing import Literal

def compute(context, guess: Literal['major', 'minor', 'diminished', 'augmented'] = 'major'):
  choices = ['major', 'minor', 'diminished', 'augmented']
  if (guess == 'major'):
    guess_index = 0
  else:
    if (guess == 'minor'):
      guess_index = 1
    else:
      if (guess == 'diminished'):
        guess_index = 2
      else:
        guess_index = 3
  return mcq(question='Which quality has intervals W-W-H-W-W-W-H?', choices=choices, correct_index=0, guess=guess_index, explanation='The W-W-H-W-W-W-H pattern is the definition of the major scale — see [[scales/Scales]].')

```
