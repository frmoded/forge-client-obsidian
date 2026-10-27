---
type: action
inputs: [bars, kick_velocity, snare_velocity, hihat_velocity]
source_facet: description
description_hash: 8b132ec66ae97f918a1433c02d9d648394fe6872291835f8c7af59066b4598f8
recipe_hash: 6a0077492423a0b9745a912a1eb57acf566199900fe24b5369728f3161aa3d2b
python_hash: 2e52c5b78e3007893e416955cd69e07422fe19e7f7941e68914846f929c65368
recipe_derived_from_description_hash: 8b132ec66ae97f918a1433c02d9d648394fe6872291835f8c7af59066b4598f8
recipe_derived_from_source_hash: 8b132ec66ae97f918a1433c02d9d648394fe6872291835f8c7af59066b4598f8
python_derived_from_recipe_hash: 6a0077492423a0b9745a912a1eb57acf566199900fe24b5369728f3161aa3d2b
python_derived_from_source_hash: 8b132ec66ae97f918a1433c02d9d648394fe6872291835f8c7af59066b4598f8
recipe_version: 4
---

# Description

Dozens. Snare arrives with ghost notes; kick syncopates more; closed hi-hat
fills with steady eighths. Three voices active. The bar-by-bar kick variation
keeps the propulsion forward without locking into a stable groove.

## Inputs

- bars (default 4) — section length; cycles the 4-bar kick variation

# Recipe
Input bars: int = 4.
Input kick_velocity: int | str = "human".
Input snare_velocity: int | str = "human".
Input hihat_velocity: int | str = "human".
Let kp = Call [[play_at_offsets]] with instrument=[[kick]], offsets=[[0, 1.5, 2], [0, 2], [0, 1.5, 2], [0, 2, 3.5]], duration=0.25, bars=bars, velocity=kick_velocity, mark_dynamics=True.
Let sp = Call [[play_at_offsets]] with instrument=[[snare]], offsets=[0.5, 1.5, 2.5, 3.5], duration=0.25, bars=bars, velocity=snare_velocity.
Let chp = Call [[play_at_offsets]] with instrument=[[closed_hihat]], offsets=[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], duration=0.25, bars=bars, velocity=hihat_velocity.
Return Call [[voices_canonical]] with kp=kp, sp=sp, chp=chp.

# Python

```python
def compute(context, bars: int = 4, kick_velocity: int | str = 'human', snare_velocity: int | str = 'human', hihat_velocity: int | str = 'human'):
  kp = play_at_offsets(instrument=kick(), offsets=[[0, 1.5, 2], [0, 2], [0, 1.5, 2], [0, 2, 3.5]], duration=0.25, bars=bars, velocity=kick_velocity, mark_dynamics=True)
  sp = play_at_offsets(instrument=snare(), offsets=[0.5, 1.5, 2.5, 3.5], duration=0.25, bars=bars, velocity=snare_velocity)
  chp = play_at_offsets(instrument=closed_hihat(), offsets=[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], duration=0.25, bars=bars, velocity=hihat_velocity)
  return voices_canonical(kp=kp, sp=sp, chp=chp)
```
