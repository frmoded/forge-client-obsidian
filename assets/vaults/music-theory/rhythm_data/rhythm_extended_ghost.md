---
type: action
inputs: []
source_facet: description
description_hash: f82c1ff53decef780deeca4956b717c3b4e3eaf8dc06cff6fcd5cab937774809
recipe_hash: 8bcfdca211185fbee73a695e23542c2e202b168ecd74502e0319d1dab7f70ff4
python_hash: 4ef121e5ac67ecd990f86a6fe24962dbd001580626edc9fc1239bf2873efec60
recipe_derived_from_description_hash: f82c1ff53decef780deeca4956b717c3b4e3eaf8dc06cff6fcd5cab937774809
recipe_derived_from_source_hash: f82c1ff53decef780deeca4956b717c3b4e3eaf8dc06cff6fcd5cab937774809
recipe_version: 1
python_derived_from_source_hash: f82c1ff53decef780deeca4956b717c3b4e3eaf8dc06cff6fcd5cab937774809
python_derived_from_recipe_hash: 8bcfdca211185fbee73a695e23542c2e202b168ecd74502e0319d1dab7f70ff4
---

# Description

The straight rock beat grown into four bars of 4/4 at 100 BPM with extend_rhythm in the ghost_notes style: the kick, hi-hat and main snare hits repeat unchanged, and very quiet snare ghost notes (velocity 36) are added between them — on the last sixteenth of each beat in bars 1 and 3, on the second sixteenth of each beat in bars 2 and 4. rhythm_bars_to_stream turns the four bars into one score with kick, snare and hi-hat staves.

# Recipe

Let base = Call [[rhythm_pattern_straight_rock]].
Let bars = Call [[extend_rhythm]] with data=base, bars=4, style="ghost_notes".
Return Call [[rhythm_bars_to_stream]] with bars=bars.

# Python

```python
def compute(context):
  base = rhythm_pattern_straight_rock()
  bars = extend_rhythm(data=base, bars=4, style='ghost_notes')
  return rhythm_bars_to_stream(bars=bars)
```
