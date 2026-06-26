---
type: action
role: leaf
description: "Block 20 — control: if temperature is medium, set water speed medium."
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
