---
type: action
inputs: [bars]
source_facet: description
sync_state: stale-recipe
description_hash: 693ef4779486642d46bd867908c19eb09e66f453d6ff9ddf6852bdaa0036b67c
recipe_hash: 66c614725a93df6b7ce8bad4489970f4f5f3dd732edd6d6cf70ac82d61bed76a
python_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
recipe_derived_from_description_hash: 693ef4779486642d46bd867908c19eb09e66f453d6ff9ddf6852bdaa0036b67c
recipe_derived_from_source_hash: 693ef4779486642d46bd867908c19eb09e66f453d6ff9ddf6852bdaa0036b67c
python_derived_from_recipe_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
python_derived_from_source_hash: 693ef4779486642d46bd867908c19eb09e66f453d6ff9ddf6852bdaa0036b67c
recipe_version: 2
---

# Description

The flock swarming — full kit minus crash. Kick varies bar-by-bar with
syncopated pickups; snare drives a heavy backbeat; closed hi-hat fills with
straight eighths; open hi-hat punctuates beat 4-and; toms add a low/mid
two-note phrase. Six voices active. `human` velocity profile (`mf` band).

## Inputs

- bars (default 4) — section length

# Recipe
Let kp = Call [[play_at_offsets]] with instrument=[[kick]], offsets=[[0, 1.5, 2, 3.5], [0, 2], [0, 1.5, 2, 3.5], [0, 2]], duration=0.25, bars=bars, velocity="human", mark_dynamics=True.
Let sp = Call [[play_at_offsets]] with instrument=[[snare]], offsets=[0.5, 1, 2.5, 3], duration=0.25, bars=bars, velocity="human".
Let chp = Call [[play_at_offsets]] with instrument=[[closed_hihat]], offsets=[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], duration=0.25, bars=bars, velocity="human".
Let ohp = Call [[play_at_offsets]] with instrument=[[open_hihat]], offsets=[3.5], duration=0.25, bars=bars, velocity="human".
Let ltp = Call [[play_at_offsets]] with instrument=[[low_tom]], offsets=[1, 3.5], duration=0.25, bars=bars, velocity="human".
Let mtp = Call [[play_at_offsets]] with instrument=[[mid_tom]], offsets=[1.5], duration=0.25, bars=bars, velocity="human".
Return Call [[voices_canonical]] with kp=kp, sp=sp, chp=chp, ohp=ohp, ltp=ltp, mtp=mtp.
