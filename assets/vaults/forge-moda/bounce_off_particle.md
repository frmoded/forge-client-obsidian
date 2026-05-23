---
type: action
role: leaf
inputs: [pairs]
description: "Block 16 — action: swap headings within each colliding pair."
generation_notes: |
  `pairs` is an (M, 2) int64 array passed in from the control chain —
  parameter, never fetched via context.compute. Use vectorized fancy
  indexing: snapshot headings first (state.headings.copy()), then assign
  headings[i] = state.headings[j] and headings[j] = state.headings[i]
  so both sides read pre-swap values. Speed, position, type, mass, id,
  tick all unchanged. If pairs.shape[0] == 0 return state unchanged.
---

# English

Inputs: None

Swap headings between the current particle and the other particle.

Speed is unchanged, so kinetic energy is conserved exactly. Positions,
types, masses, ids, tick all unchanged.

# Python

```python
def compute(context, state, pairs):
    if pairs is None or len(pairs) == 0:
        return state
    headings = state.headings.copy()
    i_indices = pairs[:, 0]
    j_indices = pairs[:, 1]
    headings[i_indices] = state.headings[j_indices]
    headings[j_indices] = state.headings[i_indices]
    return ParticleState(
        tick=state.tick,
        ids=state.ids,
        types=state.types,
        xs=state.xs,
        ys=state.ys,
        headings=headings,
        speeds=state.speeds,
        masses=state.masses,
        width=state.width,
        height=state.height,
    )
```
