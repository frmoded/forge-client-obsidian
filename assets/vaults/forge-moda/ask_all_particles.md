---
type: action
role: leaf
inputs: [dt]
description: "Block 10 — control: tell every particle to move, wall-bounce, and interact."
---

# English

Inputs: dt

For each particle in state:
  Call [[move]] with dt.
  Call [[if_wall_then_bounce]].
  Call [[interact]].

# Python

```python
def compute(context, state, dt):
    state = context.compute("move", state=state, dt=dt)
    state = context.compute("if_wall_then_bounce", state=state)
    state = context.compute("interact", state=state)
    return state
```

# Dependencies

*Synced from Python. Edit the Python and regenerate, or run "Forge: Sync edges" to refresh.*

[[move]] [[if_wall_then_bounce]] [[interact]]
