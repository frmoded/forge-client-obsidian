---
type: action
inputs: []
recipe_version: 1
source_facet: description
description_hash: a4395f99a4636691893d8360758e305229d18ce993084590a88824492e22871f
recipe_hash: ef77938961b5ce91be6f9da776982bbc153c4d6f844c8982270cc7730be6f6d6
python_hash: b13528e4ba8e6bf8465c085f14fb47a028a6879356741ee605e8f0ce9cc57b9f
recipe_derived_from_source_hash: a4395f99a4636691893d8360758e305229d18ce993084590a88824492e22871f
python_derived_from_source_hash: a4395f99a4636691893d8360758e305229d18ce993084590a88824492e22871f
recipe_derived_from_description_hash: a4395f99a4636691893d8360758e305229d18ce993084590a88824492e22871f
english_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
python_derived_from_recipe_hash: ef77938961b5ce91be6f9da776982bbc153c4d6f844c8982270cc7730be6f6d6
---

# Description

Return the major scale for a given tonic as ascending pitch names, tonic to tonic inclusive. Given a tonic note name (e.g. "C", "F#", "Bb"), return the eight pitch names of one ascending octave of the major scale — from the tonic up to the tonic an octave above. Pitch names use music21 spelling with octave designations (flats written with `-`, e.g. "B-4").

## Inputs

- tonic — tonic note name string (e.g. "C", "F#", "Bb")

# Recipe

Return Call [[diatonic_scale]] with tonic=tonic.

# Python

```python
def compute(context, tonic):
  return diatonic_scale(tonic=tonic)

```
