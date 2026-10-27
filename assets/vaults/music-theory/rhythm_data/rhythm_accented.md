---
type: action
inputs: []
source_facet: description
description_hash: 4aaf66b4c582b67eafbdfc86da9eaf6d4870f76ea50acc8d9cf4e193b1831593
recipe_hash: 2266830fcba234b39df45bffbefd7b1d9f811458b558dfbe4b21d66af633ff31
python_hash: 36ac7b15cf83487b1d9bb41058ee1443a31efb53588fc947033c6c4349c8cd70
recipe_derived_from_description_hash: 4aaf66b4c582b67eafbdfc86da9eaf6d4870f76ea50acc8d9cf4e193b1831593
recipe_derived_from_source_hash: 4aaf66b4c582b67eafbdfc86da9eaf6d4870f76ea50acc8d9cf4e193b1831593
recipe_version: 1
python_derived_from_source_hash: 4aaf66b4c582b67eafbdfc86da9eaf6d4870f76ea50acc8d9cf4e193b1831593
python_derived_from_recipe_hash: 2266830fcba234b39df45bffbefd7b1d9f811458b558dfbe4b21d66af633ff31
---

# Description

The straight rock beat, accented by the syncopated figure. The syncopated pattern is used as a mask: wherever any of its channels (kick, snare or hi-hat) hits, the straight-rock hit on that step is played loud, and every other straight-rock hit is played soft. Rests stay rests. accent_mask does the modulation, writing a per-step velocity into the rhythm data, and rhythm_data_to_stream turns the result into a one-bar Score whose hits carry those velocities. It is the first rhythm-modulation example: one pattern shaping another.

# Recipe

Let base = Call [[rhythm_pattern_straight_rock]].
Let mask = Call [[rhythm_pattern_syncopated]].
Let accented = Call [[accent_mask]] with base=base, mask=mask.
Return Call [[rhythm_data_to_stream]] with data=accented.

# Python

```python
def compute(context):
  base = rhythm_pattern_straight_rock()
  mask = rhythm_pattern_syncopated()
  accented = accent_mask(base=base, mask=mask)
  return rhythm_data_to_stream(data=accented)
```
