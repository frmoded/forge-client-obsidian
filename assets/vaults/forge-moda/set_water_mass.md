---
type: action
role: leaf
inputs: []
description: "Block 4 — set every water particle's mass to medium."
---

# English

Inputs: None

Set the mass of all water particles to `'medium'`.

Ink particles are untouched.

# Python

```python
def compute(context, state):
    is_water = state.types == 'water'
    masses = state.masses.copy()
    masses[is_water] = 'medium'
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
