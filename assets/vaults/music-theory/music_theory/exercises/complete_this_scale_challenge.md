---
type: action
inputs: []
recipe_version: 1
sync_state: stale-recipe
description_hash: 17a07c1c6993f5053a83e82e755b28b4495b31c5af2cc61239aa02b9f13d9189
recipe_hash: 6d5a52d36c5c94ff001ba213ad153785b5a1e8e83b5a46fad0625af6a8c4ea42
python_hash: ca70fb05d5333c2123e00da62677f4114709c1272d80c013ec02667f9e2260f8
recipe_derived_from_source_hash: 17a07c1c6993f5053a83e82e755b28b4495b31c5af2cc61239aa02b9f13d9189
python_derived_from_source_hash: 17a07c1c6993f5053a83e82e755b28b4495b31c5af2cc61239aa02b9f13d9189
source_facet: python
recipe_derived_from_description_hash: 17a07c1c6993f5053a83e82e755b28b4495b31c5af2cc61239aa02b9f13d9189
english_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
python_derived_from_recipe_hash: 6d5a52d36c5c94ff001ba213ad153785b5a1e8e83b5a46fad0625af6a8c4ea42
---

# Description

Press **Run** to hear the first four notes of a C major scale. Your task: work out the four notes that complete the octave — then check yourself in [[music_theory/exercises/complete_this_scale_submit]]. New to scales? Start with [[music_theory/scales/scale]].

# Recipe

Let true_tonic = "C".
Let true_mode = "major".
Let scale = Call [[diatonic_scale]] with tonic=true_tonic, mode=true_mode.
Return {{ music21.stream.Part([music21.note.Note(n, quarterLength=1.0) for n in scale[:4]]) }}.

# Python

```python
def compute(context):
  true_tonic = 'C'
  true_mode = 'major'
  scale = diatonic_scale(tonic=true_tonic, mode=true_mode)
  return [music21.note.Note(n, quarterLength=1.0) for n in scale[:4]]

```
