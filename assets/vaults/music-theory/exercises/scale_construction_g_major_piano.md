---
type: action
inputs:
  - student_pitches
input_widgets:
  student_pitches: piano
description_hash: a59a8c7348c441be79b9d89ed7cb6f31f1aa1d1a1806dad1b11e9c0f222af666
recipe_hash: 89bb0583e16bc3d4a5b50f9f3312589f1342b76e53dbb9805cd1d5d0e3e367be
python_hash: ad333c6c63a8f77126ef553d7abaf6e900044a1a9de516053c2aa92f756498b3
recipe_derived_from_source_hash: a59a8c7348c441be79b9d89ed7cb6f31f1aa1d1a1806dad1b11e9c0f222af666
source_facet: description
recipe_derived_from_description_hash: a59a8c7348c441be79b9d89ed7cb6f31f1aa1d1a1806dad1b11e9c0f222af666
python_derived_from_source_hash: a59a8c7348c441be79b9d89ed7cb6f31f1aa1d1a1806dad1b11e9c0f222af666
python_derived_from_recipe_hash: 89bb0583e16bc3d4a5b50f9f3312589f1342b76e53dbb9805cd1d5d0e3e367be
---

# Description

Click the seven notes of the G major scale on the piano, from the tonic
(G3) up to the seventh (F#4). Then press **Run** to grade your attempt.

Same W-W-H-W-W-W-H pattern as C major, transposed to start on G — which
forces exactly one black key. Find it.

## Inputs

- student_pitches — the notes you play, picked on an interactive piano-keyboard widget; graded against the G major scale

# Recipe

Return Call [[scale_construction_exercise]] with tonic="G3", mode="major", student_pitches=student_pitches, widget_type="piano".

# Python

```python
def compute(context, student_pitches):
  return scale_construction_exercise(tonic='G3', mode='major', student_pitches=student_pitches, widget_type='piano')
```
