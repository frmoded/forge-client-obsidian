---
type: action
role: leaf
description: "Block 21 — action: set water particle speed to the medium constant."
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
