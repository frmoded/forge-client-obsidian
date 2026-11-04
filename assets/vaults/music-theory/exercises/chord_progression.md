---
type: action
inputs:
  - key_name
  - mode_name
  - progression
recipe_version: 2
description_hash: 3f4970993ce5fdedced6f775ab7957ecf9d22cd1b0cea1d0fa997cbfdb9e5fda
recipe_hash: d0000787e59cf0b692d9cca09ee77026454069e948e27960402a873e56a44f34
python_hash: af58466e2749546b9f7a3102f5645e7d4fbfe6ce8e0b10ac60ea88bad78efa66
recipe_derived_from_source_hash: 3f4970993ce5fdedced6f775ab7957ecf9d22cd1b0cea1d0fa997cbfdb9e5fda
source_facet: description
recipe_derived_from_description_hash: 3f4970993ce5fdedced6f775ab7957ecf9d22cd1b0cea1d0fa997cbfdb9e5fda
python_derived_from_source_hash: 3f4970993ce5fdedced6f775ab7957ecf9d22cd1b0cea1d0fa997cbfdb9e5fda
python_derived_from_recipe_hash: d0000787e59cf0b692d9cca09ee77026454069e948e27960402a873e56a44f34
---

# Description

Return a music21 Score realizing your Roman-numeral `progression` (e.g. ["I", "IV", "I", "V", "I"]) as concrete triads in `key_name`/`mode_name`, in 4/4 at 90 BPM — press Run to hear it. `mode_name` is one of "major", "minor", "ionian", "dorian", "phrygian", "lydian", "mixolydian", "aeolian", "locrian". All three inputs are required and have no defaults. Build different progressions to compare how they punctuate: ending V→I resolves fully (authentic cadence), IV→I is softer (plagal, the "amen"), stopping on V leaves it hanging (half cadence), V→vi surprises instead of resolving (deceptive cadence). All seven diatonic scale-degree triads (I ii iii IV V vi vii°) are available to build with. Concept refresher: [[chord/function/diatonic_chord]], [[chord/function/harmonic_function]], [[chord/function/chord_progression]], [[chord/function/cadence]].

## Inputs

- key_name — the key's tonic, e.g. "C"
- mode_name — the mode, e.g. "major"
- progression — the Roman-numeral chord sequence to realize, e.g. ["I", "IV", "I", "V", "I"]

# Recipe

Input key_name: str.
Input mode_name: str.
Input progression: list.
Let harmony = Call [[form]] with key_name=key_name, mode_name=mode_name, tempo_bpm=90, ts_str="4/4", progression=progression.
Return harmony.

# Python

```python
def compute(context, key_name: str, mode_name: str, progression: list):
  harmony = form(key_name=key_name, mode_name=mode_name, tempo_bpm=90, ts_str='4/4', progression=progression)
  return harmony
```
