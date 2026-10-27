---
type: action
role: leaf
description: "Block 17 — control: tell water particles to update speed for the temperature."
python_hash: 2008f36266fb5f808c3a9d4f3fc9673465ebec805608cc3e438306cc22b1f8cf
description_hash: 9830e01a538d15310f627d5a398f1bc9ebf31846e35633c66bfbeac198786f71
recipe_hash: 0f6f5d9b1b52cdf15eb088e508488c8e689251cf43a08a9ab8c3d1c8c42a3911
recipe_derived_from_source_hash: 9830e01a538d15310f627d5a398f1bc9ebf31846e35633c66bfbeac198786f71
python_derived_from_source_hash: 9830e01a538d15310f627d5a398f1bc9ebf31846e35633c66bfbeac198786f71
source_facet: synced
recipe_derived_from_description_hash: 9830e01a538d15310f627d5a398f1bc9ebf31846e35633c66bfbeac198786f71
python_derived_from_recipe_hash: 0f6f5d9b1b52cdf15eb088e508488c8e689251cf43a08a9ab8c3d1c8c42a3911
---

# Description

Update every water particle's speed to match the current
temperature. Each of the four `[[if_temp_*_set_speed]]` blocks
fires when the temperature label matches; the others pass through
unchanged.

## Inputs

- state — current ParticleState
- temperature — one of `"zero"` | `"low"` | `"medium"` | `"high"`

# Recipe

Let state = Call [[if_temp_high_set_speed]] with state=state, temperature=temperature.
Let state = Call [[if_temp_medium_set_speed]] with state=state, temperature=temperature.
Let state = Call [[if_temp_low_set_speed]] with state=state, temperature=temperature.
Let state = Call [[if_temp_zero_set_speed]] with state=state, temperature=temperature.
Return state.

# Python

```python
def compute(context, state, temperature):
  state = if_temp_high_set_speed(state=state, temperature=temperature)
  state = if_temp_medium_set_speed(state=state, temperature=temperature)
  state = if_temp_low_set_speed(state=state, temperature=temperature)
  state = if_temp_zero_set_speed(state=state, temperature=temperature)
  return state
```
