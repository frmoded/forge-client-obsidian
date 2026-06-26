---
type: action
role: leaf
description: "Block 17 — control: tell water particles to update speed for the temperature."
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
