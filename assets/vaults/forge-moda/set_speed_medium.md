---
type: action
role: leaf
description: "Block 21 — action: set water particle speed to the medium constant."
python_hash: d1dc69ddb4d39538832c2110a4a084c1d77acf207d96b5594fe56e9d588ffd32
description_hash: 23fecc3d626a5512da109ef92dc9c5a87e7f436ce8ed59a4b0001608d6fe0a39
recipe_hash: 955b73a11e2c7ba3c8856f6e09137c30c5e4bf0460fbd3fde23aa622d695f6d5
recipe_derived_from_source_hash: 23fecc3d626a5512da109ef92dc9c5a87e7f436ce8ed59a4b0001608d6fe0a39
python_derived_from_source_hash: 23fecc3d626a5512da109ef92dc9c5a87e7f436ce8ed59a4b0001608d6fe0a39
source_facet: synced
recipe_derived_from_description_hash: 23fecc3d626a5512da109ef92dc9c5a87e7f436ce8ed59a4b0001608d6fe0a39
python_derived_from_recipe_hash: 955b73a11e2c7ba3c8856f6e09137c30c5e4bf0460fbd3fde23aa622d695f6d5
---

# Description

Set the speed of every water particle to the medium speed constant
(via [[speed_for_temperature]] with `temperature="medium"`). Other
particle types untouched.

## Inputs

- state — current ParticleState

# Recipe

Let medium = Call [[speed_for_temperature]] with temperature="medium".
Let new_state = Call [[set_speed_for_type]] with state=state, particle_type="water", speed=medium.
Return new_state.

# Python

```python
def compute(context, state):
  medium = speed_for_temperature(temperature='medium')
  new_state = set_speed_for_type(state=state, particle_type='water', speed=medium)
  return new_state
```
