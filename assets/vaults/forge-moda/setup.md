---
type: action
role: root
description: "Block 1 — setup event. Create the water population and set its speed + mass."
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
