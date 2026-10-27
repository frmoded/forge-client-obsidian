---
type: action
inputs: []
source_facet: description
description_hash: c23e8360be8ec8ea050554d4d809e6229489ee6aa72b4bfb4e33d1a23aa8775f
recipe_hash: 9c575bbbdc3f97dcbfe312a690f88d03fa71714ebcd9949d52a6b82ac9504b9f
python_hash: 8bb07b85197b8cb7243f3e8d650df161b87aa334d35843a1541eddd852511816
recipe_derived_from_description_hash: c23e8360be8ec8ea050554d4d809e6229489ee6aa72b4bfb4e33d1a23aa8775f
recipe_derived_from_source_hash: c23e8360be8ec8ea050554d4d809e6229489ee6aa72b4bfb4e33d1a23aa8775f
recipe_version: 1
python_derived_from_source_hash: c23e8360be8ec8ea050554d4d809e6229489ee6aa72b4bfb4e33d1a23aa8775f
python_derived_from_recipe_hash: 9c575bbbdc3f97dcbfe312a690f88d03fa71714ebcd9949d52a6b82ac9504b9f
---

# Description

The straight rock beat grown into four bars of 4/4 at 100 BPM with extend_rhythm in the building style: the kick and snare repeat unchanged in every bar while the hi-hat gets busier — quarter notes in bar 1, eighth notes in bar 2, sixteenth notes in bars 3 and 4 — with the hits on the beat louder (velocity 80) than the ones between (56). rhythm_bars_to_stream turns the four bars into one score with kick, snare and hi-hat staves.

# Recipe

Let base = Call [[rhythm_pattern_straight_rock]].
Let bars = Call [[extend_rhythm]] with data=base, bars=4, style="building".
Return Call [[rhythm_bars_to_stream]] with bars=bars.

# Python

```python
def compute(context):
  base = rhythm_pattern_straight_rock()
  bars = extend_rhythm(data=base, bars=4, style='building')
  return rhythm_bars_to_stream(bars=bars)
```
