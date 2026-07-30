---
type: action
inputs:
  - tonic
recipe_version: 1
sync_state: synced
---

# Description

Return the three notes of the major triad rooted at a given tonic — root, third, and fifth — as a list of pitch names. Given a tonic note name (e.g. "C", "F#", "Bb"), return the three pitch-class names of the major triad built on it: the root, the major third above it, and the perfect fifth above it. Pitch names use music21 spelling (flats written with `-`, e.g. "B-").

## Inputs

- tonic — tonic note name string (e.g. "C", "F#", "Bb")

# Recipe

Let scale = Call [[major_scale]] with tonic=tonic.
Return {{ [scale[i] for i in [0, 2, 4]] }}.
