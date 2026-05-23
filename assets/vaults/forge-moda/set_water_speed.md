---
type: action
role: leaf
inputs: [temperature]
description: "Block 3 — set every water particle's speed from the temperature."
---

# English

Inputs: temperature

Set the speed of all water particles to `speed_for_temperature(temperature)` via speed_for_temperature.

Ink particles are untouched.

# Python

```python
def compute(context, state, temperature):
    speed = context.compute("speed_for_temperature", temperature=temperature)
    is_water = state.types == 'water'
    speeds = state.speeds.copy()
    speeds[is_water] = speed
    return ParticleState(
        tick=state.tick,
        ids=state.ids,
        types=state.types,
        xs=state.xs,
        ys=state.ys,
        headings=state.headings,
        speeds=speeds,
        masses=state.masses,
        width=state.width,
        height=state.height,
    )
```

# Dependencies

*Synced from Python. Edit the Python and regenerate, or run "Forge: Sync edges" to refresh.*

[[speed_for_temperature]]
