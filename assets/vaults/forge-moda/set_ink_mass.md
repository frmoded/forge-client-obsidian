---
type: action
role: leaf
description: "Block 8 — set every ink particle's mass to medium."
---

# Description

Set the mass of every ink particle to `"medium"`. Water particles
are untouched.

## Inputs

- state — current ParticleState

# Recipe

Let new_state = Call [[set_mass_for_type]] with state=state, particle_type="ink", mass="medium".
Return new_state.
