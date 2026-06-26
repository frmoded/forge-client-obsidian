---
type: action
---

# Description

Dozens. Snare arrives with ghost notes; kick syncopates more; closed hi-hat
fills with steady eighths. Three voices active. The bar-by-bar kick variation
keeps the propulsion forward without locking into a stable groove.

## Inputs

- bars (default 4) — section length; cycles the 4-bar kick variation

## Mechanics

Kick varies bar-by-bar (bar 1 + 3 add and-of-2; bar 4 adds beat 3.5);
snare on every off-beat eighth; closed hi-hat on straight eighths.
`human` velocity profile (`mf` band); one `mf` mark on the kick's first note.

# Recipe

Let kp = Call [[play_at_offsets]] with instrument=[[kick]], offsets=[[0, 1.5, 2], [0, 2], [0, 1.5, 2], [0, 2, 3.5]], duration=0.25, bars=bars, velocity="human", mark_dynamics=True.
Let sp = Call [[play_at_offsets]] with instrument=[[snare]], offsets=[0.5, 1.5, 2.5, 3.5], duration=0.25, bars=bars, velocity="human".
Let chp = Call [[play_at_offsets]] with instrument=[[closed_hihat]], offsets=[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], duration=0.25, bars=bars, velocity="human".
Return Call [[voices_canonical]] with kp=kp, sp=sp, chp=chp.
