---
type: action
inputs: [bars]
source_facet: description
sync_state: stale-recipe
description_hash: 4f1bcd996a6804b78f8074b88b29e8379865336dbd9c21e24f335b2acad4766f
recipe_hash: 2c0ed1847234f2d94bf2b0a4281cfd6f0830a3844542608ebcc3a103b558bb06
python_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
recipe_derived_from_description_hash: 4f1bcd996a6804b78f8074b88b29e8379865336dbd9c21e24f335b2acad4766f
recipe_derived_from_source_hash: 4f1bcd996a6804b78f8074b88b29e8379865336dbd9c21e24f335b2acad4766f
python_derived_from_recipe_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
python_derived_from_source_hash: 4f1bcd996a6804b78f8074b88b29e8379865336dbd9c21e24f335b2acad4766f
recipe_version: 2
---

# Description

Threads weaving back together. Kick + closed hi-hat carry the heartbeat;
snare returns lightly on off-beats `1.5` and `3.5`. Three voices — kick on
1+3, snare on 1.5+3.5, closed hi-hat on quarters. `human` velocity profile.

## Inputs

- bars (default 4) — section length

# Recipe
Let kp = Call [[play_at_offsets]] with instrument=[[kick]], offsets=[0, 2], duration=0.25, bars=bars, velocity="human", mark_dynamics=True.
Let sp = Call [[play_at_offsets]] with instrument=[[snare]], offsets=[1.5, 3.5], duration=0.25, bars=bars, velocity="human".
Let chp = Call [[play_at_offsets]] with instrument=[[closed_hihat]], offsets=[0, 1, 2, 3], duration=0.25, bars=bars, velocity="human".
Return Call [[voices_canonical]] with kp=kp, sp=sp, chp=chp.
