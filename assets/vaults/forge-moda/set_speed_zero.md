---
type: action
role: leaf
description: "Block 25 — action: set water particle speed to zero."
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
