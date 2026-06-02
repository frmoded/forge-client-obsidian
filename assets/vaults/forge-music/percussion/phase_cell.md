---
type: action
description: phase_cell
inputs: []
snapshot_capture: false
---

# English


The Reich "Clapping Music" 12-eighth rhythmic cell encoded as a plain Python dict, designed for consumption by [[phase_shifter]]. The cell carries three things: a percussion **instrument factory** (closed hi-hat — `closed_hihat`, not `closed_hihat()`; the shifter calls it per hit), a list of **hit positions** in eighth-note units within the cell (the Reich Clapping pattern `[0, 1, 2, 4, 5, 7, 9, 10]`: 8 hits across 12 positions, asymmetric and characteristic), and the **cell length** in eighths (12).

Nothing about duration, velocity, measure structure, or voice count lives here — those are the shifter's responsibility. This snippet is a pure data leaf that any phase-shifting composition can consume.

The cell-as-data pattern means future Reich-shaped pieces can swap just this snippet (different cell, different timbre) without re-implementing the algorithm in [[phase_shifter]].

---

# Python

```python
def compute(context):
    return {
        "instrument": closed_hihat,                   # factory, not an instance
        "hits_in_eighths": [0, 1, 2, 4, 5, 7, 9, 10], # Reich "Clapping Music"
        "length_eighths": 12,
    }
```
