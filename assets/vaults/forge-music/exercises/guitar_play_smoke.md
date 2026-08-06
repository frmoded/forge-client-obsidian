---
type: action
inputs: [notes]
input_widgets:
  notes: guitar_fretboard
---

# Description
Pick notes on the fretboard. Forge will play them back.

# Recipe
Return Call [[play_pitches]] with pitches=notes.
