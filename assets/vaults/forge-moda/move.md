---
type: action
role: leaf
description: "Block 11 — action: advance every particle's position one tick along its heading."
---

# Description

Move every particle one tick forward along its current heading.
Position `(x, y)` updates by `speed * cos(heading) * dt` and
`speed * sin(heading) * dt`. Other fields unchanged. Bumps tick by 1.

## Inputs

- state — current ParticleState
- dt — time step in seconds (e.g. `1/30` for 30 FPS)

# Recipe

Let new_state = Call [[advance_positions]] with state=state, dt=dt.
Return new_state.
