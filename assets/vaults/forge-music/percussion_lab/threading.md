---
type: action
---

# Description

Threads weaving back together. Kick + closed hi-hat carry the heartbeat;
snare returns lightly on off-beats `1.5` and `3.5`. Three voices — kick on
1+3, snare on 1.5+3.5, closed hi-hat on quarters. `human` velocity profile.

## Inputs

- bars (default 4) — section length

## Mechanics

Kick on beats 1 and 3 (steady); snare on the 16th-late off-beats `1.5` /
`3.5`; closed hi-hat on quarters. One `mf` mark on the kick's first note.

# Recipe

Let kp = Call [[play_at_offsets]] with instrument=[[kick]], offsets=[0, 2], duration=0.25, bars=bars, velocity="human", mark_dynamics=True.
Let sp = Call [[play_at_offsets]] with instrument=[[snare]], offsets=[1.5, 3.5], duration=0.25, bars=bars, velocity="human".
Let chp = Call [[play_at_offsets]] with instrument=[[closed_hihat]], offsets=[0, 1, 2, 3], duration=0.25, bars=bars, velocity="human".
Return Call [[voices_canonical]] with kp=kp, sp=sp, chp=chp.
