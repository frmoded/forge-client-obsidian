---
type: action
role: leaf
description: "Block 4 — set every water particle's mass to medium."
python_hash: 0b7e5fb4a222d2398a300aa4a9d9e5235a001c8e8373ae7102b5447d261a5f3e
description_hash: 2f286e575a6ff2a6fdce7d1b75bf7ec68603f95cc3e6ee0336a73c130e26b9dd
recipe_hash: ef6b51e4bbc234399a6e60382e2c59980a6cb4c39afc94a32cbfab47208bb3c0
recipe_derived_from_source_hash: 2f286e575a6ff2a6fdce7d1b75bf7ec68603f95cc3e6ee0336a73c130e26b9dd
python_derived_from_source_hash: 2f286e575a6ff2a6fdce7d1b75bf7ec68603f95cc3e6ee0336a73c130e26b9dd
source_facet: synced
recipe_derived_from_description_hash: 2f286e575a6ff2a6fdce7d1b75bf7ec68603f95cc3e6ee0336a73c130e26b9dd
python_derived_from_recipe_hash: ef6b51e4bbc234399a6e60382e2c59980a6cb4c39afc94a32cbfab47208bb3c0
---

# Description

Set the mass of every water particle to `"medium"`. Ink particles
are untouched.

## Inputs

- state — current ParticleState

# Recipe

Let new_state = Call [[set_mass_for_type]] with state=state, particle_type="water", mass="medium".
Return new_state.

# Python

```python
def compute(context, state):
  new_state = set_mass_for_type(state=state, particle_type='water', mass='medium')
  return new_state
```
