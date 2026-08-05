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
description_hash: 2539a72997ea38b3a2958f5b5d6389940b35867dfbecef0e19d76e59568cb8e2
recipe_hash: 51bc1352acf72630e52e00bb0b027705cc2b04e5e11b4891d68809941cfc7342
python_hash: 4f2571a24b0e53a1a4fde499bec6e80e75023ed377259eddc9690eb154661ccb
recipe_derived_from_source_hash: 2539a72997ea38b3a2958f5b5d6389940b35867dfbecef0e19d76e59568cb8e2
python_derived_from_source_hash: 2539a72997ea38b3a2958f5b5d6389940b35867dfbecef0e19d76e59568cb8e2
source_facet: python
recipe_derived_from_description_hash: 2539a72997ea38b3a2958f5b5d6389940b35867dfbecef0e19d76e59568cb8e2
python_derived_from_recipe_hash: 51bc1352acf72630e52e00bb0b027705cc2b04e5e11b4891d68809941cfc7342
english_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
sync_state: stale-python
---

# Description

Which scale quality is built from the intervals **W‑W‑H‑W‑W‑W‑H** (whole, whole, half, whole, whole, whole, half)?

Pick from the dropdown and press **Run**. Concept refresher: [[music_theory/scales/scale]].

# Recipe

Let choices = ["major", "minor", "diminished", "augmented"].
Let guess_index = {{ choices.index(guess) }}.
Return Call [[mcq]] with question="Which quality has intervals W-W-H-W-W-W-H?", choices=choices, correct_index=0, guess=guess_index, explanation="The W-W-H-W-W-W-H pattern is the definition of the major scale — see [[music_theory/scales/scale]].".

# Python

```python
def compute(context):
  choices = ['major', 'minor', 'diminished', 'augmented']
  guess_index = choices.index(guess)
  return mcq(question='Which quality has intervals W-W-H-W-W-W-H?', choices=choices, correct_index=0, guess=guess_index, explanation='The W-W-H-W-W-W-H pattern is the definition of the major scale — see [[music_theory/scales/scale]].')

```
