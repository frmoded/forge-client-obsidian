---
type: action
role: leaf
description: Returns a speed value (simulation units per second) for a given temperature level.
---

# Description

Return a speed value for the given temperature level.
Mapping: `'zero' → 0.0`, `'low' → 20.0`, `'medium' → 50.0`,
`'high' → 100.0`. Unknown labels fall back to medium (50.0).
Units are simulation units per second.

## Inputs

- temperature — one of `"zero"` | `"low"` | `"medium"` | `"high"`

# Recipe

Let speed = Call [[temperature_to_speed]] with temperature=temperature.
Return speed.
