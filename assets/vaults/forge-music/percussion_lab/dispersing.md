---
type: action
---

# Description

The flock thinning. Crash is gone; toms drop to single hits per bar; snare
retreats to backbeats. Kick thins bar-by-bar (bar 1 still has a syncopated
pickup; bar 4 only the downbeat). The defining feature: the `decrescendo`
profile inserts a hairpin spanner — visible in MuseScore, audible in MIDI —
that slopes the section from `mf` down toward `mp`.

## Inputs

- bars (default 4) — section length; cycles the asymmetric 4-bar kick

## Mechanics

Kick varies per bar (bar 1 adds beat 3.5; bar 4 has only beat 1); closed
hi-hat eighths; open hi-hat on beat 1 only; snare on backbeats; low tom on
beat 2; mid tom on and-of-2. Six voices active. `decrescendo` velocity
profile; hairpin anchors on the first kick.

# Recipe

Let kp = Call [[play_at_offsets]] with instrument=[[kick]], offsets=[[0, 2, 3.5], [0, 2], [0, 2], [0]], duration=0.25, bars=bars, velocity="decrescendo", mark_dynamics=True.
Let sp = Call [[play_at_offsets]] with instrument=[[snare]], offsets=[1, 3], duration=0.25, bars=bars, velocity="decrescendo".
Let chp = Call [[play_at_offsets]] with instrument=[[closed_hihat]], offsets=[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], duration=0.25, bars=bars, velocity="decrescendo".
Let ohp = Call [[play_at_offsets]] with instrument=[[open_hihat]], offsets=[0], duration=0.25, bars=bars, velocity="decrescendo".
Let ltp = Call [[play_at_offsets]] with instrument=[[low_tom]], offsets=[1], duration=0.25, bars=bars, velocity="decrescendo".
Let mtp = Call [[play_at_offsets]] with instrument=[[mid_tom]], offsets=[1.5], duration=0.25, bars=bars, velocity="decrescendo".
Return Call [[voices_canonical]] with kp=kp, sp=sp, chp=chp, ohp=ohp, ltp=ltp, mtp=mtp.
