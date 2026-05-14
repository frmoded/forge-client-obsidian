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

    scale_pitches = pentatonic(tonic_name, mode='minor', octave_range=(4, 5), include_blue=True)

    def find_pitch(name, octave=None):
        for p in scale_pitches:
            if p.name == name:
                if octave is None or p.octave == octave:
                    return p
        for p in scale_pitches:
            if p.pitchClass == pitch.Pitch(name).pitchClass:
                return p
        return scale_pitches[0]

    tonic = pitch.Pitch(tonic_name + '4')
    fifth = pitch.Pitch(tonic_name + '4')
    fifth.ps = tonic.ps + 7

    scale_sorted = sorted(scale_pitches, key=lambda p: p.ps)

    def closest_scale_pitch(target_ps):
        return min(scale_sorted, key=lambda p: abs(p.ps - target_ps))

    fifth_pitch = closest_scale_pitch(tonic.ps + 7)
    flat7_pitch = closest_scale_pitch(tonic.ps + 10)
    minor3_pitch = closest_scale_pitch(tonic.ps + 3)
    root_pitch = pitch.Pitch(tonic_name + '4')

    e = 0.5
    q = 1.0
    dq = 1.5

    def make_note(p, ql):
        n = note.Note()
        n.pitch = copy.deepcopy(p)
        n.quarterLength = ql
        return n

    def make_rest(ql):
        r = note.Rest()
        r.quarterLength = ql
        return r

    m1 = stream.Measure(number=1)
    ks = key.Key(tonic_name, mode)
    ts1 = meter.TimeSignature(ts_str)
    ref_dur = duration.Duration(type='quarter', dots=1)
    mm = tempo.MetronomeMark(number=bpm, referent=ref_dur)
    m1.append(ks)
    m1.append(ts1)
    m1.append(mm)

    n1 = make_note(fifth_pitch, dq)
    r1 = make_rest(dq)
    n2 = make_note(fifth_pitch, q)
    r2 = make_rest(q)
    total1 = dq + dq + q + q
    remaining1 = bar_ql - total1
    m1.append(n1)
    m1.append(r1)
    m1.append(n2)
    m1.append(r2)
    if remaining1 > 0:
        m1.append(make_rest(remaining1))

    m2 = stream.Measure(number=2)
    p5 = closest_scale_pitch(tonic.ps + 7)
    p4 = closest_scale_pitch(tonic.ps + 5)
    p3 = minor3_pitch
    n3 = make_note(p5, e)
    n4 = make_note(p4, e)
    n5 = make_note(p3, q)
    r3 = make_rest(dq)
    r4 = make_rest(dq)
    total2 = e + e + q + dq + dq
    remaining2 = bar_ql - total2
    m2.append(n3)
    m2.append(n4)
    m2.append(n5)
    m2.append(r3)
    m2.append(r4)
    if remaining2 > 0:
        m2.append(make_rest(remaining2))

    m3 = stream.Measure(number=3)
    n6 = make_note(flat7_pitch, dq)
    n7 = make_note(flat7_pitch, q)
    r5 = make_rest(e)
    n8 = make_note(minor3_pitch, q)
    r6 = make_rest(dq)
    total3 = dq + q + e + q + dq
    remaining3 = bar_ql - total3
    m3.append(n6)
    m3.append(n7)
    m3.append(r5)
    m3.append(n8)
    m3.append(r6)
    if remaining3 > 0:
        m3.append(make_rest(remaining3))

    m4 = stream.Measure(number=4)
    n9 = make_note(minor3_pitch, e)
    n10 = make_note(root_pitch, dq)
    r7 = make_rest(bar_ql - e - dq)
    m4.append(n9)
    m4.append(n10)
    m4.append(r7)

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
