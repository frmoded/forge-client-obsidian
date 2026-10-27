---
type: action
role: leaf
description: "Block 15 — control: for colliding pairs, bounce them off each other."
python_hash: 22411c661903f87dcbe8a7fbefdd57149f82ab83ad39febb0d41ae5aebea9d72
description_hash: ccead7046f1364a774fafa2d38f2927065047117af36515408bbbd9f9168eea4
recipe_hash: 014032f399ca8a616820d2d9c80d7a797bf5c06c3bc81c40967c0e052a0529cd
recipe_derived_from_source_hash: ccead7046f1364a774fafa2d38f2927065047117af36515408bbbd9f9168eea4
python_derived_from_source_hash: ccead7046f1364a774fafa2d38f2927065047117af36515408bbbd9f9168eea4
source_facet: synced
recipe_derived_from_description_hash: ccead7046f1364a774fafa2d38f2927065047117af36515408bbbd9f9168eea4
python_derived_from_recipe_hash: 014032f399ca8a616820d2d9c80d7a797bf5c06c3bc81c40967c0e052a0529cd
---

# Description

For each colliding pair (i, j) in `pairs`: swap their headings via
[[bounce_off_particle]]. If `pairs` is empty, state passes through
unchanged. The pair list comes from [[interact]]'s
[[detect_collisions]] step — never recompute it here.

## Inputs

- state — current ParticleState
- pairs — (M, 2) int64 array of colliding row indices (from [[interact]])

# Recipe

Let new_state = Call [[bounce_off_particle]] with state=state, pairs=pairs.
Return new_state.

# Python

```python
def compute(context, state, pairs):
  new_state = bounce_off_particle(state=state, pairs=pairs)
  return new_state
```
