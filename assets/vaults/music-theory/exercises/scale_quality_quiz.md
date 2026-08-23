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
recipe_hash: 1ccecbecffeb428f4ac82792e80bcb2a4ba688df6d6084576b41da3f7a9a5061
python_hash: e5d1a4fc162f7e942b790e395406201fb6b83935dfe1843a475fc8837c15f097
recipe_derived_from_source_hash: 316a6e92b963a162288e2efa764d5bb33a84443632fb133648bea428bdd4f03b
source_facet: recipe
recipe_derived_from_description_hash: 316a6e92b963a162288e2efa764d5bb33a84443632fb133648bea428bdd4f03b
recipe_version: 1
---

# Description

Which scale quality is built from the intervals **W‑W‑H‑W‑W‑W‑H** (whole, whole, half, whole, whole, whole, half)?

Pick from the dropdown and press **Run**. Concept refresher: [[scales/scale]].

# Recipe
Input guess: 'major' | 'minor' | 'diminished' | 'augmented' = "major".
Let choices = ["major", "minor", "diminished", "augmented"].
Let guess_index = {{ choices.index(guess) }}.
Return Call [[mcq]] with question="Which quality has intervals W-W-H-W-W-W-H?", choices=choices, correct_index=0, guess=guess_index, explanation="The W-W-H-W-W-W-H pattern is the definition of the major scale — see [[scales/scale]].".

# Python

```python
def compute(context):
    return None
```
