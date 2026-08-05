---
type: action
inputs: [contour_choice]
input_enums:
  contour_choice: ["ascending", "descending", "arch", "valley"]
---

# Description

A demo of [[melodic_line]]: pick a contour shape from the dropdown and
hear a four-note phrase over C major at moderate tempo.

Where [[rhythmic_line]] holds the pitch still so you hear only the
rhythm, this holds the rhythm still — every contour is the same
`q q q h` — so the only thing changing is the shape of the line. Try
`arch` against `valley` to hear how much a phrase's character is the
direction it travels.

# Recipe

Let pitches = {{ {"ascending": ["C4", "E4", "G4", "C5"], "descending": ["C5", "G4", "E4", "C4"], "arch": ["C4", "E4", "G4", "E4"], "valley": ["G4", "E4", "C4", "E4"]}[contour_choice] }}.
Return Call [[melodic_line]] with pattern=["q", "q", "q", "h"], pitches=pitches.
