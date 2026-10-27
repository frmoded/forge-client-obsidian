---
type: action
role: leaf
description: "Block 25 — action: set water particle speed to zero."
python_hash: 852270d2d059b6e6515206dd4224ab55d1577703766ac7d9a282211a71413b2e
description_hash: 5118a0bc01a9735fb459f44ada2d8582158ae789faa7aa12fea4a11199518bf7
recipe_hash: b7b70394908f6cc007d6f24e5a8d497a6675d87dad32535ab600447bc39e7797
recipe_derived_from_source_hash: 5118a0bc01a9735fb459f44ada2d8582158ae789faa7aa12fea4a11199518bf7
python_derived_from_source_hash: 5118a0bc01a9735fb459f44ada2d8582158ae789faa7aa12fea4a11199518bf7
source_facet: synced
recipe_derived_from_description_hash: 5118a0bc01a9735fb459f44ada2d8582158ae789faa7aa12fea4a11199518bf7
python_derived_from_recipe_hash: b7b70394908f6cc007d6f24e5a8d497a6675d87dad32535ab600447bc39e7797
---

# Description

Set the speed of every water particle to the zero speed constant
(via [[speed_for_temperature]] with `temperature="zero"`). Other
particle types untouched.

## Inputs

- state — current ParticleState

# Recipe

Let zero_speed = Call [[speed_for_temperature]] with temperature="zero".
Let new_state = Call [[set_speed_for_type]] with state=state, particle_type="water", speed=zero_speed.
Return new_state.

# Python

```python
def compute(context, state):
  zero_speed = speed_for_temperature(temperature='zero')
  new_state = set_speed_for_type(state=state, particle_type='water', speed=zero_speed)
  return new_state
```
