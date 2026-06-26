---
type: action
role: leaf
description: "Block 10 — control: tell every particle to move, wall-bounce, and interact."
---

# Description

Tell every particle to do its per-tick work in order:

1. [[move]] forward one tick along its heading.
2. [[if_wall_then_bounce]] — reflect off any wall it crossed.
3. [[interact]] — collide with any particle within range.

## Inputs

- state — current ParticleState
- dt — time step in seconds

# Recipe

Let state = Call [[move]] with state=state, dt=dt.
Let state = Call [[if_wall_then_bounce]] with state=state.
Let state = Call [[interact]] with state=state.
Return state.
