---
type: action
role: leaf
inputs: []
description: "Block 21 — action: set water particle speed to the medium constant."
---

# English

Inputs: None

Set the current water particle's speed to the medium speed constant, obtained via speed_for_temperature with `temperature='medium'`.

Applies to water particles only. Ink untouched. Other fields unchanged.

# Python

```python
def compute(context, state):
    medium = context.compute("speed_for_temperature", temperature='medium')
    is_water = state.types == 'water'
    speeds = state.speeds.copy()
    speeds[is_water] = medium
    return ParticleState(
        tick=state.tick, ids=state.ids, types=state.types,
        xs=state.xs, ys=state.ys, headings=state.headings,
        speeds=speeds, masses=state.masses,
        width=state.width, height=state.height)
```

# Dependencies

*Synced from Python. Edit the Python and regenerate, or run "Forge: Sync edges" to refresh.*

[[speed_for_temperature]]
