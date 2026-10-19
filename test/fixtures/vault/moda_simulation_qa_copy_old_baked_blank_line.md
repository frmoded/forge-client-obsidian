---
type: action
role: root
featured: true
forge_action_label: Run simulation
description: "One bounded run of the moda simulator: setup, then 300 ticks of go with scheduled clicks."
description_hash: 7d37534f3a809e667b7ec06bfa73982f19fae4f02d6b564ec2854d03559ff8f2
recipe_hash: 81aff67e08a033efe7c9d8876cea8e67a5222aa94ebb165143e69472c2955dd8
python_hash: 19570ce72d6f3bc773e07b23dbfa442811e69651d0a9639613bb5db1c1be8566
recipe_derived_from_source_hash: 7d37534f3a809e667b7ec06bfa73982f19fae4f02d6b564ec2854d03559ff8f2
python_derived_from_source_hash: 7d37534f3a809e667b7ec06bfa73982f19fae4f02d6b564ec2854d03559ff8f2
source_facet: synced
recipe_derived_from_description_hash: 7d37534f3a809e667b7ec06bfa73982f19fae4f02d6b564ec2854d03559ff8f2
python_derived_from_recipe_hash: 81aff67e08a033efe7c9d8876cea8e67a5222aa94ebb165143e69472c2955dd8
sync_state: synced
---

# Description

The moda simulator expressed as one bounded run. Ties together
[[setup]], [[go]], and [[on_mouse_click]] in the same order the live
React simulator does — but runs for a fixed number of ticks and
returns the final state, instead of looping forever.

Steps:

1. Call [[setup]] to create the starting chamber and water particles.
2. Read the click scenario from [[sample_clicks]] — a list of clicks,
   each tagged with the tick they fire on.
3. Group the clicks by tick via [[group_clicks_by_tick]] so the
   per-tick dispatch is a cheap dict lookup.
4. For each of 300 ticks:
    Apply any clicks scheduled at this tick via [[apply_clicks_at_tick]].
    Call [[go]] to advance the simulation by one tick.
5. Hand the final state to [[show_simulation]] (the iframe-render hook).
6. Return the final state.

The live simulator (the React iframe) runs the same wiring
continuously and reacts to real canvas clicks. This snippet is the
inspectable, shadowable version of that same loop. Customize the
click scenario by shadowing [[sample_clicks]].

## Inputs

(none — constants live as literals inside the body)

# Recipe

Let state = Call [[setup]].
Let clicks = Call [[sample_clicks]].
Let clicks_by_tick = Call [[group_clicks_by_tick]] with clicks=clicks.

For each tick in Call [[tick_range]] with n=300:
  Let state = Call [[apply_clicks_at_tick]] with state=state, clicks_by_tick=clicks_by_tick, tick=tick, on_click=on_mouse_click.
  Let state = Call [[go]] with state=state, dt=0.0333, temperature="medium".

Let final = Call [[show_simulation]] with state=state.
Return final.

# Python

```python
def compute(context):
  state = setup()
  clicks = sample_clicks()
  clicks_by_tick = group_clicks_by_tick(clicks=clicks)
  for tick in tick_range(n=300):
    state = apply_clicks_at_tick(state=state, clicks_by_tick=clicks_by_tick, tick=tick, on_click=on_mouse_click)
    state = go(state=state, dt=0.0333, temperature='medium')
  final = show_simulation(state=state)
  return final

```
