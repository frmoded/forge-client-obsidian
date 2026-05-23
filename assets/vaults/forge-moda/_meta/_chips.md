---
type: data
content_type: yaml
read_only: true
description: MoDa chip palette — the leaf operations students compose into setup, on_mouse_click, and go via the chip UI. 16 chips across 5 groups.
---

# Body

```yaml
chips:
  # Setup chain — what setup.md composes.
  - label: "Create water particles"
    insertion: "Call [[create_water_particles]]."
    group: "Setup"
    refs: [create_water_particles]
  - label: "Set water speed (from temperature)"
    insertion: "Call [[set_water_speed]] with temperature."
    group: "Setup"
    refs: [set_water_speed]
  - label: "Set water mass"
    insertion: "Call [[set_water_mass]]."
    group: "Setup"
    refs: [set_water_mass]

  # Click chain — what on_mouse_click.md composes.
  - label: "Create ink particles"
    insertion: "Call [[create_ink_particles]] with x and y."
    group: "Click"
    refs: [create_ink_particles]
  - label: "Set ink speed"
    insertion: "Call [[set_ink_speed]]."
    group: "Click"
    refs: [set_ink_speed]
  - label: "Set ink mass"
    insertion: "Call [[set_ink_mass]]."
    group: "Click"
    refs: [set_ink_mass]

  # Go chain — what go.md composes (the per-tick dispatch).
  - label: "Ask all particles"
    insertion: "Call [[ask_all_particles]] with dt."
    group: "Go"
    refs: [ask_all_particles]
  - label: "Ask water particles (temperature)"
    insertion: "Call [[ask_water_particles]] with temperature."
    group: "Go"
    refs: [ask_water_particles]

  # Per-particle actions — composed inside an ask_all_particles scope.
  - label: "Move"
    insertion: "Call [[move]] with dt."
    group: "Particle actions"
    refs: [move]
  - label: "Interact (detect collisions)"
    insertion: "Call [[interact]]."
    group: "Particle actions"
    refs: [interact]
  - label: "If wall, bounce off wall"
    insertion: "Call [[if_wall_then_bounce]]."
    group: "Particle actions"
    refs: [if_wall_then_bounce]
  - label: "If colliding, bounce off particle"
    insertion: "Call [[if_particle_then_bounce]]."
    group: "Particle actions"
    refs: [if_particle_then_bounce]

  # Temperature conditionals — composed inside an ask_water_particles scope.
  - label: "If temperature high → speed high"
    insertion: "Call [[if_temp_high_set_speed]] with temperature."
    group: "Temperature"
    refs: [if_temp_high_set_speed]
  - label: "If temperature medium → speed medium"
    insertion: "Call [[if_temp_medium_set_speed]] with temperature."
    group: "Temperature"
    refs: [if_temp_medium_set_speed]
  - label: "If temperature low → speed low"
    insertion: "Call [[if_temp_low_set_speed]] with temperature."
    group: "Temperature"
    refs: [if_temp_low_set_speed]
  - label: "If temperature zero → speed zero"
    insertion: "Call [[if_temp_zero_set_speed]] with temperature."
    group: "Temperature"
    refs: [if_temp_zero_set_speed]
```
