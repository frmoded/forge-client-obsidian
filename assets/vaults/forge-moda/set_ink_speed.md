---
type: action
role: leaf
inputs: []
description: "Block 7 — set every ink particle's speed to the medium constant."
---

# English

Inputs: None

Set the speed of all ink particles to the medium speed constant, obtained via speed_for_temperature with `temperature='medium'`.

Water particles are untouched.

# Python

```python
def compute(context, state):
    medium = context.compute("speed_for_temperature", temperature='medium')
    is_ink = state.types == 'ink'
    speeds = state.speeds.copy()
    speeds[is_ink] = medium
    return ParticleState(
        tick=state.tick, ids=state.ids, types=state.types,
        xs=state.xs, ys=state.ys, headings=state.headings,
        speeds=speeds, masses=state.masses,
        width=state.width, height=state.height)
```

# Dependencies

*Synced from Python. Edit the Python and regenerate, or run "Forge: Sync edges" to refresh.*

[[speed_for_temperature]]
