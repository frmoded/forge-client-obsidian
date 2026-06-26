---
type: action
role: leaf
description: "Block 22 — control: if temperature is low, set water speed low."
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
