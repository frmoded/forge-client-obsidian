---
type: action
english_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
python_hash: 39c45abc8414dcd7e1d052ca6e9f1b0bd6e3615a6989785b580e10fa8439974f
description_hash: fcca3feecc947060e25081f5d10612d67d6d983f1ee5d5b2f1bd02dda7595a09
recipe_hash: 6031f26ad28a5126d160cbdfdf346361911a294cabf9e538e0eee1df643dd2a9
recipe_derived_from_source_hash: fcca3feecc947060e25081f5d10612d67d6d983f1ee5d5b2f1bd02dda7595a09
python_derived_from_source_hash: fcca3feecc947060e25081f5d10612d67d6d983f1ee5d5b2f1bd02dda7595a09
source_facet: synced
recipe_derived_from_description_hash: fcca3feecc947060e25081f5d10612d67d6d983f1ee5d5b2f1bd02dda7595a09
python_derived_from_recipe_hash: 6031f26ad28a5126d160cbdfdf346361911a294cabf9e538e0eee1df643dd2a9
---

# Description

F Shuffle — a 12-bar shuffle blues in F, one chorus. Medium tempo
(around 104 BPM to the dotted quarter, 12/8 shuffle feel). The piano
comps the standard 12-bar harmonic frame; a walking double bass
outlines each chord — root, third, fifth, then a chromatic approach
into the next bar — and the shuffle kit sits underneath: kick on
beats 1 and 3, snare answering on 2 and 4, hi-hat marking every beat.

The classic head-nodding shuffle backbone, resolved in F major.

## Inputs

(none)

# Recipe

Let harmony = Call [[form]] with key_name="F", mode_name="major", tempo_bpm=104.
Let bass = Call [[walking_bass_line]] with harmony=harmony, style="swing".
Let drums = Call [[drums_shuffle]].
Return Call [[voices_list]] with sections=[harmony, bass, drums].

# Python

```python
def compute(context):
  harmony = form(key_name='F', mode_name='major', tempo_bpm=104)
  bass = walking_bass_line(harmony=harmony, style='swing')
  drums = drums_shuffle()
  return voices_list(sections=[harmony, bass, drums])

```

# Dependencies

*Synced from Python. Edit the Python and regenerate, or run "Forge: Sync edges" to refresh.*

[[form]] [[walking_bass_line]] [[drums_shuffle]] [[voices_list]]
