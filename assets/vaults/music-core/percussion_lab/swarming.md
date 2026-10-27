---
type: action
inputs: [bars, kick_velocity, snare_velocity, hihat_velocity, ohat_velocity, ltom_velocity, mtom_velocity]
source_facet: description
description_hash: 693ef4779486642d46bd867908c19eb09e66f453d6ff9ddf6852bdaa0036b67c
recipe_hash: 71b170e681dd31f4062f9385ca441793af1b7195e4944a6aabaa0ae62f38ca56
python_hash: 9c9f97621fd781714ba8d74f531dd624f5d20b9271157e8f8c626b23d012d4af
recipe_derived_from_description_hash: 693ef4779486642d46bd867908c19eb09e66f453d6ff9ddf6852bdaa0036b67c
recipe_derived_from_source_hash: 693ef4779486642d46bd867908c19eb09e66f453d6ff9ddf6852bdaa0036b67c
python_derived_from_recipe_hash: 71b170e681dd31f4062f9385ca441793af1b7195e4944a6aabaa0ae62f38ca56
python_derived_from_source_hash: 693ef4779486642d46bd867908c19eb09e66f453d6ff9ddf6852bdaa0036b67c
recipe_version: 4
---

# Description

The flock swarming — full kit minus crash. Kick varies bar-by-bar with
syncopated pickups; snare drives a heavy backbeat; closed hi-hat fills with
straight eighths; open hi-hat punctuates beat 4-and; toms add a low/mid
two-note phrase. Six voices active. `human` velocity profile (`mf` band).

## Inputs

- bars (default 4) — section length

# Recipe
Input bars: int = 4.
Input kick_velocity: int | str = "human".
Input snare_velocity: int | str = "human".
Input hihat_velocity: int | str = "human".
Input ohat_velocity: int | str = "human".
Input ltom_velocity: int | str = "human".
Input mtom_velocity: int | str = "human".
Let kp = Call [[play_at_offsets]] with instrument=[[kick]], offsets=[[0, 1.5, 2, 3.5], [0, 2], [0, 1.5, 2, 3.5], [0, 2]], duration=0.25, bars=bars, velocity=kick_velocity, mark_dynamics=True.
Let sp = Call [[play_at_offsets]] with instrument=[[snare]], offsets=[0.5, 1, 2.5, 3], duration=0.25, bars=bars, velocity=snare_velocity.
Let chp = Call [[play_at_offsets]] with instrument=[[closed_hihat]], offsets=[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], duration=0.25, bars=bars, velocity=hihat_velocity.
Let ohp = Call [[play_at_offsets]] with instrument=[[open_hihat]], offsets=[3.5], duration=0.25, bars=bars, velocity=ohat_velocity.
Let ltp = Call [[play_at_offsets]] with instrument=[[low_tom]], offsets=[1, 3.5], duration=0.25, bars=bars, velocity=ltom_velocity.
Let mtp = Call [[play_at_offsets]] with instrument=[[mid_tom]], offsets=[1.5], duration=0.25, bars=bars, velocity=mtom_velocity.
Return Call [[voices_canonical]] with kp=kp, sp=sp, chp=chp, ohp=ohp, ltp=ltp, mtp=mtp.

# Python

```python
def compute(context, bars: int = 4, kick_velocity: int | str = 'human', snare_velocity: int | str = 'human', hihat_velocity: int | str = 'human', ohat_velocity: int | str = 'human', ltom_velocity: int | str = 'human', mtom_velocity: int | str = 'human'):
  kp = play_at_offsets(instrument=kick(), offsets=[[0, 1.5, 2, 3.5], [0, 2], [0, 1.5, 2, 3.5], [0, 2]], duration=0.25, bars=bars, velocity=kick_velocity, mark_dynamics=True)
  sp = play_at_offsets(instrument=snare(), offsets=[0.5, 1, 2.5, 3], duration=0.25, bars=bars, velocity=snare_velocity)
  chp = play_at_offsets(instrument=closed_hihat(), offsets=[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], duration=0.25, bars=bars, velocity=hihat_velocity)
  ohp = play_at_offsets(instrument=open_hihat(), offsets=[3.5], duration=0.25, bars=bars, velocity=ohat_velocity)
  ltp = play_at_offsets(instrument=low_tom(), offsets=[1, 3.5], duration=0.25, bars=bars, velocity=ltom_velocity)
  mtp = play_at_offsets(instrument=mid_tom(), offsets=[1.5], duration=0.25, bars=bars, velocity=mtom_velocity)
  return voices_canonical(kp=kp, sp=sp, chp=chp, ohp=ohp, ltp=ltp, mtp=mtp)
```
