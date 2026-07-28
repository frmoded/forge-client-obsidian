---
type: action
inputs: [guess]
  - guess
recipe_version: 2
sync_state: stale-recipe
description_hash: 051c8c49e8ae9bd87d4f63e1f4d8061e410b24beb3f0d028ca5a2f013515e6b2
recipe_hash: 88337791d7eac7903bf3e1d61320d381dcb4f0d56208164d0e77f0da5582062a
python_hash: 492a186bc01474238d8ff6097ee0a00aca357efe7002b653802aeb46bc2a9daf
recipe_derived_from_source_hash: 051c8c49e8ae9bd87d4f63e1f4d8061e410b24beb3f0d028ca5a2f013515e6b2
python_derived_from_source_hash: 051c8c49e8ae9bd87d4f63e1f4d8061e410b24beb3f0d028ca5a2f013515e6b2
source_facet: description
recipe_derived_from_description_hash: 051c8c49e8ae9bd87d4f63e1f4d8061e410b24beb3f0d028ca5a2f013515e6b2
english_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
python_derived_from_recipe_hash: 88337791d7eac7903bf3e1d61320d381dcb4f0d56208164d0e77f0da5582062a
---

# Description

Below you'll see + hear a mystery scale. What mode is it? Set the `guess` input to one of: "major", "minor", "pentatonic". Then click the Run button.

# Recipe
Let true_tonic = "C".
Let true_mode = "major".
Let scale = Call [[diatonic_scale]] with tonic=true_tonic, mode=true_mode.
Return {{ ("Correct! It was " + true_mode + " starting at " + true_tonic + ": " + str(scale)) if guess == true_mode else ("Not quite — actual mode was " + true_mode + ". Scale: " + str(scale)) }}.

# Python

```python
def compute(context):
  scale_pitches = diatonic_scale(tonic='C', mode='major', octave_range=[4, 5])
  minor_pitches = diatonic_scale(tonic='C', mode='minor', octave_range=[4, 5])
  penta_pitches = minor_pentatonic(key_or_tonic='C', octave_range=[4, 5], include_blue=False)
  return scale_pitches
  return minor_pitches
  return penta_pitches
  return scale_pitches

```
