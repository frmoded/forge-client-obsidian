---
type: action
role: root
description: "Block 9 — go event. One simulation tick; history-dependent per C8 (continues from its own last state)."
---

# Description

Advance the simulation by one tick:

1. Tell every particle to move, wall-bounce, and interact via [[ask_all_particles]].
2. Update every water particle's speed for the temperature via [[ask_water_particles]].

State resolution, in order — this is what makes the simulation
accumulate instead of restarting:

1. If `state` is provided, use it.
2. Otherwise continue from the state this note last produced, via
   [[latest_state]]. That is how a second `go` picks up where the
   first left off.
3. Otherwise — the very first call, when there is nothing to continue
   from — start from the canned [[sample_state]].

## Inputs

- state (default `None`) — current ParticleState (or `None` for first call)
- dt (default `0.0333`) — time step (30 FPS default)
- temperature (default `"medium"`) — current temperature setting

# Recipe

If state == None:
  Let state = Call [[latest_state]] with context=context.

If state == None:
  Let state = Call [[sample_state]].

Let state = Call [[ask_all_particles]] with state=state, dt=dt.
Let state = Call [[ask_water_particles]] with state=state, temperature=temperature.
Return state.
