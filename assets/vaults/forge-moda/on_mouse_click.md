---
type: action
role: root
description: "Block 5 — mouse-click event. Create ink at the cursor and set its speed + mass."
---

# Description

Drop a tight cluster of ink particles at the cursor position:

1. [[create_ink_particles]] at `(x, y)`.
2. [[set_ink_speed]] to the medium constant.
3. [[set_ink_mass]] to medium.

## Inputs

- state — current ParticleState
- x — click x-position (chamber coordinates)
- y — click y-position (chamber coordinates)

# Recipe

Let state = Call [[create_ink_particles]] with state=state, x=x, y=y.
Let state = Call [[set_ink_speed]] with state=state.
Let state = Call [[set_ink_mass]] with state=state.
Return state.
