---
type: action
role: leaf
description: "Block 14 — action: reflect every wall-touching particle's heading back inside."
python_hash: 5bd14b40b5ef989b61e01abf8cee8179521488dab913d283d5d4819313861920
description_hash: 2dcfbde7828cf699d2fab04ac749f0bcd4583bbae777fa8e22ee021d71febf85
recipe_hash: cb75aa3244402e44831140b874161cf52b3ff7014701cd95ca6d2197cf813ae0
recipe_derived_from_source_hash: 2dcfbde7828cf699d2fab04ac749f0bcd4583bbae777fa8e22ee021d71febf85
python_derived_from_source_hash: 2dcfbde7828cf699d2fab04ac749f0bcd4583bbae777fa8e22ee021d71febf85
source_facet: synced
recipe_derived_from_description_hash: 2dcfbde7828cf699d2fab04ac749f0bcd4583bbae777fa8e22ee021d71febf85
python_derived_from_recipe_hash: cb75aa3244402e44831140b874161cf52b3ff7014701cd95ca6d2197cf813ae0
---

# Description

Reflect every particle that has crossed a chamber bound back inside.
Vertical walls (`x < 0` or `x > width`) flip heading via `π − heading`;
horizontal walls (`y < 0` or `y > height`) flip via `−heading`; the
resulting heading is normalized modulo `2π`. Position is clamped back
inside the bounds. Particles inside the chamber are unchanged.

## Inputs

- state — current ParticleState

# Recipe

Let new_state = Call [[bounce_off_walls]] with state=state.
Return new_state.

# Python

```python
def compute(context, state):
  new_state = bounce_off_walls(state=state)
  return new_state
```
