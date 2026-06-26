---
type: action
role: leaf
description: "Block 23 — action: set water particle speed to the low constant."
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
