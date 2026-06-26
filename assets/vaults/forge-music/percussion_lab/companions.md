---
type: action
---

# Description

A few birds join. Kick stays the heartbeat (beats 1 and 3); closed hi-hat
enters with steady quarter notes. Two voices play; the other 5 instruments
fill rest staves at their canonical voice positions so [[murmuration]] can
`sequence` sections without pitch-collapse on rendering.

## Inputs

- bars (default 4) — section length

## Mechanics

Kick on 1 and 3; closed hi-hat on every beat (quarters). `human` velocity
profile (`mf` band). One dynamic mark (`mf`) on the kick's first note via
`mark_dynamics`.

# Recipe

Let kp = Call [[play_at_offsets]] with instrument=[[kick]], offsets=[0, 2], duration=0.25, bars=bars, velocity="human", mark_dynamics=True.
Let chp = Call [[play_at_offsets]] with instrument=[[closed_hihat]], offsets=[0, 1, 2, 3], duration=0.25, bars=bars, velocity="human".
Return Call [[voices_canonical]] with kp=kp, chp=chp.
