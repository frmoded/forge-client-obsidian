---
type: action
role: leaf
inputs: [x, y]
description: "Block 6 — create 50 ink particles at the click position with random headings."
---

# English

Inputs: x, y

Create 50 ink particles near position `(x, y)`. Each particle gets a small position jitter (within ±3 units of the click) and its own random heading uniform in `[0, 2π)`, so the drop disperses radially from the click point. Each gets a small random initial speed in `[0, 10)`.

Ink particles are appended to the simulation state; ids continue sequentially from the current maximum id. Mass is set by [[set_ink_mass]]; leave it at a 'medium' placeholder here.

# Python

```python
def compute(context, state, x, y):
    count = 50
    max_id = state.ids.max() if len(state.ids) > 0 else -1
    new_ids = numpy.arange(max_id + 1, max_id + 1 + count)
    new_types = numpy.full(count, 'ink', dtype=object)
    new_xs = float(x) + numpy.random.uniform(-3.0, 3.0, count)
    new_ys = float(y) + numpy.random.uniform(-3.0, 3.0, count)
    new_headings = numpy.random.uniform(0, 2 * math.pi, count)
    new_speeds = numpy.random.uniform(0, 10, count)
    new_masses = numpy.full(count, 'medium', dtype=object)

    ids = numpy.concatenate([state.ids, new_ids])
    types = numpy.concatenate([state.types, new_types])
    xs = numpy.concatenate([state.xs, new_xs])
    ys = numpy.concatenate([state.ys, new_ys])
    headings = numpy.concatenate([state.headings, new_headings])
    speeds = numpy.concatenate([state.speeds, new_speeds])
    masses = numpy.concatenate([state.masses, new_masses])

    return ParticleState(
        tick=state.tick,
        ids=ids,
        types=types,
        xs=xs,
        ys=ys,
        headings=headings,
        speeds=speeds,
        masses=masses,
        width=state.width,
        height=state.height,
    )
```
