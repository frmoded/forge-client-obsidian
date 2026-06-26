---
type: action
role: root
description: "Block 9 — go event. One simulation tick."
---

# Description

Advance the simulation by one tick:

1. Tell every particle to move, wall-bounce, and interact via [[ask_all_particles]].
2. Update every water particle's speed for the temperature via [[ask_water_particles]].

State resolution: if `state` is not provided, fall back to the
canned [[sample_state]] starting state.

## Inputs

- state (default `None`) — current ParticleState (or `None` for first call)
- dt (default `0.0333`) — time step (30 FPS default)
- temperature (default `"medium"`) — current temperature setting

# Recipe

If state == None:
  Let state = Call [[sample_state]].

Let state = Call [[ask_all_particles]] with state=state, dt=dt.
Let state = Call [[ask_water_particles]] with state=state, temperature=temperature.
Return state.
