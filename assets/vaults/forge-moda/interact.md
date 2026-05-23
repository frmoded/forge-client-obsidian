---
type: action
role: leaf
inputs: []
description: "Block 12 — action: find every colliding pair this tick and resolve them."
generation_notes: |
  Compute the colliding-pair array ONCE for the whole state and thread
  it via context.compute("if_particle_then_bounce", state=state, pairs=pairs).
  Two particles collide when they are within 5 units AND their separation
  is shrinking: (pos_j - pos_i) · (vel_j - vel_i) < 0. Use
  numpy.triu_indices(N, k=1) for the candidate index pairs, then mask by
  the distance + approach-direction predicates. The resulting `pairs` is
  an (M, 2) int64 array of (i, j) row indices into the state arrays.
  Downstream blocks treat `pairs` as a black-box input — do not
  recompute the predicate, do not re-derive shapes.
---

# English

Inputs: None

For each other particle in state:
  Call [[if_particle_then_bounce]].

The collision check uses a shrinking-separation filter alongside the
distance test — without that filter, just-swapped pairs stay within
range, re-collide every tick, and freeze into stuck clusters (empirically
85.7% → 3.5% recurrence with the filter).

# Python

```python
def compute(context, state):
    import copy

    N = len(state.xs)
    if N < 2:
        return state

    vx = state.speeds * numpy.cos(state.headings)
    vy = state.speeds * numpy.sin(state.headings)

    ii, jj = numpy.triu_indices(N, k=1)

    dx = state.xs[jj] - state.xs[ii]
    dy = state.ys[jj] - state.ys[ii]
    dist_sq = dx * dx + dy * dy

    dvx = vx[jj] - vx[ii]
    dvy = vy[jj] - vy[ii]
    approach = dx * dvx + dy * dvy

    collision_mask = (dist_sq <= 25.0) & (approach < 0.0)

    pairs = numpy.column_stack((ii[collision_mask], jj[collision_mask]))

    if pairs.shape[0] == 0:
        return state

    state = context.compute("if_particle_then_bounce", state=state, pairs=pairs)
    return state
```

# Dependencies

*Synced from Python. Edit the Python and regenerate, or run "Forge: Sync edges" to refresh.*

[[if_particle_then_bounce]]
