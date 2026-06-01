---
type: action
description: action
inputs: []
---

# English


The first vocal phrase of a 12-bar blues lyric (the A line of AAB). Four bars in 12/8, sitting in the same key as [[form]] — the pentatonic and blue notes are derived from that key, not hardcoded, so transposing [[form]] propagates here.

A weary descending line. Starts on the 5th of the key, drifts down through the minor-pentatonic scale degrees, leans on the flat-7 in the third bar, and settles on the tonic by the end. Lots of rests. Sparse. Should sound like someone sighing through it. The setup of the lyric, not the punchline.

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
    bar_ql = ts.barDuration.quarterLength

    scale_pitches = pentatonic(found_key if found_key else key.Key(tonic_name, mode),
                               mode='minor', octave_range=(4, 5), include_blue=True)

    def pitch_named(name, octave):
        return pitch.Pitch(name + str(octave))

    k = found_key if found_key else key.Key(tonic_name, mode)

    tonic_p = pitch.Pitch(k.tonic.name + '4')
    fifth_p = pitch.Pitch(k.pitchFromDegree(5).name + '4')
    flat7_p = pitch.Pitch(k.pitchFromDegree(7).name + '4')
    third_p = pitch.Pitch(k.pitchFromDegree(3).name + '4')
    fourth_p = pitch.Pitch(k.pitchFromDegree(4).name + '4')

    blue_candidates = [p for p in scale_pitches if p.name not in [
        k.tonic.name, k.pitchFromDegree(3).name, k.pitchFromDegree(5).name,
        k.pitchFromDegree(7).name, k.pitchFromDegree(4).name
    ]]
    blue_p = blue_candidates[0] if blue_candidates else pitch.Pitch(k.pitchFromDegree(5).name + '4')
    blue_p = pitch.Pitch(blue_p.name + '4')

    ks = key.Key(tonic_name, mode)
    ts1 = meter.TimeSignature(ts_str)
    ref_dur = duration.Duration(type='quarter', dots=1)
    mm = tempo.MetronomeMark(number=bpm, referent=ref_dur)

    m1 = stream.Measure(number=1)
    m1.append(ks)
    m1.append(ts1)
    m1.append(mm)
    n1 = note.Rest(quarterLength=1.5)
    n2 = note.Note(fifth_p.nameWithOctave, quarterLength=1.5)
    n3 = note.Note(fourth_p.nameWithOctave, quarterLength=1.0)
    n4 = note.Note(third_p.nameWithOctave, quarterLength=0.5)
    n5 = note.Rest(quarterLength=1.5)
    total1 = 1.5 + 1.5 + 1.0 + 0.5 + 1.5
    n6 = note.Rest(quarterLength=bar_ql - total1)
    m1.append(n1); m1.append(n2); m1.append(n3); m1.append(n4); m1.append(n5); m1.append(n6)

    m2 = stream.Measure(number=2)
    r1 = note.Rest(quarterLength=1.5)
    p1 = note.Note(third_p.nameWithOctave, quarterLength=1.0)
    p2 = note.Note(tonic_p.nameWithOctave, quarterLength=0.5)
    p3 = note.Note(pitch.Pitch(k.pitchFromDegree(3).name + '4').nameWithOctave, quarterLength=1.5)
    r2 = note.Rest(quarterLength=1.5)
    total2 = 1.5 + 1.0 + 0.5 + 1.5 + 1.5
    r3 = note.Rest(quarterLength=bar_ql - total2)
    m2.append(r1); m2.append(p1); m2.append(p2); m2.append(p3); m2.append(r2); m2.append(r3)

    flat7_name = flat7_p.nameWithOctave

    m3 = stream.Measure(number=3)
    s1 = note.Rest(quarterLength=1.5)
    s2 = note.Note(flat7_name, quarterLength=2.0)
    s3 = note.Note(fourth_p.nameWithOctave, quarterLength=1.0)
    s4 = note.Rest(quarterLength=1.5)
    total3 = 1.5 + 2.0 + 1.0 + 1.5
    s5 = note.Rest(quarterLength=bar_ql - total3)
    m3.append(s1); m3.append(s2); m3.append(s3); m3.append(s4); m3.append(s5)

    m4 = stream.Measure(number=4)
    t1 = note.Rest(quarterLength=1.5)
    t2 = note.Note(third_p.nameWithOctave, quarterLength=1.0)
    t3 = note.Note(tonic_p.nameWithOctave, quarterLength=2.0)
    t4 = note.Rest(quarterLength=1.5)
    total4 = 1.5 + 1.0 + 2.0 + 1.5
    t5 = note.Rest(quarterLength=bar_ql - total4)
    m4.append(t1); m4.append(t2); m4.append(t3); m4.append(t4); m4.append(t5)

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
