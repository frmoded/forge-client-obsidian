---
type: action
inputs:
  - guess
input_enums:
  guess:
    - major
    - minor
    - diminished
    - augmented
description_hash: 316a6e92b963a162288e2efa764d5bb33a84443632fb133648bea428bdd4f03b
recipe_hash: ade2aa73b3226c0ca3d9d565a454d7c1367992ea142ea8857c7ee734a990358f
python_hash: 639b7b2f13dd62302a18ca623b45b3431e9f8012a13e6622ebdb62aebdb5e89d
recipe_derived_from_source_hash: 316a6e92b963a162288e2efa764d5bb33a84443632fb133648bea428bdd4f03b
source_facet: recipe
recipe_derived_from_description_hash: 316a6e92b963a162288e2efa764d5bb33a84443632fb133648bea428bdd4f03b
recipe_version: 2
python_derived_from_recipe_hash: ade2aa73b3226c0ca3d9d565a454d7c1367992ea142ea8857c7ee734a990358f
python_derived_from_source_hash: 316a6e92b963a162288e2efa764d5bb33a84443632fb133648bea428bdd4f03b
---

# Description

Which scale quality is built from the intervals **W‑W‑H‑W‑W‑W‑H** (whole, whole, half, whole, whole, whole, half)?

Pick from the dropdown and press **Run**. Concept refresher: [[scales/scale]].

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
Return Call [[mcq]] with question="Which quality has intervals W-W-H-W-W-W-H?", choices=choices, correct_index=0, guess=guess_index, explanation="The W-W-H-W-W-W-H pattern is the definition of the major scale — see [[scales/scale]].".

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
  return mcq(question='Which quality has intervals W-W-H-W-W-W-H?', choices=choices, correct_index=0, guess=guess_index, explanation='The W-W-H-W-W-W-H pattern is the definition of the major scale — see [[scales/scale]].')

```
