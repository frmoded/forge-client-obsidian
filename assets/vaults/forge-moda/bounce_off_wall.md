---
type: action
role: leaf
description: "Block 14 — action: reflect every wall-touching particle's heading back inside."
---

# Description

Reflect every particle that has crossed a chamber bound back inside.
Vertical walls (`x < 0` or `x > width`) flip heading via `π − heading`;
horizontal walls (`y < 0` or `y > height`) flip via `−heading`; the
resulting heading is normalized modulo `2π`. Position is clamped back
inside the bounds. Particles inside the chamber are unchanged.

## Inputs

- state — current ParticleState

# Recipe

Let new_state = Call [[bounce_off_walls]] with state=state.
Return new_state.
