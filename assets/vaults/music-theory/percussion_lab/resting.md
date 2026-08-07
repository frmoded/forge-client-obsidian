---
type: action
---

# Description

The flock at rest. Kick alone — slow, sparse. Bar 1 has two hits (beats 1
and 3); bars 2-4 have only beat 1. The section settles toward stillness.
Same instrument vocabulary as `solitary` but quieter (`p`-band velocity 50)
and rhythmically sparser.

## Inputs

- bars (default 4) — section length; cycles the asymmetric 4-bar kick

# Recipe

Let kp = Call [[play_at_offsets]] with instrument=[[kick]], offsets=[[0, 2], [0], [0], [0]], duration=0.25, bars=bars, velocity=50, mark_dynamics=True.
Return Call [[voices_canonical]] with kp=kp.
