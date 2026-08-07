---
type: action
inputs: [notes]
input_widgets:
  notes: piano
---

# Description
Click keys on the piano. Forge will play them back.

# Recipe
Return Call [[play_pitches]] with pitches=notes.
