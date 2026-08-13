---
type: action
inputs: [bars]
source_facet: description
sync_state: stale-recipe
description_hash: ff4f50ccd1a7dc0477b0fa9a22bca658f89d18bf5c30c02c9192f7f4b87ac137
recipe_hash: 33e0149c82c810a5313da479fb3abd6982e6d422a41f2e6c0220137cc65a89d2
python_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
recipe_derived_from_description_hash: ff4f50ccd1a7dc0477b0fa9a22bca658f89d18bf5c30c02c9192f7f4b87ac137
recipe_derived_from_source_hash: ff4f50ccd1a7dc0477b0fa9a22bca658f89d18bf5c30c02c9192f7f4b87ac137
python_derived_from_recipe_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
python_derived_from_source_hash: ff4f50ccd1a7dc0477b0fa9a22bca658f89d18bf5c30c02c9192f7f4b87ac137
recipe_version: 2
---

# Description

One bird, slow turns. The opening of the murmuration arc: just the kick,
on beats 1 and 3 of each bar. Spare, deliberate, quiet — `mp`-band velocity
(70). The piece's resting heartbeat; later sections add to this baseline.

## Inputs

- bars (default 4) — section length; cycles 4-bar pattern for >4

# Recipe
Let kp = Call [[play_at_offsets]] with instrument=[[kick]], offsets=[0, 2], duration=0.25, bars=bars, velocity=70, mark_dynamics=True.
Return Call [[voices_canonical]] with kp=kp.
