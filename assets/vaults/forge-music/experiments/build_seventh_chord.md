---
type: action
inputs:
  - tonic
  - quality
recipe_version: 1
sync_state: synced
---

# Description

Return the pitch names of a chord built on `tonic` by stacking thirds past the triad. `quality` selects the stack: seventh chords — "maj7" (major 7th), "dom7" (dominant/flat 7th), "min7" (minor 7th), "half_dim7" (half-diminished, ø7), "dim7" (fully diminished 7th) — or extended dominant chords that keep stacking thirds — "dom9", "dom11", "dom13". Concept refresher: [[music_theory/chord/construction/seventh_chord]], [[music_theory/chord/construction/extension]].

# Recipe

Return {{ [p.nameWithOctave for p in [music21.pitch.Pitch(tonic).transpose(music21.interval.Interval(iv)) for iv in {"maj7": ["P1","M3","P5","M7"], "dom7": ["P1","M3","P5","m7"], "min7": ["P1","m3","P5","m7"], "half_dim7": ["P1","m3","d5","m7"], "dim7": ["P1","m3","d5","d7"], "dom9": ["P1","M3","P5","m7","M9"], "dom11": ["P1","M3","P5","m7","M9","P11"], "dom13": ["P1","M3","P5","m7","M9","P11","M13"]}[quality]]] }}.
