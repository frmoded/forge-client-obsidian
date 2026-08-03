---
type: action
inputs: [guess]
input_enums:
  guess: ["major", "minor", "diminished", "augmented"]
---

# Description

Which scale quality is built from the intervals **W‑W‑H‑W‑W‑W‑H** (whole, whole, half, whole, whole, whole, half)?

Pick from the dropdown and press **Run**. Concept refresher: [[music_theory/scales/scale]].

# Recipe

Let choices = ["major", "minor", "diminished", "augmented"].
Let guess_index = {{ choices.index(guess) }}.
Return Call [[mcq]] with question="Which quality has intervals W-W-H-W-W-W-H?", choices=choices, correct_index=0, guess=guess_index, explanation="The W-W-H-W-W-W-H pattern is the definition of the major scale — see [[music_theory/scales/scale]].".
