---
type: action
description: music
inputs: []
---

# English


an eight-bar phrase in C major ending on the dominant

---

# Python

```python
def compute(context):
    s = stream.Score()
    p = stream.Part()
    p.append(instrument.Piano())
    p.append(key.Key('C', 'major'))
    p.append(meter.TimeSignature('4/4'))
    p.append(tempo.MetronomeMark(number=120))

    scale_pitches = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']
    dominant_pitches = ['G3', 'B3', 'D4', 'F4']

    for bar in range(1, 9):
        m = stream.Measure(number=bar)
        if bar == 8:
            c = chord.Chord(dominant_pitches, quarterLength=4.0)
            m.append(c)
        else:
            beats_remaining = 4.0
            beat_pos = 0.0
            while beats_remaining > 0:
                available = [0.5, 1.0, 1.0, 1.0, 2.0]
                dur = random.choice(available)
                if dur > beats_remaining:
                    dur = beats_remaining
                p_name = random.choice(scale_pitches)
                n = note.Note(p_name, quarterLength=dur)
                m.insert(beat_pos, n)
                beat_pos += dur
                beats_remaining -= dur
        p.append(m)

    s.append(p)
    return s
```
