---
type: action
role: root
description: "Block 1 — setup event. Create the water population and set its speed + mass."
description_hash: 31a9249fe4711c027cc9d959dea025c5269653bc34593c2d161beffebd0537ec
recipe_hash: 0d7964b6a3496a484792a8d9cdedf917980a8d71e74c916ad1461b430519553e
python_hash: e5d1a4fc162f7e942b790e395406201fb6b83935dfe1843a475fc8837c15f097
recipe_derived_from_source_hash: 31a9249fe4711c027cc9d959dea025c5269653bc34593c2d161beffebd0537ec
python_derived_from_source_hash: 31a9249fe4711c027cc9d959dea025c5269653bc34593c2d161beffebd0537ec
source_facet: synced
recipe_derived_from_description_hash: 31a9249fe4711c027cc9d959dea025c5269653bc34593c2d161beffebd0537ec
---

# Description

Set up the simulation chamber and populate it with water particles.

1. Create an empty 800×600 chamber.
2. Add 500 water particles at random positions via [[create_water_particles]].
3. Set their speed for the given temperature via [[set_water_speed]].
4. Set their mass to medium via [[set_water_mass]].

This is the initial-population event and the ORIGIN of the
simulation state — it takes no incoming state.

## Inputs

- temperature (default `"medium"`) — runtime-injected by `/moda/init`

# Recipe

Let state = Call [[create_chamber]] with width=800, height=600.
Let state = Call [[create_water_particles]] with state=state.
Let state = Call [[set_water_speed]] with state=state, temperature=temperature.
Let state = Call [[set_water_mass]] with state=state.
Return state.

# Python

```python
def compute(context):
    return None
```
