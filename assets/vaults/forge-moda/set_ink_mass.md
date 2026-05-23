---
type: action
role: leaf
inputs: []
description: "Block 8 — set every ink particle's mass to medium."
---

# English

Inputs: None

Set the mass of all ink particles to `'medium'`.

Water particles are untouched.

# Python

```python
def compute(context, state):
    is_ink = state.types == 'ink'
    masses = state.masses.copy()
    masses[is_ink] = 'medium'
    return ParticleState(
        tick=state.tick,
        ids=state.ids,
        types=state.types,
        xs=state.xs,
        ys=state.ys,
        headings=state.headings,
        speeds=state.speeds,
        masses=masses,
        width=state.width,
        height=state.height,
    )
```
