---
type: action
role: leaf
description: "Block 10 — control: tell every particle to move, wall-bounce, and interact."
python_hash: 89d6a2a98fbccb4fe5b82f7e669c9ae80023428fda16c83f665f3609ea8e8ed7
description_hash: 4b773bad47937ad40eb2e0c225bab46f87ce7d521aa10d4ac6c1151111208320
recipe_hash: 1a711c56943e1277de0825a7bced70eec5eaed056de00061c99d74d2eb5da0f2
recipe_derived_from_source_hash: 4b773bad47937ad40eb2e0c225bab46f87ce7d521aa10d4ac6c1151111208320
python_derived_from_source_hash: 4b773bad47937ad40eb2e0c225bab46f87ce7d521aa10d4ac6c1151111208320
source_facet: synced
recipe_derived_from_description_hash: 4b773bad47937ad40eb2e0c225bab46f87ce7d521aa10d4ac6c1151111208320
python_derived_from_recipe_hash: 1a711c56943e1277de0825a7bced70eec5eaed056de00061c99d74d2eb5da0f2
---

# Description

Tell every particle to do its per-tick work in order:

1. [[move]] forward one tick along its heading.
2. [[if_wall_then_bounce]] — reflect off any wall it crossed.
3. [[interact]] — collide with any particle within range.

## Inputs

- state — current ParticleState
- dt — time step in seconds

# Recipe

Let state = Call [[move]] with state=state, dt=dt.
Let state = Call [[if_wall_then_bounce]] with state=state.
Let state = Call [[interact]] with state=state.
Return state.

# Python

```python
def compute(context, state, dt):
  state = move(state=state, dt=dt)
  state = if_wall_then_bounce(state=state)
  state = interact(state=state)
  return state
```
