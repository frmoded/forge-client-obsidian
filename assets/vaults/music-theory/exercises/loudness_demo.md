---
type: action
inputs:
  - pattern
recipe_version: 1
python_hash: 74cc5286484d4d29b18b470645625ad2398a8839d4bad3cd10c3964f07fcdcca
description_hash: 436b50d8b877ee5ffb8bf3700112d3f9da735dc5573a5341e70e6b485daaec02
recipe_hash: 9833aa28650a39cabdbbea10f244ef94c8778bdddca6a0c6207bf058bfaf227d
recipe_derived_from_source_hash: 436b50d8b877ee5ffb8bf3700112d3f9da735dc5573a5341e70e6b485daaec02
python_derived_from_source_hash: 436b50d8b877ee5ffb8bf3700112d3f9da735dc5573a5341e70e6b485daaec02
source_facet: synced
recipe_derived_from_description_hash: 436b50d8b877ee5ffb8bf3700112d3f9da735dc5573a5341e70e6b485daaec02
python_derived_from_recipe_hash: 9833aa28650a39cabdbbea10f244ef94c8778bdddca6a0c6207bf058bfaf227d
---

# Description

Return a music21 Part playing four snare hits with velocity following `pattern` — same pitch every hit, only how hard each one lands changes. `pattern` is one of "crescendo" (starts quiet, ends loud), "decrescendo" (starts loud, ends quiet), "human" (small realistic random variation), "ghost" (uniformly quiet), or "accent" (uniformly loud). Concept refresher: [[notes/physics/loudness]].

## Inputs

- pattern — the velocity shape across the four hits: "crescendo", "decrescendo", "human", "ghost", "accent"

# Recipe

Let drum = Call [[snare]].
Return Call [[play_at_offsets]] with instrument=drum, offsets=[0, 1, 2, 3], duration=1.0, bars=1, time_signature="4/4", tempo_bpm=90, velocity=pattern.

# Python

```python
def compute(context, pattern):
  drum = snare()
  return play_at_offsets(instrument=drum, offsets=[0, 1, 2, 3], duration=1.0, bars=1, time_signature='4/4', tempo_bpm=90, velocity=pattern)
```
