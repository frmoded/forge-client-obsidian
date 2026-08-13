---
type: action
inputs: [bars]
source_facet: description
sync_state: stale-recipe
description_hash: 12e356401d25925d4bb99637b0db9e96f919b12c47e7354a2f0257deca5308ea
recipe_hash: dd964a532553ad5f787cd32daf614fce3521369ffbf84fb4d07496386a6e281c
python_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
recipe_derived_from_description_hash: 12e356401d25925d4bb99637b0db9e96f919b12c47e7354a2f0257deca5308ea
recipe_derived_from_source_hash: 12e356401d25925d4bb99637b0db9e96f919b12c47e7354a2f0257deca5308ea
python_derived_from_recipe_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
python_derived_from_source_hash: 12e356401d25925d4bb99637b0db9e96f919b12c47e7354a2f0257deca5308ea
recipe_version: 2
---

# Description

A few birds join. Kick stays the heartbeat (beats 1 and 3); closed hi-hat
enters with steady quarter notes. Two voices play; the other 5 instruments
fill rest staves at their canonical voice positions so [[murmuration]] can
`sequence` sections without pitch-collapse on rendering.

## Inputs

- bars (default 4) — section length

# Recipe
Let kp = Call [[play_at_offsets]] with instrument=[[kick]], offsets=[0, 2], duration=0.25, bars=bars, velocity="human", mark_dynamics=True.
Let chp = Call [[play_at_offsets]] with instrument=[[closed_hihat]], offsets=[0, 1, 2, 3], duration=0.25, bars=bars, velocity="human".
Return Call [[voices_canonical]] with kp=kp, chp=chp.
