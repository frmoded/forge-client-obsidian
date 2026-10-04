---
type: action
description_hash: 8aaecfa415bb7256066f21225870611353cd418387b45e6b1dd258eb4f996af3
recipe_hash: 788c6cce4d86865b1313053e5e7dcd3dd11139f080b9ba86a1adc1476c257df8
python_hash: 4dbc6dd03755d44539a0328354ccdb1973e3127e17f0ee52e1503aea7cebfbb8
recipe_derived_from_source_hash: 8aaecfa415bb7256066f21225870611353cd418387b45e6b1dd258eb4f996af3
python_derived_from_source_hash: 8aaecfa415bb7256066f21225870611353cd418387b45e6b1dd258eb4f996af3
source_facet: description
recipe_derived_from_description_hash: 8aaecfa415bb7256066f21225870611353cd418387b45e6b1dd258eb4f996af3
python_derived_from_recipe_hash: 788c6cce4d86865b1313053e5e7dcd3dd11139f080b9ba86a1adc1476c257df8
recipe_version: 5
---

# Description

A starling flock at dusk. One bird turns; another follows; soon thousands move
as a single mind, then disperse back into the trees. This piece traces that
arc through pure percussion — no melodic content, no harmony, just rhythm
gathering and dispersing across ~80 seconds.

Eight 4-bar sections at 96 BPM in 4/4, symmetric around a peak: solitary kick
alone, companions joining on hi-hat, gathering snare with ghost notes,
swarming toms and open hi-hat, the peak with crash and full kit, dispersing as
the cymbals fade and toms drop, threading back to kick and soft snare, resting
with kick alone again. The arc is the piece.

Velocity carries the dynamic story: quiet at the edges, loud at the peak.
Articulation distinguishes closed-hi-hat calm from open-hi-hat punch. The 8
section notes live in `music-core/percussion_lab/` (imported cross-vault);
other pieces reuse them with different proportions.

## Inputs

(none)

# Recipe
Let kick_i = Call [[kick]].
Let snare_i = Call [[snare]].
Let hihat_i = Call [[closed_hihat]].
Let ohat_i = Call [[open_hihat]].
Let ltom_i = Call [[low_tom]].
Let mtom_i = Call [[mid_tom]].
Let crash_i = Call [[crash_cymbal]].

Let s1_kp = Call [[play_at_offsets]] with instrument=kick_i, offsets=[0, 2], duration=0.25, bars=4, time_signature="4/4", tempo_bpm=96, velocity=55, mark_dynamics=True.
Let s1 = Call [[voices_canonical]] with kp=s1_kp.

Let s2_kp = Call [[play_at_offsets]] with instrument=kick_i, offsets=[0, 2], duration=0.25, bars=4, time_signature="4/4", tempo_bpm=96, velocity=60, mark_dynamics=True.
Let s2_chp = Call [[play_at_offsets]] with instrument=hihat_i, offsets=[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], duration=0.25, bars=4, time_signature="4/4", tempo_bpm=96, velocity=45, mark_dynamics=True.
Let s2 = Call [[voices_canonical]] with kp=s2_kp, chp=s2_chp.

Let s3_kp = Call [[play_at_offsets]] with instrument=kick_i, offsets=[0, 1, 2, 3], duration=0.25, bars=4, time_signature="4/4", tempo_bpm=96, velocity=70, mark_dynamics=True.
Let s3_sp = Call [[play_at_offsets]] with instrument=snare_i, offsets=[1, 3], duration=0.25, bars=4, time_signature="4/4", tempo_bpm=96, velocity=65, mark_dynamics=True.
Let s3_chp = Call [[play_at_offsets]] with instrument=hihat_i, offsets=[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], duration=0.25, bars=4, time_signature="4/4", tempo_bpm=96, velocity=50, mark_dynamics=True.
Let s3 = Call [[voices_canonical]] with kp=s3_kp, sp=s3_sp, chp=s3_chp.

Let s4_kp = Call [[play_at_offsets]] with instrument=kick_i, offsets=[0, 0.5, 1, 2, 2.5, 3], duration=0.25, bars=4, time_signature="4/4", tempo_bpm=96, velocity=80, mark_dynamics=True.
Let s4_sp = Call [[play_at_offsets]] with instrument=snare_i, offsets=[1, 2, 3, 3.5], duration=0.25, bars=4, time_signature="4/4", tempo_bpm=96, velocity=75, mark_dynamics=True.
Let s4_chp = Call [[play_at_offsets]] with instrument=hihat_i, offsets=[0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75], duration=0.25, bars=4, time_signature="4/4", tempo_bpm=96, velocity=55, mark_dynamics=True.
Let s4_ohp = Call [[play_at_offsets]] with instrument=ohat_i, offsets=[2], duration=0.5, bars=4, time_signature="4/4", tempo_bpm=96, velocity=85, mark_dynamics=True.
Let s4_ltp = Call [[play_at_offsets]] with instrument=ltom_i, offsets=[0.5, 2.5], duration=0.25, bars=4, time_signature="4/4", tempo_bpm=96, velocity=70, mark_dynamics=True.
Let s4_mtp = Call [[play_at_offsets]] with instrument=mtom_i, offsets=[1.5, 3.5], duration=0.25, bars=4, time_signature="4/4", tempo_bpm=96, velocity=72, mark_dynamics=True.
Let s4 = Call [[voices_canonical]] with kp=s4_kp, sp=s4_sp, chp=s4_chp, ohp=s4_ohp, ltp=s4_ltp, mtp=s4_mtp.

Let s5_kp = Call [[play_at_offsets]] with instrument=kick_i, offsets=[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], duration=0.25, bars=4, time_signature="4/4", tempo_bpm=96, velocity=100, mark_dynamics=True.
Let s5_sp = Call [[play_at_offsets]] with instrument=snare_i, offsets=[1, 1.5, 2, 3, 3.5], duration=0.25, bars=4, time_signature="4/4", tempo_bpm=96, velocity=100, mark_dynamics=True.
Let s5_chp = Call [[play_at_offsets]] with instrument=hihat_i, offsets=[0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75], duration=0.25, bars=4, time_signature="4/4", tempo_bpm=96, velocity=80, mark_dynamics=True.
Let s5_ohp = Call [[play_at_offsets]] with instrument=ohat_i, offsets=[0, 1, 2, 3], duration=0.5, bars=4, time_signature="4/4", tempo_bpm=96, velocity=95, mark_dynamics=True.
Let s5_ltp = Call [[play_at_offsets]] with instrument=ltom_i, offsets=[0.5, 2.5], duration=0.25, bars=4, time_signature="4/4", tempo_bpm=96, velocity=90, mark_dynamics=True.
Let s5_mtp = Call [[play_at_offsets]] with instrument=mtom_i, offsets=[1, 3], duration=0.25, bars=4, time_signature="4/4", tempo_bpm=96, velocity=90, mark_dynamics=True.
Let s5_crp = Call [[play_at_offsets]] with instrument=crash_i, offsets=[0], duration=1.0, bars=4, time_signature="4/4", tempo_bpm=96, velocity=110, mark_dynamics=True.
Let s5 = Call [[voices_canonical]] with kp=s5_kp, sp=s5_sp, chp=s5_chp, ohp=s5_ohp, ltp=s5_ltp, mtp=s5_mtp, crp=s5_crp.

Let s6_kp = Call [[play_at_offsets]] with instrument=kick_i, offsets=[0, 0.5, 1, 2, 2.5, 3], duration=0.25, bars=4, time_signature="4/4", tempo_bpm=96, velocity=80, mark_dynamics=True.
Let s6_sp = Call [[play_at_offsets]] with instrument=snare_i, offsets=[1, 2, 3, 3.5], duration=0.25, bars=4, time_signature="4/4", tempo_bpm=96, velocity=72, mark_dynamics=True.
Let s6_chp = Call [[play_at_offsets]] with instrument=hihat_i, offsets=[0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75], duration=0.25, bars=4, time_signature="4/4", tempo_bpm=96, velocity=52, mark_dynamics=True.
Let s6_ohp = Call [[play_at_offsets]] with instrument=ohat_i, offsets=[2], duration=0.5, bars=4, time_signature="4/4", tempo_bpm=96, velocity=70, mark_dynamics=True.
Let s6_ltp = Call [[play_at_offsets]] with instrument=ltom_i, offsets=[0.5, 2.5], duration=0.25, bars=4, time_signature="4/4", tempo_bpm=96, velocity=65, mark_dynamics=True.
Let s6_mtp = Call [[play_at_offsets]] with instrument=mtom_i, offsets=[1.5, 3.5], duration=0.25, bars=4, time_signature="4/4", tempo_bpm=96, velocity=65, mark_dynamics=True.
Let s6 = Call [[voices_canonical]] with kp=s6_kp, sp=s6_sp, chp=s6_chp, ohp=s6_ohp, ltp=s6_ltp, mtp=s6_mtp.

Let s7_kp = Call [[play_at_offsets]] with instrument=kick_i, offsets=[0, 2], duration=0.25, bars=4, time_signature="4/4", tempo_bpm=96, velocity=62, mark_dynamics=True.
Let s7_sp = Call [[play_at_offsets]] with instrument=snare_i, offsets=[1, 3], duration=0.25, bars=4, time_signature="4/4", tempo_bpm=96, velocity=48, mark_dynamics=True.
Let s7_chp = Call [[play_at_offsets]] with instrument=hihat_i, offsets=[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], duration=0.25, bars=4, time_signature="4/4", tempo_bpm=96, velocity=40, mark_dynamics=True.
Let s7 = Call [[voices_canonical]] with kp=s7_kp, sp=s7_sp, chp=s7_chp.

Let s8_kp = Call [[play_at_offsets]] with instrument=kick_i, offsets=[0, 2], duration=0.25, bars=4, time_signature="4/4", tempo_bpm=96, velocity=50, mark_dynamics=True.
Let s8 = Call [[voices_canonical]] with kp=s8_kp.

Let full = Call [[sequence_list]] with sections=[s1, s2, s3, s4, s5, s6, s7, s8].
Return full.

# Python

```python
def compute(context):
  kick_i = kick()
  snare_i = snare()
  hihat_i = closed_hihat()
  ohat_i = open_hihat()
  ltom_i = low_tom()
  mtom_i = mid_tom()
  crash_i = crash_cymbal()
  s1_kp = play_at_offsets(instrument=kick_i, offsets=[0, 2], duration=0.25, bars=4, time_signature='4/4', tempo_bpm=96, velocity=55, mark_dynamics=True)
  s1 = voices_canonical(kp=s1_kp)
  s2_kp = play_at_offsets(instrument=kick_i, offsets=[0, 2], duration=0.25, bars=4, time_signature='4/4', tempo_bpm=96, velocity=60, mark_dynamics=True)
  s2_chp = play_at_offsets(instrument=hihat_i, offsets=[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], duration=0.25, bars=4, time_signature='4/4', tempo_bpm=96, velocity=45, mark_dynamics=True)
  s2 = voices_canonical(kp=s2_kp, chp=s2_chp)
  s3_kp = play_at_offsets(instrument=kick_i, offsets=[0, 1, 2, 3], duration=0.25, bars=4, time_signature='4/4', tempo_bpm=96, velocity=70, mark_dynamics=True)
  s3_sp = play_at_offsets(instrument=snare_i, offsets=[1, 3], duration=0.25, bars=4, time_signature='4/4', tempo_bpm=96, velocity=65, mark_dynamics=True)
  s3_chp = play_at_offsets(instrument=hihat_i, offsets=[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], duration=0.25, bars=4, time_signature='4/4', tempo_bpm=96, velocity=50, mark_dynamics=True)
  s3 = voices_canonical(kp=s3_kp, sp=s3_sp, chp=s3_chp)
  s4_kp = play_at_offsets(instrument=kick_i, offsets=[0, 0.5, 1, 2, 2.5, 3], duration=0.25, bars=4, time_signature='4/4', tempo_bpm=96, velocity=80, mark_dynamics=True)
  s4_sp = play_at_offsets(instrument=snare_i, offsets=[1, 2, 3, 3.5], duration=0.25, bars=4, time_signature='4/4', tempo_bpm=96, velocity=75, mark_dynamics=True)
  s4_chp = play_at_offsets(instrument=hihat_i, offsets=[0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75], duration=0.25, bars=4, time_signature='4/4', tempo_bpm=96, velocity=55, mark_dynamics=True)
  s4_ohp = play_at_offsets(instrument=ohat_i, offsets=[2], duration=0.5, bars=4, time_signature='4/4', tempo_bpm=96, velocity=85, mark_dynamics=True)
  s4_ltp = play_at_offsets(instrument=ltom_i, offsets=[0.5, 2.5], duration=0.25, bars=4, time_signature='4/4', tempo_bpm=96, velocity=70, mark_dynamics=True)
  s4_mtp = play_at_offsets(instrument=mtom_i, offsets=[1.5, 3.5], duration=0.25, bars=4, time_signature='4/4', tempo_bpm=96, velocity=72, mark_dynamics=True)
  s4 = voices_canonical(kp=s4_kp, sp=s4_sp, chp=s4_chp, ohp=s4_ohp, ltp=s4_ltp, mtp=s4_mtp)
  s5_kp = play_at_offsets(instrument=kick_i, offsets=[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], duration=0.25, bars=4, time_signature='4/4', tempo_bpm=96, velocity=100, mark_dynamics=True)
  s5_sp = play_at_offsets(instrument=snare_i, offsets=[1, 1.5, 2, 3, 3.5], duration=0.25, bars=4, time_signature='4/4', tempo_bpm=96, velocity=100, mark_dynamics=True)
  s5_chp = play_at_offsets(instrument=hihat_i, offsets=[0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75], duration=0.25, bars=4, time_signature='4/4', tempo_bpm=96, velocity=80, mark_dynamics=True)
  s5_ohp = play_at_offsets(instrument=ohat_i, offsets=[0, 1, 2, 3], duration=0.5, bars=4, time_signature='4/4', tempo_bpm=96, velocity=95, mark_dynamics=True)
  s5_ltp = play_at_offsets(instrument=ltom_i, offsets=[0.5, 2.5], duration=0.25, bars=4, time_signature='4/4', tempo_bpm=96, velocity=90, mark_dynamics=True)
  s5_mtp = play_at_offsets(instrument=mtom_i, offsets=[1, 3], duration=0.25, bars=4, time_signature='4/4', tempo_bpm=96, velocity=90, mark_dynamics=True)
  s5_crp = play_at_offsets(instrument=crash_i, offsets=[0], duration=1.0, bars=4, time_signature='4/4', tempo_bpm=96, velocity=110, mark_dynamics=True)
  s5 = voices_canonical(kp=s5_kp, sp=s5_sp, chp=s5_chp, ohp=s5_ohp, ltp=s5_ltp, mtp=s5_mtp, crp=s5_crp)
  s6_kp = play_at_offsets(instrument=kick_i, offsets=[0, 0.5, 1, 2, 2.5, 3], duration=0.25, bars=4, time_signature='4/4', tempo_bpm=96, velocity=80, mark_dynamics=True)
  s6_sp = play_at_offsets(instrument=snare_i, offsets=[1, 2, 3, 3.5], duration=0.25, bars=4, time_signature='4/4', tempo_bpm=96, velocity=72, mark_dynamics=True)
  s6_chp = play_at_offsets(instrument=hihat_i, offsets=[0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75], duration=0.25, bars=4, time_signature='4/4', tempo_bpm=96, velocity=52, mark_dynamics=True)
  s6_ohp = play_at_offsets(instrument=ohat_i, offsets=[2], duration=0.5, bars=4, time_signature='4/4', tempo_bpm=96, velocity=70, mark_dynamics=True)
  s6_ltp = play_at_offsets(instrument=ltom_i, offsets=[0.5, 2.5], duration=0.25, bars=4, time_signature='4/4', tempo_bpm=96, velocity=65, mark_dynamics=True)
  s6_mtp = play_at_offsets(instrument=mtom_i, offsets=[1.5, 3.5], duration=0.25, bars=4, time_signature='4/4', tempo_bpm=96, velocity=65, mark_dynamics=True)
  s6 = voices_canonical(kp=s6_kp, sp=s6_sp, chp=s6_chp, ohp=s6_ohp, ltp=s6_ltp, mtp=s6_mtp)
  s7_kp = play_at_offsets(instrument=kick_i, offsets=[0, 2], duration=0.25, bars=4, time_signature='4/4', tempo_bpm=96, velocity=62, mark_dynamics=True)
  s7_sp = play_at_offsets(instrument=snare_i, offsets=[1, 3], duration=0.25, bars=4, time_signature='4/4', tempo_bpm=96, velocity=48, mark_dynamics=True)
  s7_chp = play_at_offsets(instrument=hihat_i, offsets=[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], duration=0.25, bars=4, time_signature='4/4', tempo_bpm=96, velocity=40, mark_dynamics=True)
  s7 = voices_canonical(kp=s7_kp, sp=s7_sp, chp=s7_chp)
  s8_kp = play_at_offsets(instrument=kick_i, offsets=[0, 2], duration=0.25, bars=4, time_signature='4/4', tempo_bpm=96, velocity=50, mark_dynamics=True)
  s8 = voices_canonical(kp=s8_kp)
  full = sequence_list(sections=[s1, s2, s3, s4, s5, s6, s7, s8])
  return full

```
