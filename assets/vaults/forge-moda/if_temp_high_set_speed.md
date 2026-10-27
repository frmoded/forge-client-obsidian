---
type: action
role: leaf
description: "Block 18 — control: if temperature is high, set water speed high."
python_hash: c7622a473b39ee45969544ceaf0cd73905f4867692f1b6d95a5ff2161469faaf
description_hash: 13aece61203d17b9b0815cf02629debdf02b86c90b73f402b70b2ed8c2123997
recipe_hash: ad8a19a8120356d7a7f09d5f8ac83395ced0e2708db86f6045cc1115e1cbc1d2
recipe_derived_from_source_hash: 13aece61203d17b9b0815cf02629debdf02b86c90b73f402b70b2ed8c2123997
python_derived_from_source_hash: 13aece61203d17b9b0815cf02629debdf02b86c90b73f402b70b2ed8c2123997
source_facet: synced
recipe_derived_from_description_hash: 13aece61203d17b9b0815cf02629debdf02b86c90b73f402b70b2ed8c2123997
python_derived_from_recipe_hash: ad8a19a8120356d7a7f09d5f8ac83395ced0e2708db86f6045cc1115e1cbc1d2
---

# Description

If `temperature == "high"`, call [[set_speed_high]] to set every
water particle's speed to the high constant. Otherwise pass state
through unchanged.

## Inputs

- state — current ParticleState
- temperature — one of `"zero"` | `"low"` | `"medium"` | `"high"`

# Recipe

If temperature == "high":
  Let new_state = Call [[set_speed_high]] with state=state.
  Return new_state.
Return state.

# Python

```python
def compute(context, state, temperature):
  if (temperature == 'high'):
    new_state = set_speed_high(state=state)
    return new_state
  return state
```
