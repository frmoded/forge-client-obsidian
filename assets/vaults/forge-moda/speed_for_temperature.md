---
type: action
role: leaf
description: Returns a speed value (simulation units per second) for a given temperature level.
python_hash: 662fdb1396290596f7e020dd33764c5bb61555a913eb06db72391e9d648d86be
description_hash: 00c8a131a89ae0731e9cad33a09bf2f7b8c11b0c171bb5c9372d96dd8e30d613
recipe_hash: dc6309749f9bf33806f530ad785ea2bf3fbc1634b488a9eaf804b82986385cfe
recipe_derived_from_source_hash: 00c8a131a89ae0731e9cad33a09bf2f7b8c11b0c171bb5c9372d96dd8e30d613
python_derived_from_source_hash: 00c8a131a89ae0731e9cad33a09bf2f7b8c11b0c171bb5c9372d96dd8e30d613
source_facet: synced
recipe_derived_from_description_hash: 00c8a131a89ae0731e9cad33a09bf2f7b8c11b0c171bb5c9372d96dd8e30d613
python_derived_from_recipe_hash: dc6309749f9bf33806f530ad785ea2bf3fbc1634b488a9eaf804b82986385cfe
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

# Python

```python
def compute(context, temperature):
  speed = temperature_to_speed(temperature=temperature)
  return speed
```
