---
type: action
role: leaf
inputs: [temperature]
description: "Block 22 — control: if temperature is low, set water speed low."
---

# English

Inputs: temperature

If `temperature == "low"`:
  Call [[set_speed_low]].

# Python

```python
def compute(context, state, temperature):
    if temperature == "low":
        return context.compute("set_speed_low", state=state)
    return state
```

# Dependencies

*Synced from Python. Edit the Python and regenerate, or run "Forge: Sync edges" to refresh.*

[[set_speed_low]]
