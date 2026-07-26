---
type: action
inputs:
  - tonic
description_hash: 1ed8961cf4685513ffee07c21aa70efac2406a2b3719098c9bd03df9c7e0669a
recipe_hash: fc6ef2a05b8e9a310530489fef971cb473ba7237f35c918a0363b714d4bf1cff
python_hash: 03cabe8cc07e0954474aee2f1e343a408cb43674e2447e33dbeda18ae26ec6f8
recipe_derived_from_source_hash: 1ed8961cf4685513ffee07c21aa70efac2406a2b3719098c9bd03df9c7e0669a
python_derived_from_source_hash: 1ed8961cf4685513ffee07c21aa70efac2406a2b3719098c9bd03df9c7e0669a
source_facet: description
recipe_derived_from_description_hash: 1ed8961cf4685513ffee07c21aa70efac2406a2b3719098c9bd03df9c7e0669a
english_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
python_derived_from_recipe_hash: fc6ef2a05b8e9a310530489fef971cb473ba7237f35c918a0363b714d4bf1cff
---

# Description

Return the major scale that starts at a given note. Give it a tonic
note name like C, G, or F# and it returns the note names of one
ascending octave of that major scale, tonic to tonic inclusive —
e.g. C gives [C, D, E, F, G, A, B, C]. Note names use music21
spelling (flats written with `-`, e.g. Bb's scale starts at B-).


## Inputs

- tonic — tonic note name string (A, B, C, ...; sharps/flats like F# or Bb allowed)

# Recipe

Let key_obj = Call [[major_pentatonic]] with key_or_tonic=tonic, octave_range=[4, 5].
Let full_key = Call [[minor_pentatonic]] with key_or_tonic=tonic, octave_range=[4, 5], include_blue=False.
Let scale = Call [[form]] with key_name=tonic, mode_name="major", tempo_bpm=120, ts_str="4/4".
Let found_key = Call [[walking_bass_line]] with harmony=scale.

# Python

```python
def compute(context, tonic):
  key_obj = major_pentatonic(key_or_tonic=tonic, octave_range=[4, 5])
  full_key = minor_pentatonic(key_or_tonic=tonic, octave_range=[4, 5], include_blue=False)
  scale = form(key_name=tonic, mode_name='major', tempo_bpm=120, ts_str='4/4')
  found_key = walking_bass_line(harmony=scale)

```
