---
type: action
role: root
featured: true
forge_action_label: "Run simulation"
description: "One bounded run of the moda simulator: setup, then 300 ticks of go with scheduled clicks."
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
