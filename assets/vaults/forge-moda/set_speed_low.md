---
type: action
role: leaf
inputs: []
description: "Block 23 — action: set water particle speed to the low constant."
---

# English

Inputs: None

Set the current water particle's speed to the low speed constant, obtained via speed_for_temperature with `temperature='low'`.

Applies to water particles only. Ink untouched. Other fields unchanged.

# Python

```python
def compute(context, state):
    low = context.compute("speed_for_temperature", temperature='low')
    is_water = state.types == 'water'
    speeds = state.speeds.copy()
    speeds[is_water] = low
    return ParticleState(
        tick=state.tick, ids=state.ids, types=state.types,
        xs=state.xs, ys=state.ys, headings=state.headings,
        speeds=speeds, masses=state.masses,
        width=state.width, height=state.height)
```

# Dependencies

*Synced from Python. Edit the Python and regenerate, or run "Forge: Sync edges" to refresh.*

[[speed_for_temperature]]
