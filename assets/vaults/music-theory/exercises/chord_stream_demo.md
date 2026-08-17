---
type: action
inputs:
  - progression_choice
input_enums:
  progression_choice:
    - "I-IV-V-I (C major)"
    - "ii-V-I (C major)"
    - "12-bar blues (C)"
    - "Canon in D"
---

# Description

A demo of [[chord_stream]]: pick a canonical chord progression from the
dropdown and hear it, one whole note per chord at moderate tempo.

Four progressions that carry most of Western harmony: the primary-triad
cadence, the jazz turnaround, the twelve-bar blues, and Pachelbel's
canon ground bass. Try ii-V-I against I-IV-V-I to hear what the
predominant seventh chord adds.

# Recipe

Let chords = {{ {"I-IV-V-I (C major)": [["C4","E4","G4"], ["F4","A4","C5"], ["G4","B4","D5"], ["C4","E4","G4"]], "ii-V-I (C major)": [["D4","F4","A4"], ["G4","B4","D5"], ["C4","E4","G4"]], "12-bar blues (C)": [["C4","E4","G4","Bb4"], ["F4","A4","C5","Eb5"], ["C4","E4","G4","Bb4"], ["C4","E4","G4","Bb4"], ["F4","A4","C5","Eb5"], ["F4","A4","C5","Eb5"], ["C4","E4","G4","Bb4"], ["C4","E4","G4","Bb4"], ["G4","B4","D5","F5"], ["F4","A4","C5","Eb5"], ["C4","E4","G4","Bb4"], ["G4","B4","D5","F5"]], "Canon in D": [["D4","F#4","A4"], ["A3","C#4","E4"], ["B3","D4","F#4"], ["F#3","A3","C#4"], ["G3","B3","D4"], ["D3","F#3","A3"], ["G3","B3","D4"], ["A3","C#4","E4"]]}[progression_choice] }}.
Return Call [[chord_stream]] with chords=chords.
