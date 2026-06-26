---
type: action
role: leaf
description: "Block 2 — create 500 water particles at random positions with random headings."
---

# Description

Create 500 water particles at random positions uniformly within the
chamber bounds (`0..width`, `0..height`). Each particle gets a
random heading uniformly in `[0, 2π)`.

Water particles are appended to the simulation state. Ids continue
sequentially from the current maximum id (start at 0 if the state is
empty). Speed and mass are set by later blocks ([[set_water_speed]],
[[set_water_mass]]); they start at 0.0 / 'medium' placeholders.

## Inputs

- state — current ParticleState (empty chamber on first call)

# Recipe

Let new_state = Call [[create_water_particles]] with state=state.
Return new_state.
