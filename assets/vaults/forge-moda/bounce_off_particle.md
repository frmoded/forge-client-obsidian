---
type: action
role: leaf
description: "Block 16 — action: swap headings between every colliding particle pair."
---

# Description

For each (i, j) row in `pairs`, swap `headings[i]` ↔ `headings[j]`.
Speed, position, type, mass, id, tick all unchanged — so kinetic
energy is conserved exactly. If `pairs` is empty, state passes
through unchanged. Pair list typically comes from [[detect_collisions]]
(invoked inside [[interact]]).

## Inputs

- state — current ParticleState
- pairs — (M, 2) int64 array of colliding row indices

# Recipe

Let new_state = Call [[bounce_off_pairs]] with state=state, pairs=pairs.
Return new_state.
