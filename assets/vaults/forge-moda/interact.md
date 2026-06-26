---
type: action
role: leaf
description: "Block 12 — action: find every colliding pair this tick and resolve them."
---

# Description

For every pair of particles within collision range (5 units) AND
moving toward each other, swap their headings.

The collision check uses a shrinking-separation filter alongside the
distance test — without that filter, just-swapped pairs stay within
range, re-collide every tick, and freeze into stuck clusters
(empirically 85.7% → 3.5% recurrence with the filter).

## Inputs

- state — current ParticleState

# Recipe

Let pairs = Call [[detect_collisions]] with state=state.
Let new_state = Call [[bounce_off_pairs]] with state=state, pairs=pairs.
Return new_state.
