---
type: action
description: form
inputs: []
---

# English

The harmonic skeleton of standard 12-bar blues in E. Twelve bars in 12/8, slow (around 70 BPM, eighth-note triplet feel). The chord progression itself comes from [[twelve_bar_blues_progression]] as a list of roman numerals — we resolve them to concrete chords in E major via music21.roman, so swapping the key here doesn't require touching the progression data. Returns the chord progression as a Score with chord symbols, no melodic content — meant to be combined with vocal and instrumental parts that overlay on top of it. The tonal frame everything else hangs from. Use Piano for this.

---

# Python

```python
def compute(context):
    import copy
    ts = meter.TimeSignature('12/8')
    ks = key.Key('E', 'major')
    mm = tempo.MetronomeMark(number=70, referent=duration.Duration(type='quarter', dots=1))
    bar_ql = ts.barDuration.quarterLength

    progression = context.compute('twelve_bar_blues_progression')

    part = stream.Part()
    part.append(instrument.Piano())

    for i, rn in enumerate(progression):
        m = stream.Measure(number=i + 1)
        if i == 0:
            m.append(copy.deepcopy(ks))
            m.append(copy.deepcopy(ts))
            m.append(copy.deepcopy(mm))
        rn_obj = roman.RomanNumeral(rn, ks)
        cs = harmony.ChordSymbol(rn_obj.root().name)
        c = chord.Chord(rn_obj.pitches, quarterLength=bar_ql)
        m.insert(0, cs)
        m.insert(0, c)
        part.append(m)

    score = stream.Score()
    score.append(part)
    return score
```

# Dependencies

[[twelve_bar_blues_progression]]
