---
type: action
inputs:
  - guess
recipe_version: 1
description_hash: bff67aca7fa9fe58411b0b45d8b62ef7478fc7dd1957dac58d1a0a04b6cb7708
recipe_hash: 04c7f7ef6501a4248adbb21fb647f49b27487733fef11fe98407847edcab3632
python_hash: bb9d95290547e1d11857029e8b16300e7b8c3ce0973dee99daad41e858e8cd61
recipe_derived_from_source_hash: bff67aca7fa9fe58411b0b45d8b62ef7478fc7dd1957dac58d1a0a04b6cb7708
python_derived_from_source_hash: bff67aca7fa9fe58411b0b45d8b62ef7478fc7dd1957dac58d1a0a04b6cb7708
source_facet: python
recipe_derived_from_description_hash: bff67aca7fa9fe58411b0b45d8b62ef7478fc7dd1957dac58d1a0a04b6cb7708
python_derived_from_recipe_hash: 04c7f7ef6501a4248adbb21fb647f49b27487733fef11fe98407847edcab3632
---

# Description

Enter the note one octave above **C4** as your `guess` (for example, `"C5"`), then press Run. Hint: an octave up keeps the letter name, adds 1 to the octave number, and doubles the frequency. Refresher: [[octave]].

## Inputs

- guess — the note you think is one octave above C4, e.g. "C5"

# Recipe

Let start = "C4".
Return {{ ("Correct — " + guess + " is one octave above " + start + ": same letter, octave number +1, frequency doubled.") if music21.pitch.Pitch(guess).midi == music21.pitch.Pitch(start).midi + 12 else ("Not quite. From " + start + ", one octave up keeps the letter and raises the octave number by 1 — and doubles the frequency (" + str(round(music21.pitch.Pitch(start).frequency)) + " Hz to " + str(round(music21.pitch.Pitch(start).frequency * 2)) + " Hz). You entered " + guess + "; try again.") }}.

# Python

```python
def compute(context, guess):
  start = 'C4'
  return ("Correct — " + guess + " is one octave above " + start + ": same letter, octave number +1, frequency doubled.") if music21.pitch.Pitch(guess).midi == music21.pitch.Pitch(start).midi + 12 else ("Not quite. From " + start + ", one octave up keeps the letter and raises the octave number by 1 — and doubles the frequency (" + str(round(music21.pitch.Pitch(start).frequency)) + " Hz to " + str(round(music21.pitch.Pitch(start).frequency * 2)) + " Hz). You entered " + guess + "; try again.")
```
