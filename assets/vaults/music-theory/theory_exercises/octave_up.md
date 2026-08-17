---
type: action
inputs:
  - guess
recipe_version: 1
description_hash: dae9d69d61a16ecd4ce6d1132265f9e29737a66a865aea602ead2619acc8a689
recipe_hash: 04c7f7ef6501a4248adbb21fb647f49b27487733fef11fe98407847edcab3632
python_hash: 80344189a7f193ae609e87b7fdadf6d37dc6a35c0ddf29123cafa8a5a488ca91
recipe_derived_from_source_hash: dae9d69d61a16ecd4ce6d1132265f9e29737a66a865aea602ead2619acc8a689
python_derived_from_source_hash: dae9d69d61a16ecd4ce6d1132265f9e29737a66a865aea602ead2619acc8a689
source_facet: python
recipe_derived_from_description_hash: dae9d69d61a16ecd4ce6d1132265f9e29737a66a865aea602ead2619acc8a689
english_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
python_derived_from_recipe_hash: 04c7f7ef6501a4248adbb21fb647f49b27487733fef11fe98407847edcab3632
---

# Description

Enter the note one octave above **C4** as your `guess` (for example, `"C5"`), then press Run. Hint: an octave up keeps the letter name, adds 1 to the octave number, and doubles the frequency. Refresher: [[octave]].

# Recipe

Let start = "C4".
Return {{ ("Correct — " + guess + " is one octave above " + start + ": same letter, octave number +1, frequency doubled.") if music21.pitch.Pitch(guess).midi == music21.pitch.Pitch(start).midi + 12 else ("Not quite. From " + start + ", one octave up keeps the letter and raises the octave number by 1 — and doubles the frequency (" + str(round(music21.pitch.Pitch(start).frequency)) + " Hz to " + str(round(music21.pitch.Pitch(start).frequency * 2)) + " Hz). You entered " + guess + "; try again.") }}.

# Python

```python
def compute(context):
  start = 'C4'
  return music21.pitch.Pitch(guess).midi == music21.pitch.Pitch(start).midi + 12

```
