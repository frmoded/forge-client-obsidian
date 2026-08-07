---
type: action
---

# Description

One bird, slow turns. The opening of the murmuration arc: just the kick,
on beats 1 and 3 of each bar. Spare, deliberate, quiet — `mp`-band velocity
(70). The piece's resting heartbeat; later sections add to this baseline.

## Inputs

- bars (default 4) — section length; cycles 4-bar pattern for >4

# Recipe

Let kp = Call [[play_at_offsets]] with instrument=[[kick]], offsets=[0, 2], duration=0.25, bars=bars, velocity=70, mark_dynamics=True.
Return Call [[voices_canonical]] with kp=kp.
