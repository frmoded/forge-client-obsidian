---
type: action
description_hash: 98d697e37b7f417a500c61622dfc5e278a5a5cff4796c5d0626846f210ceed1d
recipe_hash: 75c96c6e0dce690bca1f92aae2e0001a677560ee8aba953bb4f8c207338bfbe1
python_hash: 3301973f8cc5fdef58987b248a3f8786ee07047e2361d91cb818c6724b6aafd2
recipe_derived_from_source_hash: 98d697e37b7f417a500c61622dfc5e278a5a5cff4796c5d0626846f210ceed1d
python_derived_from_source_hash: 98d697e37b7f417a500c61622dfc5e278a5a5cff4796c5d0626846f210ceed1d
source_facet: synced
recipe_derived_from_description_hash: 98d697e37b7f417a500c61622dfc5e278a5a5cff4796c5d0626846f210ceed1d
english_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
python_derived_from_recipe_hash: 75c96c6e0dce690bca1f92aae2e0001a677560ee8aba953bb4f8c207338bfbe1
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
section notes live in `percussion_lab/`; other pieces reuse them with
different proportions.

## Inputs

(none)

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
