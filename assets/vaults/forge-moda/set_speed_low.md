---
type: action
role: leaf
description: "Block 23 — action: set water particle speed to the low constant."
python_hash: 3fcdb6d7f0572cd836f7b592ff09a677b24514f6998e06ca7fbd7838cd3d4eb1
description_hash: 889c17894700411f5043df9ebf6b5b9fdf560941c01e92abe96ec0ad939c09c3
recipe_hash: 313f87602822af55c24909327209a31e8dcd4e41ea53dc7662822854c436a202
recipe_derived_from_source_hash: 889c17894700411f5043df9ebf6b5b9fdf560941c01e92abe96ec0ad939c09c3
python_derived_from_source_hash: 889c17894700411f5043df9ebf6b5b9fdf560941c01e92abe96ec0ad939c09c3
source_facet: synced
recipe_derived_from_description_hash: 889c17894700411f5043df9ebf6b5b9fdf560941c01e92abe96ec0ad939c09c3
python_derived_from_recipe_hash: 313f87602822af55c24909327209a31e8dcd4e41ea53dc7662822854c436a202
---

# Description

Set the speed of every water particle to the low speed constant
(via [[speed_for_temperature]] with `temperature="low"`). Other
particle types untouched.

## Inputs

- state — current ParticleState

# Recipe

Let low = Call [[speed_for_temperature]] with temperature="low".
Let new_state = Call [[set_speed_for_type]] with state=state, particle_type="water", speed=low.
Return new_state.

# Python

```python
def compute(context, state):
  low = speed_for_temperature(temperature='low')
  new_state = set_speed_for_type(state=state, particle_type='water', speed=low)
  return new_state
```
