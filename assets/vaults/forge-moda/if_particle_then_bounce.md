---
type: action
role: leaf
inputs: [pairs]
description: "Block 15 — control: for colliding pairs, bounce them off each other."
generation_notes: |
  Pure dispatch. `pairs` is an (M, 2) int64 array already computed by
  interact — treat as black-box input, never recompute the collision
  predicate, never fetch it via context.compute. If pairs.shape[0] == 0
  return state unchanged; otherwise return
  context.compute("bounce_off_particle", state=state, pairs=pairs).
---

# English

Inputs: None

If the current particle is colliding with the other particle:
  Call [[bounce_off_particle]].

# Python

```python
def compute(context, state, pairs):
    if pairs.shape[0] == 0:
        return state
    return context.compute("bounce_off_particle", state=state, pairs=pairs)
```

# Dependencies

*Synced from Python. Edit the Python and regenerate, or run "Forge: Sync edges" to refresh.*

[[bounce_off_particle]]
