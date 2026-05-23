---
type: action
role: root
inputs: []
description: "Block 9 — go event. One simulation tick; history-dependent per C8 (reads its own prior snapshot to accumulate)."
generation_notes: |
  Keep go a pass-through (return the last context.compute result
  directly) — do NOT post-process state after the last call. The
  snapshot-default reads go's outbound edge directory, which equals
  the terminal callee's return only while go stays pass-through.
  Any post-processing (e.g. state.tick += 1) would cause
  read_snapshot() to lag the true return by one tick.

  State resolution order (history-dependent per C8):
    - If `state` is explicitly provided, use it.
    - Otherwise read the latest snapshot via
      `context.read_snapshot()` and continue accumulating from the
      previous tick.
    - Otherwise (first call, no prior snapshot) fall back to
      `sample_state`.

  Python signature must be:
    def compute(context, state=None, dt=1/30, temperature="medium")
  These parameters are runtime-injected by the moda simulator's
  /moda/compute fast-path. The English body intentionally doesn't
  mention them — they're not student-visible knobs. Defaults:
  state=None triggers the snapshot read, dt=1/30 is the 30Hz
  default, temperature="medium" matches the simulator's default
  slider position and is used when a student clicks the Forge
  button manually.
---

# English

Call [[ask_all_particles]] with dt.
Call [[ask_water_particles]] with temperature.

# Python

```python
def compute(context, state=None, dt=1/30, temperature="medium"):
    if state is None or state == "":
        state = context.read_snapshot()
        if state is None:
            state = context.compute("sample_state")
    state = context.compute("ask_all_particles", state=state, dt=dt)
    state = context.compute("ask_water_particles", state=state, temperature=temperature)
    return state
```

# Dependencies

*Synced from Python. Edit the Python and regenerate, or run "Forge: Sync edges" to refresh.*

[[sample_state]] [[ask_all_particles]] [[ask_water_particles]]
