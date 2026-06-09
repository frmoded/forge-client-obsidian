---
type: action
role: leaf
inputs: [x, y]
description: "Block 6 — create 50 ink particles at the click position as a tight cluster."
---

# English

Inputs: x, y

Create 50 ink particles in a tight cluster at position `(x, y)`. Each particle gets a random offset uniformly distributed within a small radius (5 units) of the click, and zero initial speed.

Ink particles are appended to the simulation state; ids continue sequentially from the current maximum id. Heading is randomized. Mass is set by [[set_ink_mass]]; leave it at a 'medium' placeholder here.

# Python

```python
def compute(context, state, x, y):
    count = 50
    radius = 5.0
    max_id = state.ids.max() if len(state.ids) > 0 else -1
    new_ids = numpy.arange(max_id + 1, max_id + 1 + count)
    new_types = numpy.full(count, 'ink', dtype=object)
    # Uniform-in-disk: r = sqrt(u) * R gives uniform area density.
    r = numpy.sqrt(numpy.random.uniform(0, 1, count)) * radius
    theta = numpy.random.uniform(0, 2 * math.pi, count)
    new_xs = float(x) + r * numpy.cos(theta)
    new_ys = float(y) + r * numpy.sin(theta)
    new_headings = numpy.random.uniform(0, 2 * math.pi, count)
    new_speeds = numpy.zeros(count)  # cluster, not explosion
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
