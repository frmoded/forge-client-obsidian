---
type: action
inputs: [bars, kick_velocity, snare_velocity, hihat_velocity]
source_facet: description
sync_state: synced
description_hash: 8b132ec66ae97f918a1433c02d9d648394fe6872291835f8c7af59066b4598f8
recipe_hash: 6a0077492423a0b9745a912a1eb57acf566199900fe24b5369728f3161aa3d2b
python_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
recipe_derived_from_description_hash: 8b132ec66ae97f918a1433c02d9d648394fe6872291835f8c7af59066b4598f8
recipe_derived_from_source_hash: 8b132ec66ae97f918a1433c02d9d648394fe6872291835f8c7af59066b4598f8
python_derived_from_recipe_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
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
