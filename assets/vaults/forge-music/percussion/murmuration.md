---
type: action
english_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
---

# Description

A starling flock at dusk. One bird turns; another follows; soon thousands move
as a single mind, then disperse back into the trees. This piece traces that
arc through pure percussion — no melodic content, no harmony, just rhythm
gathering and dispersing across ~80 seconds.

Eight 4-bar sections at 96 BPM in 4/4, structured symmetrically around a peak:

1. [[solitary]](bars=4) — bars 1-4. Just the kick — one bird, slow turns.
2. [[companions]](bars=4) — bars 5-8. Add closed hi-hat — a few birds joining.
3. [[gathering]](bars=4) — bars 9-12. Add snare with ghost notes — dozens.
4. [[swarming]](bars=4) — bars 13-16. Add toms + open hi-hat punches.
5. [[peak]](bars=4) — bars 17-20. The murmuration peak — crash + full kit.
6. [[dispersing]](bars=4) — bars 21-24. Cymbal fades, toms drop, settling.
7. [[threading]](bars=4) — bars 25-28. Back to kick + hi-hat + soft snare.
8. [[resting]](bars=4) — bars 29-32. Kick alone again; last hit, then silence.

The arc is the piece. Velocity carries the dynamic story: quiet at the edges,
loud at the peak. Articulation distinguishes closed-hi-hat calm from open-hi-hat
punch. Decomposed into 8 callable section snippets in `percussion_lab/` so
other pieces (like [[wake]]) can use the same vocabulary with different
proportions.

## Inputs

(none)

## Mechanics

Compose 8 fixed 4-bar sections via `sequence_list`. The arc — quiet → climax →
fade → silence — is what the listener hears. Each section is its own snippet;
this file just orchestrates them.

# Recipe

Let s1 = Call [[solitary]] with bars=4.
Let s2 = Call [[companions]] with bars=4.
Let s3 = Call [[gathering]] with bars=4.
Let s4 = Call [[swarming]] with bars=4.
Let s5 = Call [[peak]] with bars=4.
Let s6 = Call [[dispersing]] with bars=4.
Let s7 = Call [[threading]] with bars=4.
Let s8 = Call [[resting]] with bars=4.
Return Call [[sequence_list]] with sections=[s1, s2, s3, s4, s5, s6, s7, s8].

# Python

```python
def compute(context):
  s1 = solitary(bars=4)
  s2 = companions(bars=4)
  s3 = gathering(bars=4)
  s4 = swarming(bars=4)
  s5 = peak(bars=4)
  s6 = dispersing(bars=4)
  s7 = threading(bars=4)
  s8 = resting(bars=4)
  return sequence_list(sections=[s1, s2, s3, s4, s5, s6, s7, s8])

```
