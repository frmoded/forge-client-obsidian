---
type: action
role: leaf
description: "Block 24 — control: if temperature is zero, set water speed zero."
python_hash: 4bc9a7cf643ad26b2b3577c7106b4a301050436ff23a9e8e5191d8da16e5b370
description_hash: fd8fee28c05da2a3fba2c12bfcc3e22f4902ef5786762c3452fe213e951da923
recipe_hash: ce5a6409b69c7881979e9575aaff618d5c7a4a3c1bdcab7a2be773e2de4e2715
recipe_derived_from_source_hash: fd8fee28c05da2a3fba2c12bfcc3e22f4902ef5786762c3452fe213e951da923
python_derived_from_source_hash: fd8fee28c05da2a3fba2c12bfcc3e22f4902ef5786762c3452fe213e951da923
source_facet: synced
recipe_derived_from_description_hash: fd8fee28c05da2a3fba2c12bfcc3e22f4902ef5786762c3452fe213e951da923
python_derived_from_recipe_hash: ce5a6409b69c7881979e9575aaff618d5c7a4a3c1bdcab7a2be773e2de4e2715
---

# Description

If `temperature == "zero"`, call [[set_speed_zero]] to set every
water particle's speed to the zero constant. Otherwise pass state
through unchanged.

## Inputs

- state — current ParticleState
- temperature — one of `"zero"` | `"low"` | `"medium"` | `"high"`

# Recipe

If temperature == "zero":
  Let new_state = Call [[set_speed_zero]] with state=state.
  Return new_state.
Return state.

# Python

```python
def compute(context, state, temperature):
  if (temperature == 'zero'):
    new_state = set_speed_zero(state=state)
    return new_state
  return state
```
