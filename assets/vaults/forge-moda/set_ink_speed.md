---
type: action
role: leaf
description: "Block 7 — set every ink particle's speed to the medium constant."
python_hash: ade8cf60d5410a336bf7e2d90221e591964cf684260ef050ca2347abdacb6304
description_hash: 9416c116d5422a3daabf5da892257211f6d7f7f01d48dcbb2d5719469012a4d4
recipe_hash: 6046bf9ce8f6105ad75a5fc0b4f7bfc5287d13216a127c7ca381ed2f408d841b
recipe_derived_from_source_hash: 9416c116d5422a3daabf5da892257211f6d7f7f01d48dcbb2d5719469012a4d4
python_derived_from_source_hash: 9416c116d5422a3daabf5da892257211f6d7f7f01d48dcbb2d5719469012a4d4
source_facet: synced
recipe_derived_from_description_hash: 9416c116d5422a3daabf5da892257211f6d7f7f01d48dcbb2d5719469012a4d4
python_derived_from_recipe_hash: 6046bf9ce8f6105ad75a5fc0b4f7bfc5287d13216a127c7ca381ed2f408d841b
---

# Description

Set the speed of every ink particle to the medium speed constant
(via [[speed_for_temperature]] with `temperature="medium"`). Water
particles are untouched.

## Inputs

- state — current ParticleState

# Recipe

Let medium = Call [[speed_for_temperature]] with temperature="medium".
Let new_state = Call [[set_speed_for_type]] with state=state, particle_type="ink", speed=medium.
Return new_state.

# Python

```python
def compute(context, state):
  medium = speed_for_temperature(temperature='medium')
  new_state = set_speed_for_type(state=state, particle_type='ink', speed=medium)
  return new_state
```
