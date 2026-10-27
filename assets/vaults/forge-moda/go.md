---
type: action
role: root
description: "Block 9 — go event. One simulation tick; history-dependent per C8 (continues from its own last state)."
python_hash: c5f2b4b85c58bf27fac8b058098c49262266c3e244a9fb7ab5fd6939a74d1cad
description_hash: 66de61f6c6a0f5a8641b45481d0c49227b0a6b566e51d233d487f3539a7d863c
recipe_hash: f2bd42df4f35b516afeff864439fc7bcdb0355c58ccc827db72bd1a64d2e4d75
recipe_derived_from_source_hash: 66de61f6c6a0f5a8641b45481d0c49227b0a6b566e51d233d487f3539a7d863c
python_derived_from_source_hash: 66de61f6c6a0f5a8641b45481d0c49227b0a6b566e51d233d487f3539a7d863c
source_facet: synced
recipe_derived_from_description_hash: 66de61f6c6a0f5a8641b45481d0c49227b0a6b566e51d233d487f3539a7d863c
python_derived_from_recipe_hash: f2bd42df4f35b516afeff864439fc7bcdb0355c58ccc827db72bd1a64d2e4d75
---

# Description

Advance the simulation by one tick:

1. Tell every particle to move, wall-bounce, and interact via [[ask_all_particles]].
2. Update every water particle's speed for the temperature via [[ask_water_particles]].

State resolution, in order — this is what makes the simulation
accumulate instead of restarting:

1. If `state` is provided, use it.
2. Otherwise continue from the state this note last produced, via
   [[latest_state]]. That is how a second `go` picks up where the
   first left off.
3. Otherwise — the very first call, when there is nothing to continue
   from — start from the canned [[sample_state]].

## Inputs

- state (default `None`) — current ParticleState (or `None` for first call)
- dt (default `0.0333`) — time step (30 FPS default)
- temperature (default `"medium"`) — current temperature setting

# Recipe

If state == None:
  Let state = Call [[latest_state]] with context=context.

If state == None:
  Let state = Call [[sample_state]].

Let state = Call [[ask_all_particles]] with state=state, dt=dt.
Let state = Call [[ask_water_particles]] with state=state, temperature=temperature.
Return state.

# Python

```python
def compute(context, state=None, dt=0.0333, temperature='medium'):
  if (state == None):
    state = latest_state(context=context)
  if (state == None):
    state = sample_state()
  state = ask_all_particles(state=state, dt=dt)
  state = ask_water_particles(state=state, temperature=temperature)
  return state
```
