---
type: action
description: action
inputs: []
---

# English


The B line of the AAB lyric — the answer, the punchline, the resolution. Four bars in 12/8, sitting in the same key as [[form]]. The pentatonic and blue notes are derived from that key, not hardcoded, so transposing [[form]] propagates here.

Starts higher than [[vocal_phrase_a]] — entering around the octave above the tonic, or on the minor third above that — with more melodic activity than the A line. Descends through the minor-pentatonic scale degrees, with a touch of the blue note (b5) as a bend, and resolves to the tonic in the home octave by the last bar. More notes, fewer rests than the A line. Should feel like the singer arrives at the conclusion they've been building toward across the AAB pattern. Ends with a slight downward bend on the tonic.

Reads the key from [[form]]. Inherits time signature (12/8) and tempo (around 70 BPM, eighth-note triplet feel) from [[form]] as well, so the whole song stays coherent if any of those change at the source.

---

# Python

```python
def compute(context):
    import copy

    src = context.compute("form")

    found_key = next((el for el in src.flatten() if isinstance(el, key.Key)), None)
    found_ts = next((el for el in src.flatten() if isinstance(el, meter.TimeSignature)), None)
    found_mm = next((el for el in src.flatten() if isinstance(el, tempo.MetronomeMark)), None)

    tonic_name = found_key.tonic.name if found_key else 'E'
    mode = found_key.mode if found_key else 'minor'
    ts_str = found_ts.ratioString if found_ts else '12/8'
    bpm = found_mm.number if found_mm else 70

    ts = meter.TimeSignature(ts_str)
    bar_ql = ts.barDuration.quarterLength  # 6.0 for 12/8
    ks = key.Key(tonic_name, mode)

    # pentatonic scale with blue note, spanning octaves 4 and 5
    scale_pitches = pentatonic(ks, mode='minor', octave_range=(4, 6), include_blue=True)

    # Helper: find pitch closest to a target pitch name + octave
    def find_pitch(name, octave):
        target = pitch.Pitch(f"{name}{octave}")
        return min(scale_pitches, key=lambda p: abs(p.midi - target.midi))

    tonic_p = pitch.Pitch(f"{tonic_name}4")
    # Find scale pitches
    # B line enters higher — octave above tonic (tonic in octave 5) or minor third above that
    # minor third above tonic5 = tonic5 + 3 semitones
    tonic5 = pitch.Pitch(f"{tonic_name}5")

    # Find scale degree pitches (minor pentatonic: 1, b3, 4, 5, b7 + blue b5)
    # We'll work in midi space from tonic5
    tonic_midi = tonic5.midi

    # Degrees relative to tonic in semitones for minor pentatonic + blue
    # 0=tonic, 3=b3, 5=p4, 6=b5(blue), 7=p5, 10=b7
    def scale_pitch(semitones_from_tonic5):
        target_midi = tonic_midi + semitones_from_tonic5
        return min(scale_pitches, key=lambda p: abs(p.midi - target_midi))

    b3_up = scale_pitch(3)    # minor third above tonic5
    tonic5_p = scale_pitch(0)
    b7 = scale_pitch(-2)      # b7 below tonic5 (= tonic5 - 2 semitones, i.e., b7 above tonic4)
    p5 = scale_pitch(-5)      # perfect fifth above tonic4
    blue = scale_pitch(-6)    # blue note (b5 above tonic4)
    p4 = scale_pitch(-7)      # perfect fourth above tonic4
    b3 = scale_pitch(-9)      # minor third above tonic4
    tonic4_p = scale_pitch(-12) # tonic in octave 4

    # eighth note = 0.5 quarterLength in 12/8
    e = 0.5
    q = 1.0
    dq = 1.5  # dotted quarter

    # Bar 1: Enters high, on b3 above tonic5 — active, descending motion
    # 12/8 = 6.0 ql per bar
    # Pattern: b3_up(dq) tonic5(dq) b7(dq) p5(dq) = 6.0
    m1 = stream.Measure(number=1)
    m1.append(copy.deepcopy(ks))
    m1.append(copy.deepcopy(ts))
    ref_dur = duration.Duration(type='quarter', dots=1)
    m1.append(tempo.MetronomeMark(number=bpm, referent=ref_dur))
    n1 = note.Note(b3_up, quarterLength=dq)
    n2 = note.Note(tonic5_p, quarterLength=dq)
    n3 = note.Note(b7, quarterLength=dq)
    n4 = note.Note(p5, quarterLength=dq)
    m1.append(n1); m1.append(n2); m1.append(n3); m1.append(n4)

    # Bar 2: More melodic activity — blue note as approach, descending
    # tonic5(e) b7(e) p5(e) blue(e) p4(e) b3(e) tonic5(e) b7(e) p5(e) b3(e) tonic4(e) p4(e)
    # = 12 * 0.5 = 6.0
    m2 = stream.Measure(number=2)
    pitches_bar2 = [tonic5_p, b7, p5, blue, p4, b3, tonic5_p, b7, p5, b3, tonic4_p, p4]
    for p_obj in pitches_bar2:
        n = note.Note(p_obj, quarterLength=e)
        m2.append(n)

    # Bar 3: Approaching resolution — settling around tonic4, with blue note touch
    # b3(dq) tonic4_p(dq) blue(q) p5(e) tonic4_p(e) = 1.5+1.5+1.0+0.5+0.5 = 5.0 — need 6.0
    # b3(dq) tonic4_p(dq) blue(dq) tonic4_p(dq) = 6.0
    m3 = stream.Measure(number=3)
    n_b3 = note.Note(b3, quarterLength=dq)
    n_t4a = note.Note(tonic4_p, quarterLength=dq)
    n_blue = note.Note(blue, quarterLength=dq)
    n_t4b = note.Note(tonic4_p, quarterLength=dq)
    m3.append(n_b3); m3.append(n_t4a); m3.append(n_blue); m3.append(n_t4b)

    # Bar 4: Resolution — hold tonic4, downward bend represented as grace-note step below
    # approach note (semitone below tonic4) then long tonic, trailing rest
    # grace note approach: b pitch one semitone below tonic4
    approach_midi = tonic4_p.midi - 1
    approach_p = pitch.Pitch(midi=approach_midi)
    m4 = stream.Measure(number=4)
    # approach note short, then tonic held, then small rest
    n_app = note.Note(approach_p, quarterLength=e)
    n_tonic_final = note.Note(tonic4_p, quarterLength=4.0)
    n_rest = note.Rest(quarterLength=1.5)
    # total: 0.5 + 4.0 + 1.5 = 6.0
    m4.append(n_app)
    m4.append(n_tonic_final)
    m4.append(n_rest)

    part = stream.Part()
    part.append(instrument.Vocalist())
    part.append(m1)
    part.append(m2)
    part.append(m3)
    part.append(m4)

    score = stream.Score()
    score.append(part)
    return score
```

# Dependencies

*Synced from Python. Edit the Python and regenerate, or run "Forge: Sync edges" to refresh.*

[[form]]
