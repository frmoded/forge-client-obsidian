---
type: data
content_type: yaml
read_only: true
schema_version: 2
description: MoDa chip palette — schema v2. Auto-discovery surfaces every action/data snippet in this library; this file's `overrides[]` curate labels + groups for the 16 teaching chips, and `hide[]` removes internal helpers + top-level compositions from the palette. The insertion text is signature-derived (B7.1-canonical `Do [[X]](<inputs>).`) from each snippet's frontmatter `inputs:` field — no insertion strings hand-authored here.
---

# Body

```yaml
schema_version: 2

# ---------------------------------------------------------------------------
# Group order + display labels. Auto-derived chips that DON'T match any of
# these groups land in an "(library)" default bucket; the `hide[]` block
# below empties that bucket so only the 5 curated groups appear.
# ---------------------------------------------------------------------------
groups:
  - id: Setup
    order: 1
    label: Setup
  - id: Click
    order: 2
    label: Click
  - id: Go
    order: 3
    label: Go
  - id: Particle actions
    order: 4
    label: Particle actions
  - id: Temperature
    order: 5
    label: Temperature

# ---------------------------------------------------------------------------
# Hide internal helpers + top-level compositions from auto-discovery.
# These are still valid snippets — they're just not chip-palette entries
# in the teaching narrative.
#   - bounce_off_particle / bounce_off_wall: invoked by if_*_then_bounce
#   - speed_for_temperature: internal lookup table
#   - sample_clicks / sample_state: utility actions
#   - set_speed_high/low/medium/zero: internal speed setters
#   - on_mouse_click / go / setup / simulation: top-level compositions
#     that students BUILD by chaining chips into them, not chips themselves
# ---------------------------------------------------------------------------
hide:
  - bounce_off_particle
  - bounce_off_wall
  - speed_for_temperature
  - sample_clicks
  - sample_state
  - set_speed_high
  - set_speed_low
  - set_speed_medium
  - set_speed_zero
  - on_mouse_click
  - go
  - setup
  - simulation

# ---------------------------------------------------------------------------
# Per-chip curation. `target` matches the snippet_id (basename).
# `insertion` is intentionally NOT overridden — auto-derive produces the
# B7.1-canonical `Do [[X]](<inputs>).` form from the snippet's `inputs:`
# frontmatter, which is correct for every chip below. Labels are
# overridden only where the v1 hand-curated label differs from the
# humanized auto-derived label.
# ---------------------------------------------------------------------------
overrides:
  # Setup chain — what setup.md composes.
  - target: create_water_particles
    group: Setup
    order: 1
  - target: set_water_speed
    group: Setup
    order: 2
    label: "Set water speed (from temperature)"
  - target: set_water_mass
    group: Setup
    order: 3

  # Click chain — what on_mouse_click.md composes.
  - target: create_ink_particles
    group: Click
    order: 1
  - target: set_ink_speed
    group: Click
    order: 2
  - target: set_ink_mass
    group: Click
    order: 3

  # Go chain — what go.md composes (the per-tick dispatch).
  - target: ask_all_particles
    group: Go
    order: 1
  - target: ask_water_particles
    group: Go
    order: 2
    label: "Ask water particles (temperature)"

  # Per-particle actions — composed inside an ask_all_particles scope.
  - target: move
    group: Particle actions
    order: 1
  - target: interact
    group: Particle actions
    order: 2
    label: "Interact (detect collisions)"
  - target: if_wall_then_bounce
    group: Particle actions
    order: 3
    label: "If wall, bounce off wall"
  - target: if_particle_then_bounce
    group: Particle actions
    order: 4
    label: "If colliding, bounce off particle"

  # Temperature conditionals — composed inside an ask_water_particles scope.
  - target: if_temp_high_set_speed
    group: Temperature
    order: 1
    label: "If temperature high → speed high"
  - target: if_temp_medium_set_speed
    group: Temperature
    order: 2
    label: "If temperature medium → speed medium"
  - target: if_temp_low_set_speed
    group: Temperature
    order: 3
    label: "If temperature low → speed low"
  - target: if_temp_zero_set_speed
    group: Temperature
    order: 4
    label: "If temperature zero → speed zero"
```
