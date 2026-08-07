---
type: action
inputs: [guess]
  - guess
recipe_version: 2
sync_state: stale-python
description_hash: 811c7ef37cb8645ceceb9c36d03ad7f1b4d2326224092d350fc3040fab83bc7f
recipe_hash: 2fabe06fc68fda752ae35b0c35abe8f71688d78fe7aaccd834d68abbdb35fb90
python_hash: 1ec55b539e21947ce1da46444f38099001010980fdf3035e1d320ed5a5632a09
recipe_derived_from_source_hash: 811c7ef37cb8645ceceb9c36d03ad7f1b4d2326224092d350fc3040fab83bc7f
python_derived_from_source_hash: 811c7ef37cb8645ceceb9c36d03ad7f1b4d2326224092d350fc3040fab83bc7f
source_facet: python
recipe_derived_from_description_hash: 811c7ef37cb8645ceceb9c36d03ad7f1b4d2326224092d350fc3040fab83bc7f
english_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
python_derived_from_recipe_hash: 2fabe06fc68fda752ae35b0c35abe8f71688d78fe7aaccd834d68abbdb35fb90
---

# Description

Complete the C major scale you heard in [[music_theory/exercises/complete_this_scale_challenge]]. Using the major interval pattern (W‑W‑H‑W‑W‑W‑H), work out the four notes that finish the octave after C‑D‑E‑F and set them as your `guess` — e.g. `["G4", "A4", "B4", "C5"]`. Press **Run** for note-by-note feedback. Concept refresher: [[music_theory/scales/scale]].

# Recipe
Let true_tonic = "C".
Let true_mode = "major".
Let scale = Call [[diatonic_scale]] with tonic=true_tonic, mode=true_mode.
Return {{ ("Correct! Right scale degrees — the full C major scale is " + str(scale) + ".") if [g.rstrip("0123456789") for g in guess] == [e.rstrip("0123456789") for e in scale[4:]] else ((("You gave " + str(len(guess)) + " note(s); the octave needs " + str(len(scale[4:])) + " to finish. ") if len(guess) != len(scale[4:]) else "") + "Not yet — note by note: " + str([(g + " — OK" if (i < len(scale[4:]) and g == scale[4:][i]) else (g + " — right note, wrong octave" if (i < len(scale[4:]) and g.rstrip("0123456789") == scale[4:][i].rstrip("0123456789")) else (g + " — not in the scale here" if i < len(scale[4:]) else g + " — extra note"))) for i, g in enumerate(guess)]) + ". Hint: from F, the major pattern finishes whole-whole-whole-half — apply those four steps to find the last four notes.") }}.

# Python

```python
def compute(context):
  true_tonic = 'C'
  true_mode = 'major'
  scale = diatonic_scale(tonic=true_tonic, mode=true_mode)
  return guess == scale[4:]

```
