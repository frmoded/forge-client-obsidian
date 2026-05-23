---
type: action
role: leaf
inputs: []
description: "Block 25 — action: set water particle speed to zero."
---

# English

Inputs: None

Set the current water particle's speed to the zero speed constant, obtained via speed_for_temperature with `temperature='zero'`.

Applies to water particles only. Ink untouched. Other fields unchanged.

# Python

```python
def compute(context, state):
    zero_speed = context.compute("speed_for_temperature", temperature='zero')
    is_water = state.types == 'water'
    speeds = state.speeds.copy()
    speeds[is_water] = zero_speed
    return ParticleState(
        tick=state.tick, ids=state.ids, types=state.types,
        xs=state.xs, ys=state.ys, headings=state.headings,
        speeds=speeds, masses=state.masses,
        width=state.width, height=state.height)
```

# Dependencies

*Synced from Python. Edit the Python and regenerate, or run "Forge: Sync edges" to refresh.*

[[speed_for_temperature]]
