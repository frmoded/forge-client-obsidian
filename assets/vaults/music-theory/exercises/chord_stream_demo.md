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
recipe_hash: 82cf0f835cfb3ef94a7dfb720ddcf57a5aaf8b9cd415c117f055db065e8d3b9d
python_hash: 851df39327d0b45ede6f852ff3dd730ed72c3fa247c47c13d5a3d0e2c034e966
recipe_derived_from_source_hash: 613b71baf2f37dce151423ff45177e856c6dbe1696108a56b183aa7ef3a494a1
source_facet: description
recipe_derived_from_description_hash: 613b71baf2f37dce151423ff45177e856c6dbe1696108a56b183aa7ef3a494a1
python_derived_from_recipe_hash: 82cf0f835cfb3ef94a7dfb720ddcf57a5aaf8b9cd415c117f055db065e8d3b9d
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

Let chords = {{ {"I-IV-V-I (C major)": [["C4","E4","G4"], ["F4","A4","C5"], ["G4","B4","D5"], ["C4","E4","G4"]], "ii-V-I (C major)": [["D4","F4","A4"], ["G4","B4","D5"], ["C4","E4","G4"]], "12-bar blues (C)": [["C4","E4","G4","Bb4"], ["F4","A4","C5","Eb5"], ["C4","E4","G4","Bb4"], ["C4","E4","G4","Bb4"], ["F4","A4","C5","Eb5"], ["F4","A4","C5","Eb5"], ["C4","E4","G4","Bb4"], ["C4","E4","G4","Bb4"], ["G4","B4","D5","F5"], ["F4","A4","C5","Eb5"], ["C4","E4","G4","Bb4"], ["G4","B4","D5","F5"]], "Canon in D": [["D4","F#4","A4"], ["A3","C#4","E4"], ["B3","D4","F#4"], ["F#3","A3","C#4"], ["G3","B3","D4"], ["D3","F#3","A3"], ["G3","B3","D4"], ["A3","C#4","E4"]]}[progression_choice] }}.
Return Call [[chord_stream]] with chords=chords.

# Python

```python
def compute(context, progression_choice):
    progressions = {
        "I-IV-V-I":      ["C", "F", "G", "C"],
        "ii-V-I":        ["Dm", "G7", "C"],
        "12-bar-blues":  ["C7", "C7", "C7", "C7",
                          "F7", "F7", "C7", "C7",
                          "G7", "F7", "C7", "G7"],
        "canon":         ["D", "A", "Bm", "F#m",
                          "G", "D", "G", "A"],
    }

    chosen = progression_choice if progression_choice in progressions else "I-IV-V-I"
    chord_symbols = progressions[chosen]

    ts = meter.TimeSignature("4/4")
    ks = key.Key("C", "major")
    mm = tempo.MetronomeMark(number=80, referent=duration.Duration("quarter"))
    bar_ql = ts.barDuration.quarterLength

    part = stream.Part()
    part.append(instrument.Piano())

    for i, sym in enumerate(chord_symbols):
        m = stream.Measure(number=i + 1)
        if i == 0:
            m.append(ks)
            m.append(ts)
            m.append(mm)
        cs = harmony.ChordSymbol(sym)
        m.insert(0, cs)
        c = chord.Chord(list(cs.pitches), quarterLength=bar_ql)
        m.insert(0, c)
        part.append(m)

    score = stream.Score()
    score.append(part)
    return score
```
