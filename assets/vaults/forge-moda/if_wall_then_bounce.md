---
type: action
role: leaf
description: "Block 13 — control: if a particle touches a wall, bounce it."
python_hash: 8e766ca30443a86e7942120e23defaaf33804c344ac3a6c4565f8207325976af
description_hash: d4ebc7e877dcb8e9227fb9ff8407c8910eac3378580cda47b4e7675d45f30d41
recipe_hash: 4979d1ed0f81970bc06ef78f88080368a75a969c968918edfa76fa246c8a779f
recipe_derived_from_source_hash: d4ebc7e877dcb8e9227fb9ff8407c8910eac3378580cda47b4e7675d45f30d41
python_derived_from_source_hash: d4ebc7e877dcb8e9227fb9ff8407c8910eac3378580cda47b4e7675d45f30d41
source_facet: synced
recipe_derived_from_description_hash: d4ebc7e877dcb8e9227fb9ff8407c8910eac3378580cda47b4e7675d45f30d41
python_derived_from_recipe_hash: 4979d1ed0f81970bc06ef78f88080368a75a969c968918edfa76fa246c8a779f
---

# Description

If the current particle is touching a wall (its position is at or
past any chamber bound): bounce it off the wall via [[bounce_off_wall]].
Particles inside the chamber pass through unchanged.

## Inputs

- state — current ParticleState

# Recipe

Let new_state = Call [[bounce_off_wall]] with state=state.
Return new_state.

# Python

```python
def compute(context, state):
  new_state = bounce_off_wall(state=state)
  return new_state
```
