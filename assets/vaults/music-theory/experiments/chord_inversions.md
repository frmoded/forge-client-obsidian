---
type: action
inputs:
  - tonic
  - quality
  - inversion
recipe_version: 1
sync_state: synced
---

# Description

Return the three pitch names of a `quality` triad on `tonic`, reordered for `inversion` (0 = root position, 1 = first inversion, 2 = second inversion) — the same three chord tones with a different one in the bass each time; the note(s) moved out of the bass are pushed up an octave so the list stays ascending. Concept refresher: [[music_theory/chord/construction/inversion]], [[music_theory/chord/construction/voicing]].

# Recipe

Return {{ (lambda ps: [p.nameWithOctave for p in (ps[inversion:] + [p.transpose('P8') for p in ps[:inversion]])])([music21.pitch.Pitch(tonic).transpose(music21.interval.Interval(iv)) for iv in {"major": ["P1","M3","P5"], "minor": ["P1","m3","P5"], "diminished": ["P1","m3","d5"], "augmented": ["P1","M3","A5"]}[quality]]) }}.
