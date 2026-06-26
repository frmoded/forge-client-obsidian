---
type: action
role: leaf
description: "Block 19 — action: set water particle speed to the high constant."
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
