---
type: action
inputs:
  - pattern
recipe_version: 1
sync_state: synced
---

# Description

Return a music21 Part playing four snare hits with velocity following `pattern` — same pitch every hit, only how hard each one lands changes. `pattern` is one of "crescendo" (starts quiet, ends loud), "decrescendo" (starts loud, ends quiet), "human" (small realistic random variation), "ghost" (uniformly quiet), or "accent" (uniformly loud). Concept refresher: [[music_theory/note/physics/loudness]].

# Recipe

Let drum = Call [[snare]].
Return Call [[play_at_offsets]] with instrument=drum, offsets=[0, 1, 2, 3], duration=1.0, bars=1, time_signature="4/4", tempo_bpm=90, velocity=pattern.
