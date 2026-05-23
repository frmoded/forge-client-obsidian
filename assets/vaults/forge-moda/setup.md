---
type: action
role: root
inputs: []
description: "Block 1 — setup event. Create the water population and set its speed + mass."
generation_notes: |
  Python signature must be:
    def compute(context, temperature="medium")
  The `temperature` parameter is runtime-injected by /moda/init
  (which passes args=("medium",) at session-start). The English
  body intentionally doesn't list it as a student input — it's a
  simulator-provided value. Default "medium" matches the
  simulator's default slider position and is used when a student
  clicks the Forge button manually.
---

# English

Establish an empty chamber: a brand-new simulation state with no particles, 800 units wide and 600 units tall, tick 0. (These are the v1 defaults; there is no scenario lookup.)
Call [[create_water_particles]].
Call [[set_water_speed]] with temperature.
Call [[set_water_mass]].

This is the initial-population event and the ORIGIN of the simulation state — it takes no incoming state. It builds the empty 800×600 chamber itself.

# Python

```python
def compute(context, temperature="medium"):
    ids = numpy.array([], dtype=numpy.int64)
    types = numpy.array([], dtype=object)
    xs = numpy.array([], dtype=numpy.float64)
    ys = numpy.array([], dtype=numpy.float64)
    headings = numpy.array([], dtype=numpy.float64)
    speeds = numpy.array([], dtype=numpy.float64)
    masses = numpy.array([], dtype=object)

    state = ParticleState(
        tick=0,
        ids=ids,
        types=types,
        xs=xs,
        ys=ys,
        headings=headings,
        speeds=speeds,
        masses=masses,
        width=800.0,
        height=600.0,
    )

    state = context.compute("create_water_particles", state=state)
    state = context.compute("set_water_speed", state=state, temperature=temperature)
    state = context.compute("set_water_mass", state=state)

    return state
```

# Dependencies

*Synced from Python. Edit the Python and regenerate, or run "Forge: Sync edges" to refresh.*

[[create_water_particles]] [[set_water_speed]] [[set_water_mass]]
