---
type: action
role: leaf
description: "Block 6 — create 50 ink particles at the click position as a tight cluster."
---

# Description

Create 50 ink particles in a tight cluster at position `(x, y)`.
Each particle gets a random offset uniformly distributed within a
small radius (5 units) of the click, and zero initial speed.

Ink particles are appended to the simulation state; ids continue
sequentially from the current maximum id. Heading is randomized.
Mass is set by [[set_ink_mass]]; it starts at a 'medium' placeholder.

## Inputs

- state — current ParticleState
- x — click x-position (chamber coordinates)
- y — click y-position (chamber coordinates)

# Recipe

Let new_state = Call [[create_ink_particles]] with state=state, x=x, y=y.
Return new_state.
