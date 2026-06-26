---
type: action
role: leaf
description: "Block 15 — control: for colliding pairs, bounce them off each other."
---

# Description

For each colliding pair (i, j) in `pairs`: swap their headings via
[[bounce_off_particle]]. If `pairs` is empty, state passes through
unchanged. The pair list comes from [[interact]]'s
[[detect_collisions]] step — never recompute it here.

## Inputs

- state — current ParticleState
- pairs — (M, 2) int64 array of colliding row indices (from [[interact]])

# Recipe

Let new_state = Call [[bounce_off_particle]] with state=state, pairs=pairs.
Return new_state.
