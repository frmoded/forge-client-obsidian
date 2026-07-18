---
type: action
inputs:
  - tonic
description_hash: e8e480e9b7253f62d2640a94662aab9dacd31a21dcdb353ac92669301aca810b
recipe_hash: a41702de90579597804f7fa4e71aff05d5da2c466d23327599488f59cedc5e5a
python_hash: ce7f4b0494658c31a71db9ce1eeeaca12f61c087fd5ef44417b2f66200a7fa26
recipe_derived_from_source_hash: e8e480e9b7253f62d2640a94662aab9dacd31a21dcdb353ac92669301aca810b
python_derived_from_source_hash: e8e480e9b7253f62d2640a94662aab9dacd31a21dcdb353ac92669301aca810b
source_facet: description
recipe_derived_from_description_hash: e8e480e9b7253f62d2640a94662aab9dacd31a21dcdb353ac92669301aca810b
english_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
python_derived_from_recipe_hash: a41702de90579597804f7fa4e71aff05d5da2c466d23327599488f59cedc5e5a
---

# Description

Return the major scale that starts at a given note. Give it a tonic
note name like C, G, or F# and it returns the note names of one
ascending octave of that major scale, tonic to tonic inclusive —
e.g. C gives [C, D, E, F, G, A, B, C]. Note names use music21
spelling (flats written with `-`, e.g. Bb's scale starts at B-).
print hello world

## Inputs

- tonic — tonic note name string (A, B, C, ...; sharps/flats like F# or Bb allowed)

# Recipe

Let key_obj = Call [[major_pentatonic]] with key_or_tonic=tonic, octave_range=[4, 5].
Let scale = Call [[minor_pentatonic]] with key_or_tonic=tonic, octave_range=[4, 5], include_blue=False.


Return None.

# Python

```python
def compute(context, tonic):
  key_obj = major_pentatonic(key_or_tonic=tonic, octave_range=[4, 5])
  scale = minor_pentatonic(key_or_tonic=tonic, octave_range=[4, 5], include_blue=False)
  return None

```
