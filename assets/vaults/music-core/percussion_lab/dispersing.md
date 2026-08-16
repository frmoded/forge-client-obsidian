---
type: action
inputs: [bars, kick_velocity, snare_velocity, hihat_velocity, ohat_velocity, ltom_velocity, mtom_velocity]
source_facet: description
sync_state: synced
description_hash: 1faf036d728edb5324b7a46a8b96afeaee163005011007e11ce6f712946d4588
recipe_hash: d8de927d620b68138205f7056e798c51416599fe5643acb6f48dc24a942ae8e2
python_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
recipe_derived_from_description_hash: 1faf036d728edb5324b7a46a8b96afeaee163005011007e11ce6f712946d4588
recipe_derived_from_source_hash: 1faf036d728edb5324b7a46a8b96afeaee163005011007e11ce6f712946d4588
python_derived_from_recipe_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
python_derived_from_source_hash: 1faf036d728edb5324b7a46a8b96afeaee163005011007e11ce6f712946d4588
recipe_version: 4
---

# Description

The flock thinning. Crash is gone; toms drop to single hits per bar; snare
retreats to backbeats. Kick thins bar-by-bar (bar 1 still has a syncopated
pickup; bar 4 only the downbeat). The defining feature: the `decrescendo`
profile inserts a hairpin spanner — visible in MuseScore, audible in MIDI —
that slopes the section from `mf` down toward `mp`.

## Inputs

- bars (default 4) — section length; cycles the asymmetric 4-bar kick

# Recipe
Input bars: int = 4.
Input kick_velocity: int | str = "decrescendo".
Input snare_velocity: int | str = "decrescendo".
Input hihat_velocity: int | str = "decrescendo".
Input ohat_velocity: int | str = "decrescendo".
Input ltom_velocity: int | str = "decrescendo".
Input mtom_velocity: int | str = "decrescendo".
Let kp = Call [[play_at_offsets]] with instrument=[[kick]], offsets=[[0, 2, 3.5], [0, 2], [0, 2], [0]], duration=0.25, bars=bars, velocity=kick_velocity, mark_dynamics=True.
Let sp = Call [[play_at_offsets]] with instrument=[[snare]], offsets=[1, 3], duration=0.25, bars=bars, velocity=snare_velocity.
Let chp = Call [[play_at_offsets]] with instrument=[[closed_hihat]], offsets=[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], duration=0.25, bars=bars, velocity=hihat_velocity.
Let ohp = Call [[play_at_offsets]] with instrument=[[open_hihat]], offsets=[0], duration=0.25, bars=bars, velocity=ohat_velocity.
Let ltp = Call [[play_at_offsets]] with instrument=[[low_tom]], offsets=[1], duration=0.25, bars=bars, velocity=ltom_velocity.
Let mtp = Call [[play_at_offsets]] with instrument=[[mid_tom]], offsets=[1.5], duration=0.25, bars=bars, velocity=mtom_velocity.
Return Call [[voices_canonical]] with kp=kp, sp=sp, chp=chp, ohp=ohp, ltp=ltp, mtp=mtp.
