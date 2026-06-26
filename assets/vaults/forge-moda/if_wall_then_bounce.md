---
type: action
role: leaf
description: "Block 13 — control: if a particle touches a wall, bounce it."
---

# Description

If the current particle is touching a wall (its position is at or
past any chamber bound): bounce it off the wall via [[bounce_off_wall]].
Particles inside the chamber pass through unchanged.

## Inputs

- state — current ParticleState

# Recipe

Let new_state = Call [[bounce_off_wall]] with state=state.
Return new_state.
