---
type: action
inputs: [bars, velocity]
source_facet: description
description_hash: ff4f50ccd1a7dc0477b0fa9a22bca658f89d18bf5c30c02c9192f7f4b87ac137
recipe_hash: bca68851d5dc31407b28461c9fd6d9d050d1ccacb92119c1fe31de7528dac969
python_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
recipe_derived_from_description_hash: ff4f50ccd1a7dc0477b0fa9a22bca658f89d18bf5c30c02c9192f7f4b87ac137
recipe_derived_from_source_hash: ff4f50ccd1a7dc0477b0fa9a22bca658f89d18bf5c30c02c9192f7f4b87ac137
python_derived_from_recipe_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
python_derived_from_source_hash: ff4f50ccd1a7dc0477b0fa9a22bca658f89d18bf5c30c02c9192f7f4b87ac137
recipe_version: 4
---

# Description

One bird, slow turns. The opening of the murmuration arc: just the kick,
on beats 1 and 3 of each bar. Spare, deliberate, quiet — `mp`-band velocity
(70). The piece's resting heartbeat; later sections add to this baseline.

## Inputs

- bars (default 4) — section length; cycles 4-bar pattern for >4

# Recipe
Input bars: int = 4.
Input velocity: int = 70.
Let kp = Call [[play_at_offsets]] with instrument=[[kick]], offsets=[0, 2], duration=0.25, bars=bars, velocity=velocity, mark_dynamics=True.
Return Call [[voices_canonical]] with kp=kp.
