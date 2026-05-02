---
type: action
description: music
inputs: []
---

# English


A weary descending vocal line, four bars in 12/8, in E minor pentatonic. Starts on the 5th (B) and falls toward the tonic (E), with a flat-7 (D) leaned on in the third bar before the resolution. Sparse — lots of rests, the kind of line that sounds like someone sighing through it. Should feel exhausted, not angry. The A line of an AAB blues lyric: it's the singer setting up what's bothering them, not the punchline.

---

# Python

def compute(context):
  p = stream.Part()
  p.append(meter.TimeSignature("12/8"))
  p.append(key.Key("e"))
  p.append(tempo.MetronomeMark(number=70, referent="quarter"))

  # Bar 1: B held, then a sigh down to A
  p.append(note.Note("B4", quarterLength=2.0))
  p.append(note.Rest(quarterLength=1.0))
  p.append(note.Note("A4", quarterLength=3.0))

  # Bar 2: rest, then a small fall G -> E
  p.append(note.Rest(quarterLength=1.5))
  p.append(note.Note("G4", quarterLength=1.5))
  p.append(note.Note("E4", quarterLength=3.0))

  # Bar 3: lean on the flat-7 (D), the bluest moment
  p.append(note.Rest(quarterLength=1.5))
  p.append(note.Note("D4", quarterLength=3.0))
  p.append(note.Note("E4", quarterLength=1.5))

  # Bar 4: settle on the tonic, breath at the end
  p.append(note.Note("E4", quarterLength=3.0))
  p.append(note.Rest(quarterLength=3.0))

  score = stream.Score()
  score.append(p)
  return score