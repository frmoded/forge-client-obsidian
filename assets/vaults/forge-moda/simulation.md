---
type: action
role: root
inputs: []
featured: true
forge_action_label: "Run simulation"
description: "One bounded run of the moda simulator: setup, then 300 ticks of go with scheduled clicks."
generation_notes: |
  Python signature must be:
    def compute(context)
  Zero parameters by design — this snippet is the moda event-loop
  wiring expressed as a one-shot bounded run, not a parametric
  simulator. Constants live as literals inside the body so a
  student reading the snippet sees real values (300 ticks, dt 1/30,
  temperature "medium"). Click scenario is delegated to
  sample_clicks (a data snippet) so students customize the scenario
  by shadowing sample_clicks rather than editing this loop.
---

# English

This snippet is the moda simulator expressed as one bounded run.
It ties together setup, go, and on_mouse_click in the same order
the live React simulator does — but it runs for a fixed number of
ticks and returns the final state, instead of looping forever.

Steps:

1. Call [[setup]] to create the starting chamber and water particles.
2. Read the click scenario from [[sample_clicks]] — a list of clicks, each tagged with the tick they fire on.
3. For each of 300 ticks:
     For any click scheduled at this tick, call [[on_mouse_click]] with its x and y.
     Call [[go]] to advance the simulation by one tick.
4. Return the final state.

The live simulator (the React iframe) runs the same wiring
continuously and reacts to real canvas clicks. This snippet is the
inspectable, shadowable version of that same loop. Customize the
click scenario by shadowing sample_clicks.

# Python

```python
def compute(context):
    state = context.compute("setup")
    clicks = context.compute("sample_clicks")

    num_ticks = 300
    dt = 1/30
    temperature = "medium"

    clicks_by_tick = {}
    for ev in clicks:
        clicks_by_tick.setdefault(ev["tick"], []).append(
            (ev["x"], ev["y"])
        )

    for tick in range(num_ticks):
        for x, y in clicks_by_tick.get(tick, []):
            state = context.compute(
                "on_mouse_click", state=state, x=x, y=y
            )
        state = context.compute(
            "go", state=state, dt=dt, temperature=temperature
        )

    return state
```

# Dependencies

*Synced from Python. Edit the Python and regenerate, or run "Forge: Sync edges" to refresh.*

[[setup]] [[sample_clicks]] [[on_mouse_click]] [[go]]
