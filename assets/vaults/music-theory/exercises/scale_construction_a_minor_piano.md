---
type: action
inputs:
  - student_pitches
input_widgets:
  student_pitches: piano
description_hash: 4fe9d9bcc97ec6a1735abc99cd881a63f596183fff407a7a4f56910a2ec60873
recipe_hash: cfa03deeb152d34a9917e881988f4b6a0144fe0387fd18831209c2093aa3462d
python_hash: 40cab68c23169a8ce52d55271a3d90c4ff895e6a5514921aa943fa3687a2fcda
recipe_derived_from_source_hash: 4fe9d9bcc97ec6a1735abc99cd881a63f596183fff407a7a4f56910a2ec60873
source_facet: description
recipe_derived_from_description_hash: 4fe9d9bcc97ec6a1735abc99cd881a63f596183fff407a7a4f56910a2ec60873
python_derived_from_source_hash: 4fe9d9bcc97ec6a1735abc99cd881a63f596183fff407a7a4f56910a2ec60873
python_derived_from_recipe_hash: cfa03deeb152d34a9917e881988f4b6a0144fe0387fd18831209c2093aa3462d
---

# Description

Click the seven notes of the A natural minor scale on the piano, from
the tonic (A3) up to the seventh (G4). Then press **Run** to grade your
attempt.

A minor shares every key with C major — all white keys — but starts on
A. Same keys, different tonic, completely different mood.

## Inputs

- student_pitches — the notes you play, picked on an interactive piano-keyboard widget; graded against the A natural minor scale

# Recipe

Return Call [[scale_construction_exercise]] with tonic="A3", mode="minor", student_pitches=student_pitches, widget_type="piano".

# Python

```python
def compute(context, student_pitches):
  return scale_construction_exercise(tonic='A3', mode='minor', student_pitches=student_pitches, widget_type='piano')
```
