---
type: action
role: leaf
inputs: [x, y]
description: "Block 6 — create 50 ink particles at the click position as a tight cluster."
---

# English

Inputs: x, y

Create 50 ink particles in a tight cluster around position `(x, y)`. Each particle gets a random offset uniformly distributed within a small radius (5 units) of the click point, and zero initial speed — physics (temperature) decides where the cluster goes from there.

v0.2.102 — was a radial scatter (square jitter + non-zero random initial speed + random heading) which read as an "explosion" outward from the click. Cluster-at-click reads as deliberate ink injection.

Ink particles are appended to the simulation state; ids continue sequentially from the current maximum id. Heading is still randomized (cosmetic — only matters once the particle starts moving). Mass is set by [[set_ink_mass]]; leave it at a 'medium' placeholder here.

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
