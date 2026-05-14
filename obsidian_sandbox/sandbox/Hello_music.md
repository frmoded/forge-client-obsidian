---
type: action
description: music
inputs: []
---

# English


an eight-bar phrase in C major ending on the dominant.
---

# Python

```python
def compute(context):
    ts = meter.TimeSignature('4/4')
    ks = key.Key('C', 'major')
    mm = tempo.MetronomeMark(number=120, referent=duration.Duration('quarter'))

    scale = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']

    measures = []
    patterns = [
        ['C4', 'E4', 'G4', 'E4'],
        ['F4', 'A4', 'C5', 'A4'],
        ['G4', 'B4', 'D5', 'B4'],
        ['E4', 'G4', 'C5', 'G4'],
        ['A4', 'C5', 'E5', 'C5'],
        ['F4', 'A4', 'F4', 'E4'],
        ['D4', 'F4', 'A4', 'F4'],
        ['G4', 'B4', 'D5', 'G4'],
    ]

    for i, pitches in enumerate(patterns):
        m = stream.Measure(number=i + 1)
        if i == 0:
            m.append(ks)
            m.append(ts)
            m.append(mm)
        for p in pitches:
            m.append(note.Note(p, quarterLength=1.0))
        measures.append(m)

    part = stream.Part()
    part.append(instrument.Piano())
    for m in measures:
        part.append(m)

    score = stream.Score()
    score.append(part)
    return score
```
