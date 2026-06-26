---
type: action
role: leaf
description: "Block 7 — set every ink particle's speed to the medium constant."
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
