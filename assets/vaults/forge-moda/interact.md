---
type: action
role: leaf
description: "Block 12 — action: find every colliding pair this tick and resolve them."
python_hash: e57f181cc3097190f135714377aa850c43d21c6b9795cd0826c2b4356bfd8c26
description_hash: 43c5a9de6f4aded60f0ab7ba5234dcde400fa0aa4d525d2a3a61d9709faffb6c
recipe_hash: f8e06c547ab85a08773a0492391b25b314088308fa4b0ea71d32035c7f6cfc65
recipe_derived_from_source_hash: 43c5a9de6f4aded60f0ab7ba5234dcde400fa0aa4d525d2a3a61d9709faffb6c
python_derived_from_source_hash: 43c5a9de6f4aded60f0ab7ba5234dcde400fa0aa4d525d2a3a61d9709faffb6c
source_facet: synced
recipe_derived_from_description_hash: 43c5a9de6f4aded60f0ab7ba5234dcde400fa0aa4d525d2a3a61d9709faffb6c
python_derived_from_recipe_hash: f8e06c547ab85a08773a0492391b25b314088308fa4b0ea71d32035c7f6cfc65
---

# Description

For every pair of particles within collision range (5 units) AND
moving toward each other, swap their headings.

The collision check uses a shrinking-separation filter alongside the
distance test — without that filter, just-swapped pairs stay within
range, re-collide every tick, and freeze into stuck clusters
(empirically 85.7% → 3.5% recurrence with the filter).

## Inputs

- state — current ParticleState

# Recipe

Let pairs = Call [[detect_collisions]] with state=state.
Let new_state = Call [[bounce_off_pairs]] with state=state, pairs=pairs.
Return new_state.

# Python

```python
def compute(context, state):
  pairs = detect_collisions(state=state)
  new_state = bounce_off_pairs(state=state, pairs=pairs)
  return new_state
```
