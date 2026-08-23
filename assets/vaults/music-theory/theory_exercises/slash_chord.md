---
type: action
inputs:
  - chord_tonic
  - quality
  - bass
recipe_version: 1
---

# Description

Return a slash-chord voicing: `bass` (dropped an octave, so it sits under everything else) followed by the `quality` triad built on `chord_tonic` — the sound behind notation like Fm/C. The chord's identity comes entirely from `chord_tonic` + `quality`; `bass` is controlled independently and doesn't have to be a note in the chord. Concept refresher: [[chord/notation/slash_chord]].

## Inputs

- chord_tonic — the triad's root note, e.g. "C4"
- quality — the triad type: "major", "minor", "diminished", "augmented"
- bass — the bass note under the triad, e.g. "F2" (need not be a chord tone)

# Recipe

Return {{ [music21.pitch.Pitch(bass).transpose(-12).nameWithOctave] + [p.nameWithOctave for p in [music21.pitch.Pitch(chord_tonic).transpose(music21.interval.Interval(iv)) for iv in {"major": ["P1","M3","P5"], "minor": ["P1","m3","P5"], "diminished": ["P1","m3","d5"], "augmented": ["P1","M3","A5"]}[quality]]] }}.
