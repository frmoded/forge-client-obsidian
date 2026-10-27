---
type: action
role: leaf
description: "Block 16 — action: swap headings between every colliding particle pair."
python_hash: b58f20916e1bc4fc0048e143013577a13638aa8387b311841483af12a3790319
description_hash: 3203737ee2f13cdccfc1b218dc2f9ec11708727a29acc5cfabd43c2c09c8c736
recipe_hash: fb70395728a900763b35b5de4aa84db09d892f131b18335932e1b78c36c4f1a4
recipe_derived_from_source_hash: 3203737ee2f13cdccfc1b218dc2f9ec11708727a29acc5cfabd43c2c09c8c736
python_derived_from_source_hash: 3203737ee2f13cdccfc1b218dc2f9ec11708727a29acc5cfabd43c2c09c8c736
source_facet: synced
recipe_derived_from_description_hash: 3203737ee2f13cdccfc1b218dc2f9ec11708727a29acc5cfabd43c2c09c8c736
python_derived_from_recipe_hash: fb70395728a900763b35b5de4aa84db09d892f131b18335932e1b78c36c4f1a4
---

# Description

For each (i, j) row in `pairs`, swap `headings[i]` ↔ `headings[j]`.
Speed, position, type, mass, id, tick all unchanged — so kinetic
energy is conserved exactly. If `pairs` is empty, state passes
through unchanged. Pair list typically comes from [[detect_collisions]]
(invoked inside [[interact]]).

## Inputs

- state — current ParticleState
- pairs — (M, 2) int64 array of colliding row indices

# Recipe

Let new_state = Call [[bounce_off_pairs]] with state=state, pairs=pairs.
Return new_state.

# Python

```python
def compute(context, state, pairs):
  new_state = bounce_off_pairs(state=state, pairs=pairs)
  return new_state
```
