---
type: action
role: leaf
inputs: [temperature]
description: "Block 24 — control: if temperature is zero, set water speed zero."
---

# English

Inputs: temperature

If `temperature == "zero"`:
  Call [[set_speed_zero]].

# Python

```python
def compute(context, state, temperature):
    if temperature == "zero":
        return context.compute("set_speed_zero", state=state)
    return state
```

# Dependencies

*Synced from Python. Edit the Python and regenerate, or run "Forge: Sync edges" to refresh.*

[[set_speed_zero]]
