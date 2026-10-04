---
type: action
inputs:
  - student_pitches
input_widgets:
  student_pitches: piano
description_hash: d0dc34b596a2d026d4b65deb2dadbd7f41cf59c9b5edb50e2c70ec28eaa112dc
recipe_hash: cfa03deeb152d34a9917e881988f4b6a0144fe0387fd18831209c2093aa3462d
python_hash: e5d1a4fc162f7e942b790e395406201fb6b83935dfe1843a475fc8837c15f097
recipe_derived_from_source_hash: d0dc34b596a2d026d4b65deb2dadbd7f41cf59c9b5edb50e2c70ec28eaa112dc
source_facet: description
recipe_derived_from_description_hash: d0dc34b596a2d026d4b65deb2dadbd7f41cf59c9b5edb50e2c70ec28eaa112dc
---

# Description

Click the seven notes of the A natural minor scale on the piano, from
the tonic (A3) up to the seventh (G4). Then click Forge to grade your
attempt.

A minor shares every key with C major — all white keys — but starts on
A. Same keys, different tonic, completely different mood.

## Inputs

- student_pitches — the notes you play, picked on an interactive piano-keyboard widget; graded against the A natural minor scale

# Recipe

Return Call [[scale_construction_exercise]] with tonic="A3", mode="minor", student_pitches=student_pitches, widget_type="piano".

# Python

```python
def compute(context):
    return None
```
