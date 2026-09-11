---
type: action
inputs:
  - guess
source_facet: recipe
description_hash: d6f3c2afbbcc4d738020b9996afc88049a56043ec437ac90250dfe999f597c3f
recipe_hash: 90484e63d3203ed14f548eb19867a34271d7dd021e8bc3c58911391f4fcb49b9
python_hash: ae699669903d57ab2c427937bca7006a9e37f58b7e973050deaa86c0bd283812
recipe_derived_from_description_hash: d6f3c2afbbcc4d738020b9996afc88049a56043ec437ac90250dfe999f597c3f
recipe_derived_from_source_hash: d6f3c2afbbcc4d738020b9996afc88049a56043ec437ac90250dfe999f597c3f
python_derived_from_recipe_hash: 90484e63d3203ed14f548eb19867a34271d7dd021e8bc3c58911391f4fcb49b9
python_derived_from_source_hash: d6f3c2afbbcc4d738020b9996afc88049a56043ec437ac90250dfe999f597c3f
english_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
recipe_version: 2
---

# Description

Construct the C major scale, tonic to tonic, one key at a time — as if pressing 8 piano keys in a row. `guess` is a list of 8 pitch names, e.g. `["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"]`. Press **Run** to hear exactly what you built, with a verdict — which positions are right, which aren't, or whether you entered the wrong number of notes — printed right on the staff above your own notes. Concept refresher: [[scales/scale]]; hear the reference scale first at [[theory_exercises/complete_this_scale_challenge]].

## Inputs

- guess — the 8 pitch names you built, tonic to tonic, e.g. ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"]

# Recipe

Let correct = Call [[diatonic_scale]] with tonic="C", mode="major".
Let verdict = Call [[grade_scale_attempt]] with guess=guess, correct=correct.
Return Call [[render_graded_scale]] with guess=guess, verdict=verdict.

# Python

```python
def compute(context):
  correct = diatonic_scale(tonic='C', mode='major')
  verdict = grade_scale_attempt(guess=guess, correct=correct)
  return render_graded_scale(guess=guess, verdict=verdict)
```
