---
type: action
inputs:
  - tonic
  - quality
recipe_version: 1
sync_state: synced
---

# Description

Return the three pitch names of a triad built on `tonic` with the given `quality` — root, third, and fifth, each an interval above the tonic. `quality` is one of "major" (major 3rd + perfect 5th), "minor" (minor 3rd + perfect 5th), "diminished" (minor 3rd + diminished 5th), or "augmented" (major 3rd + augmented 5th). Concept refresher: [[music_theory/chord/construction/triad]], [[music_theory/chord/construction/chord_quality]], [[music_theory/chord/construction/root]].

# Recipe

Return {{ [p.nameWithOctave for p in [music21.pitch.Pitch(tonic).transpose(music21.interval.Interval(iv)) for iv in {"major": ["P1","M3","P5"], "minor": ["P1","m3","P5"], "diminished": ["P1","m3","d5"], "augmented": ["P1","M3","A5"]}[quality]]] }}.
