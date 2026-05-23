---
type: action
role: leaf
inputs: []
description: "Block 14 — action: reflect a wall-touching particle's heading back inside."
---

# English

Inputs: None

Reflect the current particle's heading off the wall it's touching: across the vertical walls (`x < 0` or `x > width`) `heading → π − heading`; across the horizontal walls (`y < 0` or `y > height`) `heading → −heading`; normalize modulo `2π`. Clamp the position back inside the bounds.

Applies only to particles actually touching a wall; particles inside the chamber are unchanged. Speed, mass, type unchanged.

# Python

```python
def compute(context, state):
    xs = state.xs.copy()
    ys = state.ys.copy()
    headings = state.headings.copy()

    hits_left = xs < 0
    hits_right = xs > state.width
    hits_bottom = ys < 0
    hits_top = ys > state.height

    hits_vertical = hits_left | hits_right
    hits_horizontal = hits_bottom | hits_top

    headings[hits_vertical] = math.pi - headings[hits_vertical]
    headings[hits_horizontal] = -headings[hits_horizontal]

    headings = headings % (2 * math.pi)

    xs[hits_left] = 0.0
    xs[hits_right] = state.width
    ys[hits_bottom] = 0.0
    ys[hits_top] = state.height

    return ParticleState(
        tick=state.tick,
        ids=state.ids,
        types=state.types,
        xs=xs,
        ys=ys,
        headings=headings,
        speeds=state.speeds,
        masses=state.masses,
        width=state.width,
        height=state.height,
    )
```
