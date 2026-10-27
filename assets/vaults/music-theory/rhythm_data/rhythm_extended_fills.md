---
type: action
inputs: []
source_facet: description
description_hash: ed097d8b4acc9e2067829d9f83b932630268f1bfda641bbb38ec9e8064959015
recipe_hash: 732f4bd60df4b41bf70c3450d10d05328e1fabf7213ab9ff6a19e1975641312e
python_hash: 79994cb69a408ba3fc15e16ac5364480f75b1880d8c6424fb6a3f7bd478c3f0a
recipe_derived_from_description_hash: ed097d8b4acc9e2067829d9f83b932630268f1bfda641bbb38ec9e8064959015
recipe_derived_from_source_hash: ed097d8b4acc9e2067829d9f83b932630268f1bfda641bbb38ec9e8064959015
recipe_version: 1
python_derived_from_source_hash: ed097d8b4acc9e2067829d9f83b932630268f1bfda641bbb38ec9e8064959015
python_derived_from_recipe_hash: 732f4bd60df4b41bf70c3450d10d05328e1fabf7213ab9ff6a19e1975641312e
---

# Description

The straight rock beat grown into four bars of 4/4 at 100 BPM with extend_rhythm in the repeat_with_fills style: bars 1 to 3 repeat the rock pattern unchanged, and bar 4 ends in a snare fill on its last beat — four sixteenth-note snare hits rising in loudness from velocity 64 to 112, with the kick and hi-hat stopping — so the pattern builds into the final accent. rhythm_bars_to_stream turns the four bars into one score with kick, snare and hi-hat staves.

# Recipe

Let base = Call [[rhythm_pattern_straight_rock]].
Let bars = Call [[extend_rhythm]] with data=base, bars=4, style="repeat_with_fills".
Return Call [[rhythm_bars_to_stream]] with bars=bars.

# Python

```python
def compute(context):
  base = rhythm_pattern_straight_rock()
  bars = extend_rhythm(data=base, bars=4, style='repeat_with_fills')
  return rhythm_bars_to_stream(bars=bars)
```
