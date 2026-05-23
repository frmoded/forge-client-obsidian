---
type: action
role: leaf
inputs: []
description: "Block 2 — create 500 water particles at random positions with random headings."
---

# English

Inputs: None

Create 500 water particles at random positions uniformly within the chamber bounds (`0..width`, `0..height`).
Each particle gets a random heading uniformly in `[0, 2π)`.

Water particles are appended to the simulation state. Ids continue sequentially from the current maximum id (start at 0 if the state is empty). Speed and mass are set by later blocks (set_water_speed, set_water_mass); leave them at 0.0 / 'medium' placeholders here.

# Python

```python
def compute(context, state):
    count = 500
    width = state.width
    height = state.height

    if len(state.ids) == 0:
        max_id = -1
    else:
        max_id = int(state.ids.max())

    new_ids = numpy.arange(max_id + 1, max_id + 1 + count)
    new_types = numpy.full(count, 'water', dtype=object)
    new_xs = numpy.random.uniform(0, width, count)
    new_ys = numpy.random.uniform(0, height, count)
    new_headings = numpy.random.uniform(0, 2 * math.pi, count)
    new_speeds = numpy.zeros(count, dtype=numpy.float64)
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
        width=width,
        height=height,
    )
```
