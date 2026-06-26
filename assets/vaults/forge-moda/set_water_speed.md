---
type: action
role: leaf
description: "Block 3 — set every water particle's speed from the temperature."
---

# Description

Set the speed of every water particle to the value returned by
[[speed_for_temperature]] for the given `temperature`. Ink
particles are untouched.

## Inputs

- state — current ParticleState
- temperature — one of `"zero"` | `"low"` | `"medium"` | `"high"`

# Recipe

Let speed = Call [[speed_for_temperature]] with temperature=temperature.
Let new_state = Call [[set_speed_for_type]] with state=state, particle_type="water", speed=speed.
Return new_state.
