---
type: action
description: music
inputs: []
---

# English


A weary descending vocal line, four bars in 12/8, in E minor pentatonic. Starts on the 5th (B) and falls toward the tonic (E), with a flat-7 (D) leaned on in the third bar before the resolution. Sparse — lots of rests, the kind of line that sounds like someone sighing through it. Should feel exhausted, not angry. The A line of an AAB blues lyric: it's the singer setting up what's bothering them, not the punchline.

---

# Python

```python
def compute(context):
    part = stream.Part()
    part.insert(0, instrument.Vocalist())
    part.insert(0, meter.TimeSignature('12/8'))
    part.insert(0, key.KeySignature(1))
    part.insert(0, tempo.MetronomeMark(number=52))

    def make_note(pitch_name, quarter_length, dynamic=None):
        n = note.Note(pitch_name)
        n.duration = duration.Duration(quarterLength=quarter_length)
        if dynamic:
            n.dynamic = dynamic
        return n

    def make_rest(quarter_length):
        r = note.Rest()
        r.duration = duration.Duration(quarterLength=quarter_length)
        return r

    # Bar 1: Start on B4 (5th), sigh downward, lots of space
    # 12/8 = 4 dotted quarters = 12 eighth notes = 6.0 quarter lengths
    m1 = stream.Measure(number=1)
    m1.append(make_rest(1.5))
    m1.append(make_note('B4', 1.5))       # land on the 5th, mid-bar
    m1.append(make_note('A4', 0.75))      # step down
    m1.append(make_note('G4', 0.75))      # down to minor 3rd
    m1.append(make_rest(1.5))             # breath, trailing off

    # Bar 2: Settle briefly on G4, then fall to E4, then silence
    m2 = stream.Measure(number=2)
    m2.append(make_rest(0.75))
    m2.append(make_note('G4', 1.5))      # pick up mid-thought
    m2.append(make_note('F#4', 0.75))    # passing tone
    m2.append(make_note('E4', 1.5))      # touch the tonic
    m2.append(make_rest(1.5))            # long exhale

    # Bar 3: Lean on D4 (flat-7) — the emotional weight, drawn out
    m3 = stream.Measure(number=3)
    m3.append(make_rest(0.75))
    m3.append(make_note('B4', 0.75))     # pickup back up
    m3.append(make_note('D4', 3.0))      # the flat-7 held, mournful
    m3.append(make_note('E4', 0.75))     # lean into resolution hint
    m3.append(make_rest(0.75))

    # Bar 4: Resolve softly to E4, then fade into rest
    m4 = stream.Measure(number=4)
    m4.append(make_rest(1.5))
    m4.append(make_note('E4', 1.5))      # tonic, soft landing
    m4.append(make_note('D4', 0.75))     # linger on flat-7 again
    m4.append(make_note('E4', 0.75))     # resolve
    m4.append(make_rest(1.5))            # silence at the end

    part.append(m1)
    part.append(m2)
    part.append(m3)
    part.append(m4)

    score = stream.Score()
    score.insert(0, part)
    return score
```
