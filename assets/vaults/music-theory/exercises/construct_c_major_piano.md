---
type: action
inputs: [guess]
source_facet: description
description_hash: ebb5700333558be9f6d2cd20862be1c5ec1312b311790f7314d3f6a41f9eabfe
recipe_hash: 90484e63d3203ed14f548eb19867a34271d7dd021e8bc3c58911391f4fcb49b9
python_hash: c75ae26fe8c375f982a296981134042b36e8fe762c419b6a310af89c067c9a9d
recipe_derived_from_description_hash: ebb5700333558be9f6d2cd20862be1c5ec1312b311790f7314d3f6a41f9eabfe
recipe_derived_from_source_hash: ebb5700333558be9f6d2cd20862be1c5ec1312b311790f7314d3f6a41f9eabfe
python_derived_from_recipe_hash: 90484e63d3203ed14f548eb19867a34271d7dd021e8bc3c58911391f4fcb49b9
python_derived_from_source_hash: ebb5700333558be9f6d2cd20862be1c5ec1312b311790f7314d3f6a41f9eabfe
recipe_version: 1
---

# Description

Construct the C major scale, tonic to tonic, one key at a time — as if pressing 8 piano keys in a row. `guess` is a list of 8 pitch names, e.g. `["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"]`. Press **Run** to hear exactly what you built, with a verdict — which positions are right, which aren't, or whether you entered the wrong number of notes — printed right on the staff above your own notes. Concept refresher: [[scales/Scales]]; hear the reference scale first at [[exercises/complete_this_scale_challenge]].

## Inputs

- guess — the 8 pitch names you built, tonic to tonic, e.g. ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"]

# Recipe

Let correct = Call [[diatonic_scale]] with tonic="C", mode="major".
Let verdict = Call [[grade_scale_attempt]] with guess=guess, correct=correct.
Return Call [[render_graded_scale]] with guess=guess, verdict=verdict.

# Python

```python
def compute(context, guess):
  correct = diatonic_scale(tonic='C', mode='major')
  verdict = grade_scale_attempt(guess=guess, correct=correct)
  return render_graded_scale(guess=guess, verdict=verdict)
```
