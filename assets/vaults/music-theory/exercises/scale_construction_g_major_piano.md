---
type: action
inputs:
  - student_pitches
input_widgets:
  student_pitches: piano
---

# Description

Click the seven notes of the G major scale on the piano, from the tonic
(G3) up to the seventh (F#4). Then click Forge to grade your attempt.

Same W-W-H-W-W-W pattern as C major, transposed to start on G — which
forces exactly one black key. Find it.

# Recipe

Return Call [[scale_construction_exercise]] with tonic="G3", mode="major", student_pitches=student_pitches, widget_type="piano".
