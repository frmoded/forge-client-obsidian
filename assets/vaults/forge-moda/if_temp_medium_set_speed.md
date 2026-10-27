---
type: action
role: leaf
description: "Block 20 — control: if temperature is medium, set water speed medium."
python_hash: aef461079e926dec779297a14d90802d5d1f6f238f357106741b077176e8e0a0
description_hash: c73a9f9ea9ab81e17140757e8af9477d19b28608bc9e93093600cfcda5b734a4
recipe_hash: 24785cd36e1634a9edd82b9f7f7191a285b0dc0378d43f3e847cfc800a63b85f
recipe_derived_from_source_hash: c73a9f9ea9ab81e17140757e8af9477d19b28608bc9e93093600cfcda5b734a4
python_derived_from_source_hash: c73a9f9ea9ab81e17140757e8af9477d19b28608bc9e93093600cfcda5b734a4
source_facet: synced
recipe_derived_from_description_hash: c73a9f9ea9ab81e17140757e8af9477d19b28608bc9e93093600cfcda5b734a4
python_derived_from_recipe_hash: 24785cd36e1634a9edd82b9f7f7191a285b0dc0378d43f3e847cfc800a63b85f
---

# Description

If `temperature == "medium"`, call [[set_speed_medium]] to set every
water particle's speed to the medium constant. Otherwise pass state
through unchanged.

## Inputs

- state — current ParticleState
- temperature — one of `"zero"` | `"low"` | `"medium"` | `"high"`

# Recipe

If temperature == "medium":
  Let new_state = Call [[set_speed_medium]] with state=state.
  Return new_state.
Return state.

# Python

```python
def compute(context, state, temperature):
  if (temperature == 'medium'):
    new_state = set_speed_medium(state=state)
    return new_state
  return state
```
