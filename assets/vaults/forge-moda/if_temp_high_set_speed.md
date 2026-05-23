---
type: action
role: leaf
inputs: [temperature]
description: "Block 18 — control: if temperature is high, set water speed high."
---

# English

Inputs: temperature

If `temperature == "high"`:
  Call [[set_speed_high]].

# Python

```python
def compute(context, state, temperature):
    if temperature == "high":
        return context.compute("set_speed_high", state=state)
    return state
```

# Dependencies

*Synced from Python. Edit the Python and regenerate, or run "Forge: Sync edges" to refresh.*

[[set_speed_high]]
