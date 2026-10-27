---
type: action
role: leaf
description: "Block 11 — action: advance every particle's position one tick along its heading."
python_hash: 59405f4c55dec8f6a2567be01a6bba4def20843eb230ae25899876601751c507
description_hash: 4fb5db30e3934a8c4ef3886232d98ad23e36b25c43f33de83d7594ce65ab9977
recipe_hash: 8a812e550ced52a9af711fe7b9d34557a5997e35438f2bbcf518c8b3e4f8bc9b
recipe_derived_from_source_hash: 4fb5db30e3934a8c4ef3886232d98ad23e36b25c43f33de83d7594ce65ab9977
python_derived_from_source_hash: 4fb5db30e3934a8c4ef3886232d98ad23e36b25c43f33de83d7594ce65ab9977
source_facet: synced
recipe_derived_from_description_hash: 4fb5db30e3934a8c4ef3886232d98ad23e36b25c43f33de83d7594ce65ab9977
python_derived_from_recipe_hash: 8a812e550ced52a9af711fe7b9d34557a5997e35438f2bbcf518c8b3e4f8bc9b
---

# Description

Move every particle one tick forward along its current heading.
Position `(x, y)` updates by `speed * cos(heading) * dt` and
`speed * sin(heading) * dt`. Other fields unchanged. Bumps tick by 1.

## Inputs

- state — current ParticleState
- dt — time step in seconds (e.g. `1/30` for 30 FPS)

# Recipe

Let new_state = Call [[advance_positions]] with state=state, dt=dt.
Return new_state.

# Python

```python
def compute(context, state, dt):
  new_state = advance_positions(state=state, dt=dt)
  return new_state
```
