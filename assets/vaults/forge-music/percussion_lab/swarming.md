---
type: action
---

# Description

The flock swarming — full kit minus crash. Kick varies bar-by-bar with
syncopated pickups; snare drives a heavy backbeat; closed hi-hat fills with
straight eighths; open hi-hat punctuates beat 4-and; toms add a low/mid
two-note phrase. Six voices active. `human` velocity profile (`mf` band).

## Inputs

- bars (default 4) — section length

## Mechanics

Kick alternates per bar between a denser (4-hit) and sparser (2-hit) pattern.
Snare on beats 1.5 / 2 / 3.5 / 4. Closed hi-hat on straight eighths. Open
hi-hat on 4-and. Low tom on beats 2 and 4-and. Mid tom on and-of-2.

# Recipe

Let kp = Call [[play_at_offsets]] with instrument=[[kick]], offsets=[[0, 1.5, 2, 3.5], [0, 2], [0, 1.5, 2, 3.5], [0, 2]], duration=0.25, bars=bars, velocity="human", mark_dynamics=True.
Let sp = Call [[play_at_offsets]] with instrument=[[snare]], offsets=[0.5, 1, 2.5, 3], duration=0.25, bars=bars, velocity="human".
Let chp = Call [[play_at_offsets]] with instrument=[[closed_hihat]], offsets=[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], duration=0.25, bars=bars, velocity="human".
Let ohp = Call [[play_at_offsets]] with instrument=[[open_hihat]], offsets=[3.5], duration=0.25, bars=bars, velocity="human".
Let ltp = Call [[play_at_offsets]] with instrument=[[low_tom]], offsets=[1, 3.5], duration=0.25, bars=bars, velocity="human".
Let mtp = Call [[play_at_offsets]] with instrument=[[mid_tom]], offsets=[1.5], duration=0.25, bars=bars, velocity="human".
Return Call [[voices_canonical]] with kp=kp, sp=sp, chp=chp, ohp=ohp, ltp=ltp, mtp=mtp.
