---
type: action
role: leaf
description: "Block 19 — action: set water particle speed to the high constant."
python_hash: 1cd5f02c4086c07b5c9d767ece73b22dc17b75fb4956de3df80bf556712d48d0
description_hash: eba7d0b33545c4c0b62fd9c16dd3e58c421ba466471bb459c9fdcf8f385b7c7e
recipe_hash: b9d3d2d824ef2afa5fa1b6c71ec9a6dfe01a4f905d409cbcda7a5d798ef91565
recipe_derived_from_source_hash: eba7d0b33545c4c0b62fd9c16dd3e58c421ba466471bb459c9fdcf8f385b7c7e
python_derived_from_source_hash: eba7d0b33545c4c0b62fd9c16dd3e58c421ba466471bb459c9fdcf8f385b7c7e
source_facet: synced
recipe_derived_from_description_hash: eba7d0b33545c4c0b62fd9c16dd3e58c421ba466471bb459c9fdcf8f385b7c7e
python_derived_from_recipe_hash: b9d3d2d824ef2afa5fa1b6c71ec9a6dfe01a4f905d409cbcda7a5d798ef91565
---

# Description

Set the speed of every water particle to the high speed constant
(via [[speed_for_temperature]] with `temperature="high"`). Other
particle types untouched.

## Inputs

- state — current ParticleState

# Recipe

Let high = Call [[speed_for_temperature]] with temperature="high".
Let new_state = Call [[set_speed_for_type]] with state=state, particle_type="water", speed=high.
Return new_state.

# Python

```python
def compute(context, state):
  high = speed_for_temperature(temperature='high')
  new_state = set_speed_for_type(state=state, particle_type='water', speed=high)
  return new_state
```
