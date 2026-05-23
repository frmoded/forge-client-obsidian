---
type: action
role: leaf
inputs: [dt]
description: "Block 11 — action: advance each particle by speed × dt along its heading."
---

# English

Inputs: dt

Advance the current particle's position by `speed × dt` in the direction of its heading: `x += speed·cos(heading)·dt`, `y += speed·sin(heading)·dt`.

Applies to every particle. Heading, speed, type, mass unchanged. This is the block that advances the tick counter by 1.

# Python

```python
def compute(context, state, dt):
    new_xs = state.xs + state.speeds * numpy.cos(state.headings) * dt
    new_ys = state.ys + state.speeds * numpy.sin(state.headings) * dt
    return ParticleState(
        tick=state.tick + 1,
        ids=state.ids,
        types=state.types,
        xs=new_xs,
        ys=new_ys,
        headings=state.headings,
        speeds=state.speeds,
        masses=state.masses,
        width=state.width,
        height=state.height,
    )
```
