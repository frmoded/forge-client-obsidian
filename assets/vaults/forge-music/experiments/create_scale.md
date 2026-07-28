---
type: action
inputs: []
recipe_version: 1
description_hash: 6d12ce2d71047ccaa8b5cfe575ecd35ce7ec20042b2f23545f3e9d0cbd9a3fbe
recipe_hash: 086080d01e527a162c1d66c77af88ea9b19b35a15ae115d81f605c0195a4b1a0
python_hash: f90dea07c7916867152018e30fb805d48828612bd6b83e3c9cc81101606367f0
recipe_derived_from_source_hash: 6d12ce2d71047ccaa8b5cfe575ecd35ce7ec20042b2f23545f3e9d0cbd9a3fbe
python_derived_from_source_hash: 6d12ce2d71047ccaa8b5cfe575ecd35ce7ec20042b2f23545f3e9d0cbd9a3fbe
source_facet: synced
recipe_derived_from_description_hash: 6d12ce2d71047ccaa8b5cfe575ecd35ce7ec20042b2f23545f3e9d0cbd9a3fbe
english_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
python_derived_from_recipe_hash: 086080d01e527a162c1d66c77af88ea9b19b35a15ae115d81f605c0195a4b1a0
sync_state: synced
---

# Description

Return the diatonic scale for a given tonic and mode as ascending pitch names, tonic to tonic inclusive. Given a tonic note name (e.g. "C", "F#", "Bb") and a mode ("major" or "minor"), return the eight pitch names of one ascending octave of that scale — from the tonic up to the tonic an octave above. Pitch names use music21 spelling with octave designations (flats written with `-`, e.g. "B-4").

## Inputs

- tonic — tonic note name string (e.g. "C", "F#", "Bb")
- mode — scale mode: "major" or "minor"

# Recipe

Return Call [[diatonic_scale]] with tonic=tonic, mode=mode.

# Python

```python
def compute(context, tonic, mode):
  return diatonic_scale(tonic=tonic, mode=mode)

```
