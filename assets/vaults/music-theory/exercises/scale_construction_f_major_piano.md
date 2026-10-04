---
type: action
inputs:
  - student_pitches
input_widgets:
  student_pitches: piano
description_hash: 3d3bad246ef10203123360aadfe4cfd2d25f67e5342d78c7b66830ab3bc18222
recipe_hash: 3c8a45811880bcc1b212d82d6e9c1541d84f0049a702b4f77c95d99140e74ef4
python_hash: e5d1a4fc162f7e942b790e395406201fb6b83935dfe1843a475fc8837c15f097
recipe_derived_from_source_hash: 3d3bad246ef10203123360aadfe4cfd2d25f67e5342d78c7b66830ab3bc18222
source_facet: description
recipe_derived_from_description_hash: 3d3bad246ef10203123360aadfe4cfd2d25f67e5342d78c7b66830ab3bc18222
---

# Description

Click the seven notes of the F major scale on the piano, from the tonic
(F3) up to the seventh (E4). Then click Forge to grade your attempt.

F major's one black key is a FLAT — the fourth degree, Bb. On the
keyboard it's the same key you may know as A#; in F major it's written
Bb, and the grader accepts the key either way.

## Inputs

- student_pitches — the notes you play, picked on an interactive piano-keyboard widget; graded against the F major scale

# Recipe

Return Call [[scale_construction_exercise]] with tonic="F3", mode="major", student_pitches=student_pitches, widget_type="piano".

# Python

```python
def compute(context):
    return None
```
