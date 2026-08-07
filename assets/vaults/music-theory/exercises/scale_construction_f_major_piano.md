---
type: action
inputs:
  - student_pitches
input_widgets:
  student_pitches: piano
sync_state: synced
---

# Description

Click the seven notes of the F major scale on the piano, from the tonic
(F3) up to the seventh (E4). Then click Forge to grade your attempt.

F major's one black key is a FLAT — the fourth degree, Bb. On the
keyboard it's the same key you may know as A#; in F major it's written
Bb, and the grader accepts the key either way.

# Recipe

Return Call [[scale_construction_exercise]] with tonic="F3", mode="major", student_pitches=student_pitches, widget_type="piano".
