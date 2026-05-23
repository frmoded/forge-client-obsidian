---
type: action
role: root
inputs: [x, y]
description: "Block 5 — mouse-click event. Create ink at the cursor and set its speed + mass."
---

# English

Inputs: x, y

Call [[create_ink_particles]] with x and y.
Call [[set_ink_speed]].
Call [[set_ink_mass]].

# Python

```python
def compute(context, state, x, y):
    state = context.compute("create_ink_particles", state=state, x=x, y=y)
    state = context.compute("set_ink_speed", state=state)
    state = context.compute("set_ink_mass", state=state)
    return state
```

# Dependencies

*Synced from Python. Edit the Python and regenerate, or run "Forge: Sync edges" to refresh.*

[[create_ink_particles]] [[set_ink_speed]] [[set_ink_mass]]
