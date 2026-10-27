---
type: action
role: root
description: "Block 5 — mouse-click event. Create ink at the cursor and set its speed + mass."
python_hash: f269cdab7900f9e70295c1edaece57ba267252a56cf275b760dae5efc1a20d10
description_hash: 564c5d3446b3d57c52dc8537cc6f707d211a3263980374b3a98462af62143d43
recipe_hash: 95e46d776e2507db443de0770bf27cccd2f21228bafd66e1c398ef822a25e34e
recipe_derived_from_source_hash: 564c5d3446b3d57c52dc8537cc6f707d211a3263980374b3a98462af62143d43
python_derived_from_source_hash: 564c5d3446b3d57c52dc8537cc6f707d211a3263980374b3a98462af62143d43
source_facet: synced
recipe_derived_from_description_hash: 564c5d3446b3d57c52dc8537cc6f707d211a3263980374b3a98462af62143d43
python_derived_from_recipe_hash: 95e46d776e2507db443de0770bf27cccd2f21228bafd66e1c398ef822a25e34e
---

# Description

Drop a tight cluster of ink particles at the cursor position:

1. [[create_ink_particles]] at `(x, y)`.
2. [[set_ink_speed]] to the medium constant.
3. [[set_ink_mass]] to medium.

## Inputs

- state — current ParticleState
- x — click x-position (chamber coordinates)
- y — click y-position (chamber coordinates)

# Recipe

Let state = Call [[create_ink_particles]] with state=state, x=x, y=y.
Let state = Call [[set_ink_speed]] with state=state.
Let state = Call [[set_ink_mass]] with state=state.
Return state.

# Python

```python
def compute(context, state, x, y):
  state = create_ink_particles(state=state, x=x, y=y)
  state = set_ink_speed(state=state)
  state = set_ink_mass(state=state)
  return state
```
