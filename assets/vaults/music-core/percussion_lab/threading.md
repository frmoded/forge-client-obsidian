---
type: action
inputs: [bars, kick_velocity, snare_velocity, hihat_velocity]
source_facet: description
description_hash: 4f1bcd996a6804b78f8074b88b29e8379865336dbd9c21e24f335b2acad4766f
recipe_hash: 674305ac9386ed5c5e4e6000b8b589017e87bd5c9a3acd6a7232ff1c5f22bef2
python_hash: c4de807d2c4fe967c4f8f111f4432d976756882e5dd2c6014401386de15d1293
recipe_derived_from_description_hash: 4f1bcd996a6804b78f8074b88b29e8379865336dbd9c21e24f335b2acad4766f
recipe_derived_from_source_hash: 4f1bcd996a6804b78f8074b88b29e8379865336dbd9c21e24f335b2acad4766f
python_derived_from_recipe_hash: 674305ac9386ed5c5e4e6000b8b589017e87bd5c9a3acd6a7232ff1c5f22bef2
python_derived_from_source_hash: 4f1bcd996a6804b78f8074b88b29e8379865336dbd9c21e24f335b2acad4766f
recipe_version: 4
---

# Description

Threads weaving back together. Kick + closed hi-hat carry the heartbeat;
snare returns lightly on off-beats `1.5` and `3.5`. Three voices — kick on
1+3, snare on 1.5+3.5, closed hi-hat on quarters. `human` velocity profile.

## Inputs

- bars (default 4) — section length

# Recipe
Input bars: int = 4.
Input kick_velocity: int | str = "human".
Input snare_velocity: int | str = "human".
Input hihat_velocity: int | str = "human".
Let kp = Call [[play_at_offsets]] with instrument=[[kick]], offsets=[0, 2], duration=0.25, bars=bars, velocity=kick_velocity, mark_dynamics=True.
Let sp = Call [[play_at_offsets]] with instrument=[[snare]], offsets=[1.5, 3.5], duration=0.25, bars=bars, velocity=snare_velocity.
Let chp = Call [[play_at_offsets]] with instrument=[[closed_hihat]], offsets=[0, 1, 2, 3], duration=0.25, bars=bars, velocity=hihat_velocity.
Return Call [[voices_canonical]] with kp=kp, sp=sp, chp=chp.

# Python

```python
def compute(context, bars: int = 4, kick_velocity: int | str = 'human', snare_velocity: int | str = 'human', hihat_velocity: int | str = 'human'):
  kp = play_at_offsets(instrument=kick(), offsets=[0, 2], duration=0.25, bars=bars, velocity=kick_velocity, mark_dynamics=True)
  sp = play_at_offsets(instrument=snare(), offsets=[1.5, 3.5], duration=0.25, bars=bars, velocity=snare_velocity)
  chp = play_at_offsets(instrument=closed_hihat(), offsets=[0, 1, 2, 3], duration=0.25, bars=bars, velocity=hihat_velocity)
  return voices_canonical(kp=kp, sp=sp, chp=chp)
```
