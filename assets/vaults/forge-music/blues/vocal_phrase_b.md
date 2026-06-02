---
type: action
description: action
inputs: []
---

# English


The B line of the AAB lyric — the answer, the punchline, the resolution. Four bars in 12/8, sitting in the same key as [[form]]. The pentatonic and blue notes are derived from that key, not hardcoded, so transposing [[form]] propagates here.

Starts higher than [[vocal_phrase_a]] — entering around the octave above the tonic, or on the minor third above that — with more melodic activity than the A line. Descends through the minor-pentatonic scale degrees, with a touch of the blue note (b5) as a bend, and resolves to the tonic in the home octave by the last bar. More notes, fewer rests than the A line. Should feel like the singer arrives at the conclusion they've been building toward across the AAB pattern. Ends with a slight downward bend on the tonic.

Uses `minor_pentatonic(...)` — same blues convention as [[vocal_phrase_a]]: minor-pentatonic vocal line over the major-mode chord progression.

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
    referent = duration.Duration(type='quarter', dots=1)
    mm = tempo.MetronomeMark(number=bpm, referent=referent)
    ks = key.Key(tonic_name, mode)

    scale_pitches = minor_pentatonic(ks, octave_range=(4, 6), include_blue=True)

    def find_pitch(name, octave):
        for p in scale_pitches:
            if p.name == name and p.octave == octave:
                return p
        for p in scale_pitches:
            if p.name == name:
                return p
        return pitch.Pitch(name + str(octave))

    tonic_p = pitch.Pitch(tonic_name + '4')
    tonic_high = pitch.Pitch(tonic_name + '5')

    k_obj = key.Key(tonic_name, mode)
    scale_high = minor_pentatonic(k_obj, octave_range=(5, 6), include_blue=True)
    scale_mid = minor_pentatonic(k_obj, octave_range=(4, 5), include_blue=True)
    scale_all = minor_pentatonic(k_obj, octave_range=(4, 6), include_blue=True)

    def pitch_at(name, preferred_octave):
        candidates = [p for p in scale_all if p.name == name]
        if not candidates:
            return pitch.Pitch(name + str(preferred_octave))
        best = min(candidates, key=lambda p: abs(p.octave - preferred_octave))
        return best

    minor_third_above_tonic = pitch.Pitch(tonic_name + '5')
    minor_third_above_tonic.transpose(3, inPlace=True)

    rn_root = k_obj.tonic
    minor_third_interval = 3
    start_p = pitch.Pitch(tonic_name + '5')
    start_p = start_p.transpose(minor_third_interval)

    p5 = pitch_at(tonic_name, 5)
    p5_m3 = p5.transpose(3)

    scale_5 = [p for p in scale_all if p.octave == 5]
    scale_4 = [p for p in scale_all if p.octave == 4]

    def pn(name, oct):
        return pitch.Pitch(name + str(oct))

    k_scale = minor_pentatonic(ks, octave_range=(4, 6), include_blue=True)

    def get_degree(semitones_above_tonic, preferred_octave):
        tonic_midi = pitch.Pitch(tonic_name + str(preferred_octave)).midi
        target_midi = tonic_midi + semitones_above_tonic
        candidates = [p for p in k_scale if abs(p.midi - target_midi) <= 2]
        if candidates:
            return min(candidates, key=lambda p: abs(p.midi - target_midi))
        return pitch.Pitch(target_midi)

    tonic_midi_4 = pitch.Pitch(tonic_name + '4').midi
    tonic_midi_5 = pitch.Pitch(tonic_name + '5').midi

    def closest_scale_pitch(midi_target):
        return min(k_scale, key=lambda p: abs(p.midi - midi_target))

    entry_midi = tonic_midi_5 + 3
    entry = closest_scale_pitch(entry_midi)

    b7_midi = tonic_midi_5 - 2
    b7 = closest_scale_pitch(b7_midi)

    p5_midi = tonic_midi_5 - 5
    fifth = closest_scale_pitch(p5_midi)

    b5_candidates = [p for p in k_scale if abs(p.midi - (tonic_midi_4 + 6)) <= 1]
    blue = b5_candidates[0] if b5_candidates else closest_scale_pitch(tonic_midi_4 + 6)

    fourth_midi = tonic_midi_4 + 5
    fourth = closest_scale_pitch(fourth_midi)

    minor3_midi = tonic_midi_4 + 3
    minor3 = closest_scale_pitch(minor3_midi)

    tonic4 = closest_scale_pitch(tonic_midi_4)

    def make_note(p, ql):
        n = note.Note()
        n.pitch = copy.deepcopy(p)
        n.quarterLength = ql
        return n

    def make_grace(p):
        n = note.Note()
        n.pitch = copy.deepcopy(p)
        n.quarterLength = 0.25
        n.duration.type = 'eighth'
        return n

    part = stream.Part()
    part.append(instrument.Vocalist())

    m1 = stream.Measure(number=1)
    m1.append(copy.deepcopy(ks))
    m1.append(meter.TimeSignature(ts_str))
    m1.append(tempo.MetronomeMark(number=bpm, referent=duration.Duration(type='quarter', dots=1)))

    n1 = make_note(entry, 3.0)
    n2_p = closest_scale_pitch(entry.midi - 2)
    n2 = make_note(n2_p, 1.5)
    n3_p = closest_scale_pitch(b7.midi)
    n3 = make_note(n3_p, 1.5)
    total1 = n1.quarterLength + n2.quarterLength + n3.quarterLength
    remaining1 = bar_ql - total1
    if remaining1 > 0:
        r1 = note.Rest(quarterLength=remaining1)
        m1.append(n1); m1.append(n2); m1.append(n3); m1.append(r1)
    else:
        m1.append(n1); m1.append(n2); m1.append(n3)

    m2 = stream.Measure(number=2)
    b7_2 = copy.deepcopy(b7)
    n4 = make_note(b7_2, 1.5)
    n5 = make_note(fifth, 1.5)
    n6_p = closest_scale_pitch(fifth.midi - 1)
    n6 = make_note(n6_p, 1.5)
    n7 = make_note(fifth, 1.5)
    total2 = n4.quarterLength + n5.quarterLength + n6.quarterLength + n7.quarterLength
    remaining2 = bar_ql - total2
    if remaining2 > 0:
        m2.append(n4); m2.append(n5); m2.append(n6); m2.append(n7)
        m2.append(note.Rest(quarterLength=remaining2))
    else:
        m2.append(n4); m2.append(n5); m2.append(n6); m2.append(n7)

    m3 = stream.Measure(number=3)
    n8 = make_note(fourth, 1.5)
    n9 = make_note(blue, 1.5)
    grace_p = closest_scale_pitch(tonic_midi_4 + 1)
    grace = make_grace(grace_p)
    n10 = make_note(minor3, 1.5)
    n11 = make_note(tonic4, 1.5)
    total3 = n8.quarterLength + n9.quarterLength + n10.quarterLength + n11.quarterLength
    remaining3 = bar_ql - total3
    if remaining3 > 0:
        m3.append(n8); m3.append(n9); m3.append(n10); m3.append(n11)
        m3.append(note.Rest(quarterLength=remaining3))
    else:
        m3.append(n8); m3.append(n9); m3.append(n10); m3.append(n11)

    m4 = stream.Measure(number=4)
    tonic_long = make_note(tonic4, 3.0)
    bend_p = closest_scale_pitch(tonic_midi_4 - 1)
    bend_note = make_note(bend_p, 1.5)
    tonic_final = make_note(tonic4, 1.5)
    total4 = tonic_long.quarterLength + bend_note.quarterLength + tonic_final.quarterLength
    remaining4 = bar_ql - total4
    if remaining4 > 0:
        m4.append(tonic_long); m4.append(bend_note); m4.append(tonic_final)
        m4.append(note.Rest(quarterLength=remaining4))
    else:
        m4.append(tonic_long); m4.append(bend_note); m4.append(tonic_final)

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
