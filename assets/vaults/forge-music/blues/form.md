---
type: action
edit_mode: python
---

# Description

The harmonic skeleton of standard 12-bar blues in E. Twelve bars in 12/8, slow (around 70 BPM, eighth-note triplet feel). The chord progression itself comes from [[twelve_bar_blues_progression]] as a list of roman numerals — we resolve them to concrete chords in E major via music21.roman, so swapping the key here doesn't require touching the progression data. Returns the chord progression as a Score with chord symbols, no melodic content — meant to be combined with vocal and instrumental parts that overlay on top of it. The tonal frame everything else hangs from. Use Piano for this.

# Recipe

<!-- engineer-mode: this snippet's logic lives in # Python. The
frontmatter carries `edit_mode: python` so Forge-click runs the
Python directly instead of transpiling Recipe → Python. -->

# Python

```python
def compute(context):
    import copy

    progression = context.compute("twelve_bar_blues_progression")

    tonic = 'E'
    mode = 'major'
    k = key.Key(tonic, mode)
    ts = meter.TimeSignature('12/8')
    bar_ql = ts.barDuration.quarterLength
    mm = tempo.MetronomeMark(number=70, referent=duration.Duration(type='quarter', dots=1))

    part = stream.Part()
    part.append(instrument.Piano())

    for i, numeral in enumerate(progression):
        m = stream.Measure(number=i + 1)

        if i == 0:
            m.append(copy.deepcopy(k))
            m.append(copy.deepcopy(ts))
            m.append(copy.deepcopy(mm))

        rn = roman.RomanNumeral(numeral, k)
        root_name = rn.root().name
        quality_map = {
            'major': '',
            'minor': 'm',
            'diminished': 'dim',
            'augmented': 'aug',
            'dominant-seventh': '7',
            'major-seventh': 'maj7',
            'minor-seventh': 'm7',
        }
        suffix = quality_map.get(rn.quality, '')
        cs_figure = root_name + suffix
        cs = harmony.ChordSymbol(cs_figure)
        m.insert(0, cs)
        c = chord.Chord(list(rn.pitches), quarterLength=bar_ql)
        m.insert(0, c)

        part.append(m)

    score = stream.Score()
    score.append(part)
    return score
```

# Dependencies

*Synced from Python. Edit the Python and regenerate, or run "Forge: Sync edges" to refresh.*

[[twelve_bar_blues_progression]]
