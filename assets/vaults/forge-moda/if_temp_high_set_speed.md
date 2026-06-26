---
type: action
role: leaf
description: "Block 18 — control: if temperature is high, set water speed high."
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
