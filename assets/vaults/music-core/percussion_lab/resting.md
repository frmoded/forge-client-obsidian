---
type: action
inputs: [bars]
source_facet: description
sync_state: stale-recipe
description_hash: a8fa1c605cb658c02f2d4e384391fc1a7289b112fd8c5e420a4e7d6b083762f4
recipe_hash: c665d9a7480981b445267b49c9b709771240be53678c79558e2a04631f3f7fd6
python_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
recipe_derived_from_description_hash: a8fa1c605cb658c02f2d4e384391fc1a7289b112fd8c5e420a4e7d6b083762f4
recipe_derived_from_source_hash: a8fa1c605cb658c02f2d4e384391fc1a7289b112fd8c5e420a4e7d6b083762f4
python_derived_from_recipe_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
python_derived_from_source_hash: a8fa1c605cb658c02f2d4e384391fc1a7289b112fd8c5e420a4e7d6b083762f4
recipe_version: 2
---

# Description

The flock at rest. Kick alone — slow, sparse. Bar 1 has two hits (beats 1
and 3); bars 2-4 have only beat 1. The section settles toward stillness.
Same instrument vocabulary as `solitary` but quieter (`p`-band velocity 50)
and rhythmically sparser.

## Inputs

- bars (default 4) — section length; cycles the asymmetric 4-bar kick

# Recipe
Let kp = Call [[play_at_offsets]] with instrument=[[kick]], offsets=[[0, 2], [0], [0], [0]], duration=0.25, bars=bars, velocity=50, mark_dynamics=True.
Return Call [[voices_canonical]] with kp=kp.
