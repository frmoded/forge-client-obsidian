---
type: action
inputs: [guess]
source_facet: description
description_hash: e4062f7f88e7884be2ab9171c042b9417fb79ef9299d8fbcac5d1cef31f4f62e
recipe_hash: f87ba2f2b90c025567f3d41e2aacf2acc61ca14aaaa84e0c25c2db4232e55624
python_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
recipe_derived_from_description_hash: e4062f7f88e7884be2ab9171c042b9417fb79ef9299d8fbcac5d1cef31f4f62e
recipe_derived_from_source_hash: e4062f7f88e7884be2ab9171c042b9417fb79ef9299d8fbcac5d1cef31f4f62e
python_derived_from_recipe_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
python_derived_from_source_hash: e4062f7f88e7884be2ab9171c042b9417fb79ef9299d8fbcac5d1cef31f4f62e
recipe_version: 1
---

# Description

Complete the C major scale you heard in [[exercises/complete_this_scale_challenge]]. Using the major interval pattern (W‑W‑H‑W‑W‑W‑H), work out the four notes that finish the octave after C‑D‑E‑F and set them as your `guess` — e.g. `["G4", "A4", "B4", "C5"]`. Press **Run** for note-by-note feedback. Concept refresher: [[scales/Scales]].

## Inputs

- guess — the four notes you think complete the octave, e.g. ["G4", "A4", "B4", "C5"]

# Recipe

Let true_tonic = "C".
Let true_mode = "major".
Let scale = Call [[diatonic_scale]] with tonic=true_tonic, mode=true_mode.
Return {{ ("Correct! Right scale degrees — the full C major scale is " + str(scale) + ".") if [g.rstrip("0123456789") for g in guess] == [e.rstrip("0123456789") for e in scale[4:]] else ((("You gave " + str(len(guess)) + " note(s); the octave needs " + str(len(scale[4:])) + " to finish. ") if len(guess) != len(scale[4:]) else "") + "Not yet — note by note: " + str([(g + " — OK" if (i < len(scale[4:]) and g == scale[4:][i]) else (g + " — right note, wrong octave" if (i < len(scale[4:]) and g.rstrip("0123456789") == scale[4:][i].rstrip("0123456789")) else (g + " — not in the scale here" if i < len(scale[4:]) else g + " — extra note"))) for i, g in enumerate(guess)]) + ". Hint: from F, the major pattern finishes whole-whole-whole-half — apply those four steps to find the last four notes.") }}.
