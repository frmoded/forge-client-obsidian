---
type: action
inputs: []
source_facet: description
description_hash: ad1e56a6f6e35b697d39230ee70b51c9e9df77570f6d390301688ba0a921e249
recipe_hash: 2e3c9ce9d5090b0d5999b35230a2b5bf30798e49f38f95f481936d1d6fff4c4e
python_hash: 27919cb7cb4bfe9a1faf431f5167d71d8c26583846af62a8e46c9bb68cbe77b1
recipe_derived_from_description_hash: ad1e56a6f6e35b697d39230ee70b51c9e9df77570f6d390301688ba0a921e249
recipe_derived_from_source_hash: ad1e56a6f6e35b697d39230ee70b51c9e9df77570f6d390301688ba0a921e249
recipe_version: 1
python_derived_from_source_hash: ad1e56a6f6e35b697d39230ee70b51c9e9df77570f6d390301688ba0a921e249
python_derived_from_recipe_hash: 2e3c9ce9d5090b0d5999b35230a2b5bf30798e49f38f95f481936d1d6fff4c4e
---

# Description

Two rhythm-data notes played one after the other, as a two-bar beat. Each data note holds one Rhythm Box pattern (straight rock, then the syncopated funk figure); this note converts each to a stream with rhythm_data_to_stream and joins them end to end with sequence_list, so the straight-rock bar plays first and the syncopated bar second. Kick, snare and hi-hat each stay on their own staff across both bars. It is the sequential twin of rhythm_multiplex, which layers the same two patterns in parallel.

# Recipe

Let pattern_a = Call [[rhythm_pattern_straight_rock]].
Let pattern_b = Call [[rhythm_pattern_syncopated]].
Let a = Call [[rhythm_data_to_stream]] with data=pattern_a.
Let b = Call [[rhythm_data_to_stream]] with data=pattern_b.
Return Call [[sequence_list]] with sections=[a, b].

# Python

```python
def compute(context):
  pattern_a = rhythm_pattern_straight_rock()
  pattern_b = rhythm_pattern_syncopated()
  a = rhythm_data_to_stream(data=pattern_a)
  b = rhythm_data_to_stream(data=pattern_b)
  return sequence_list(sections=[a, b])
```
