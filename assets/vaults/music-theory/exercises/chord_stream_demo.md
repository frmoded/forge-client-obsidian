---
type: action
inputs:
  - progression_choice
input_enums:
  progression_choice:
    - I-IV-V-I (C major)
    - ii-V-I (C major)
    - 12-bar blues (C)
    - Canon in D
description_hash: 613b71baf2f37dce151423ff45177e856c6dbe1696108a56b183aa7ef3a494a1
recipe_hash: 4f387ab9f0ec345a0646982beb57b52dbf2dbda9fb044573a29803957e5f1fa5
python_hash: 6407e05ffee72fbd333b0d6e33553a54f9fe76fb370dbd0c0a2317094f4c2950
recipe_derived_from_source_hash: 613b71baf2f37dce151423ff45177e856c6dbe1696108a56b183aa7ef3a494a1
source_facet: recipe
recipe_derived_from_description_hash: 613b71baf2f37dce151423ff45177e856c6dbe1696108a56b183aa7ef3a494a1
python_derived_from_recipe_hash: 4f387ab9f0ec345a0646982beb57b52dbf2dbda9fb044573a29803957e5f1fa5
python_derived_from_source_hash: 613b71baf2f37dce151423ff45177e856c6dbe1696108a56b183aa7ef3a494a1
---

# Description

A demo of [[chord_stream]]: pick a canonical chord progression from the
dropdown and hear it, one whole note per chord at moderate tempo.

Four progressions that carry most of Western harmony: the primary-triad
cadence, the jazz turnaround, the twelve-bar blues, and Pachelbel's
canon ground bass. Try ii-V-I against I-IV-V-I to hear what the
predominant seventh chord adds.

## Inputs

- progression_choice — which chord progression to play, picked from a dropdown ("I-IV-V-I (C major)", "ii-V-I (C major)", "12-bar blues (C)", "Canon in D")

# Recipe

Input progression_choice: "I-IV-V-I (C major)" | "ii-V-I (C major)" | "12-bar blues (C)" | "Canon in D" = "I-IV-V-I (C major)".
If progression_choice == "I-IV-V-I (C major)":
    Let chords = [["C4","E4","G4"], ["F4","A4","C5"], ["G4","B4","D5"], ["C4","E4","G4"]].
Otherwise:
    If progression_choice == "ii-V-I (C major)":
        Let chords = [["D4","F4","A4"], ["G4","B4","D5"], ["C4","E4","G4"]].
    Otherwise:
        If progression_choice == "12-bar blues (C)":
            Let chords = [["C4","E4","G4","Bb4"], ["F4","A4","C5","Eb5"], ["C4","E4","G4","Bb4"], ["C4","E4","G4","Bb4"], ["F4","A4","C5","Eb5"], ["F4","A4","C5","Eb5"], ["C4","E4","G4","Bb4"], ["C4","E4","G4","Bb4"], ["G4","B4","D5","F5"], ["F4","A4","C5","Eb5"], ["C4","E4","G4","Bb4"], ["G4","B4","D5","F5"]].
        Otherwise:
            Let chords = [["D4","F#4","A4"], ["A3","C#4","E4"], ["B3","D4","F#4"], ["F#3","A3","C#4"], ["G3","B3","D4"], ["D3","F#3","A3"], ["G3","B3","D4"], ["A3","C#4","E4"]].
Return Call [[chord_stream]] with chords=chords.

# Python

```python
from typing import Literal

def compute(context, progression_choice: Literal['I-IV-V-I (C major)', 'ii-V-I (C major)', '12-bar blues (C)', 'Canon in D'] = 'I-IV-V-I (C major)'):
  if (progression_choice == 'I-IV-V-I (C major)'):
    chords = [['C4', 'E4', 'G4'], ['F4', 'A4', 'C5'], ['G4', 'B4', 'D5'], ['C4', 'E4', 'G4']]
  else:
    if (progression_choice == 'ii-V-I (C major)'):
      chords = [['D4', 'F4', 'A4'], ['G4', 'B4', 'D5'], ['C4', 'E4', 'G4']]
    else:
      if (progression_choice == '12-bar blues (C)'):
        chords = [['C4', 'E4', 'G4', 'Bb4'], ['F4', 'A4', 'C5', 'Eb5'], ['C4', 'E4', 'G4', 'Bb4'], ['C4', 'E4', 'G4', 'Bb4'], ['F4', 'A4', 'C5', 'Eb5'], ['F4', 'A4', 'C5', 'Eb5'], ['C4', 'E4', 'G4', 'Bb4'], ['C4', 'E4', 'G4', 'Bb4'], ['G4', 'B4', 'D5', 'F5'], ['F4', 'A4', 'C5', 'Eb5'], ['C4', 'E4', 'G4', 'Bb4'], ['G4', 'B4', 'D5', 'F5']]
      else:
        chords = [['D4', 'F#4', 'A4'], ['A3', 'C#4', 'E4'], ['B3', 'D4', 'F#4'], ['F#3', 'A3', 'C#4'], ['G3', 'B3', 'D4'], ['D3', 'F#3', 'A3'], ['G3', 'B3', 'D4'], ['A3', 'C#4', 'E4']]
  return chord_stream(chords=chords)
```
