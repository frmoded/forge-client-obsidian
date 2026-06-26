---
type: action
role: leaf
description: "Block 24 — control: if temperature is zero, set water speed zero."
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
