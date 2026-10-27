---
type: action
role: leaf
description: "Block 22 — control: if temperature is low, set water speed low."
python_hash: 8f8ad3242dde9af59e922d80da5cd735102c06cd6fde4f7988dbb36d160e2cc1
description_hash: 01b366f5ebd699a75e90151dd7f2517a0534ba1c4614a4931f1fb0b6aeea26cb
recipe_hash: 856341c9529d1334e9769b3ceb5d553475c0cd6e6880793375a3e6442e9c0fc7
recipe_derived_from_source_hash: 01b366f5ebd699a75e90151dd7f2517a0534ba1c4614a4931f1fb0b6aeea26cb
python_derived_from_source_hash: 01b366f5ebd699a75e90151dd7f2517a0534ba1c4614a4931f1fb0b6aeea26cb
source_facet: synced
recipe_derived_from_description_hash: 01b366f5ebd699a75e90151dd7f2517a0534ba1c4614a4931f1fb0b6aeea26cb
python_derived_from_recipe_hash: 856341c9529d1334e9769b3ceb5d553475c0cd6e6880793375a3e6442e9c0fc7
---

# Description

If `temperature == "low"`, call [[set_speed_low]] to set every
water particle's speed to the low constant. Otherwise pass state
through unchanged.

## Inputs

- state — current ParticleState
- temperature — one of `"zero"` | `"low"` | `"medium"` | `"high"`

# Recipe

If temperature == "low":
  Let new_state = Call [[set_speed_low]] with state=state.
  Return new_state.
Return state.

# Python

```python
def compute(context, state, temperature):
  if (temperature == 'low'):
    new_state = set_speed_low(state=state)
    return new_state
  return state
```
