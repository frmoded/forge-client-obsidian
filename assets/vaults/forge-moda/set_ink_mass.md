---
type: action
role: leaf
description: "Block 8 — set every ink particle's mass to medium."
python_hash: 47be79100982e5506fce6ea2ef77642d9dba012c8e2f63fa0ceeedd5eb1f28ac
description_hash: 83cbb8a4abb3e1e4177845886dd44970657ccceb7159b369a3bcdacec395c6ac
recipe_hash: e531e5a1ec28a04fa3e1fa5e56c5c2417a1962013c64fe66549dbb05a4f59a21
recipe_derived_from_source_hash: 83cbb8a4abb3e1e4177845886dd44970657ccceb7159b369a3bcdacec395c6ac
python_derived_from_source_hash: 83cbb8a4abb3e1e4177845886dd44970657ccceb7159b369a3bcdacec395c6ac
source_facet: synced
recipe_derived_from_description_hash: 83cbb8a4abb3e1e4177845886dd44970657ccceb7159b369a3bcdacec395c6ac
python_derived_from_recipe_hash: e531e5a1ec28a04fa3e1fa5e56c5c2417a1962013c64fe66549dbb05a4f59a21
---

# Description

Set the mass of every ink particle to `"medium"`. Water particles
are untouched.

## Inputs

- state — current ParticleState

# Recipe

Let new_state = Call [[set_mass_for_type]] with state=state, particle_type="ink", mass="medium".
Return new_state.

# Python

```python
def compute(context, state):
  new_state = set_mass_for_type(state=state, particle_type='ink', mass='medium')
  return new_state
```
