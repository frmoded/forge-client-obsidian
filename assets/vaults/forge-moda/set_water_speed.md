---
type: action
role: leaf
description: "Block 3 — set every water particle's speed from the temperature."
python_hash: e0f142e2ced03707cfb89fee8c9b9dd39711af08355b37a7c1de4ca95fb19fa8
description_hash: 386ac95bda256746be89a0021b0a5f9171e927ad4e687855a1403309858bb379
recipe_hash: 6fa32a96bcf285c56270638cc1646e9b9ebeac174eb54991ba3a38ea0df4cfde
recipe_derived_from_source_hash: 386ac95bda256746be89a0021b0a5f9171e927ad4e687855a1403309858bb379
python_derived_from_source_hash: 386ac95bda256746be89a0021b0a5f9171e927ad4e687855a1403309858bb379
source_facet: synced
recipe_derived_from_description_hash: 386ac95bda256746be89a0021b0a5f9171e927ad4e687855a1403309858bb379
python_derived_from_recipe_hash: 6fa32a96bcf285c56270638cc1646e9b9ebeac174eb54991ba3a38ea0df4cfde
---

# Description

Set the speed of every water particle to the value returned by
[[speed_for_temperature]] for the given `temperature`. Ink
particles are untouched.

## Inputs

- state — current ParticleState
- temperature — one of `"zero"` | `"low"` | `"medium"` | `"high"`

# Recipe

Let speed = Call [[speed_for_temperature]] with temperature=temperature.
Let new_state = Call [[set_speed_for_type]] with state=state, particle_type="water", speed=speed.
Return new_state.

# Python

```python
def compute(context, state, temperature):
  speed = speed_for_temperature(temperature=temperature)
  new_state = set_speed_for_type(state=state, particle_type='water', speed=speed)
  return new_state
```
