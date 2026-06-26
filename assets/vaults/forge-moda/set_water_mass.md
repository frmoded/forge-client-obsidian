---
type: action
role: leaf
description: "Block 4 — set every water particle's mass to medium."
---

# Description

Set the mass of every water particle to `"medium"`. Ink particles
are untouched.

## Inputs

- state — current ParticleState

# Recipe

Let new_state = Call [[set_mass_for_type]] with state=state, particle_type="water", mass="medium".
Return new_state.
