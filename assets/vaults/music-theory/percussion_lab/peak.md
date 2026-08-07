---
type: action
---

# Description

The murmuration peak — full kit + crash. Kick + open hi-hat + low tom on
every beat; mid tom on every off-beat eighth; snare on every 16th (the
hardest-driving texture); crash on bar 1 + bar 3 downbeats only (two strikes
across the 4-bar section). `accent` profile pushes velocities to `ff`. The
loudest, fullest moment of the piece.

## Inputs

- bars (default 4) — section length; cycles the 4-bar pattern

# Recipe

Let kp = Call [[play_at_offsets]] with instrument=[[kick]], offsets=[0, 1, 2, 3], duration=0.25, bars=bars, velocity="accent", mark_dynamics=True.
Let sp = Call [[play_at_offsets]] with instrument=[[snare]], offsets=[0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75], duration=0.25, bars=bars, velocity="accent".
Let ohp = Call [[play_at_offsets]] with instrument=[[open_hihat]], offsets=[0, 1, 2, 3], duration=0.25, bars=bars, velocity="accent".
Let ltp = Call [[play_at_offsets]] with instrument=[[low_tom]], offsets=[0, 1, 2, 3], duration=0.25, bars=bars, velocity="accent".
Let mtp = Call [[play_at_offsets]] with instrument=[[mid_tom]], offsets=[0.5, 1.5, 2.5, 3.5], duration=0.25, bars=bars, velocity="accent".
Let crp = Call [[play_at_offsets]] with instrument=[[crash_cymbal]], offsets=[[0], [], [0], []], duration=0.25, bars=bars, velocity="accent".
Return Call [[voices_canonical]] with kp=kp, sp=sp, ohp=ohp, ltp=ltp, mtp=mtp, crp=crp.
