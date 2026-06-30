---
type: action
edit_mode: python
---

# Description

The first vocal phrase of a 12-bar blues lyric (the A line of AAB). Four bars in 12/8, sitting in the same key as [[form]] — the pentatonic and blue notes are derived from that key, not hardcoded, so transposing [[form]] propagates here.

A weary descending line. Starts on the 5th of the key, drifts down through the minor-pentatonic scale degrees, leans on the flat-7 in the third bar, and settles on the tonic by the end. Lots of rests. Sparse. Should sound like someone sighing through it. The setup of the lyric, not the punchline.

Uses `minor_pentatonic(...)` — the minor-pentatonic-over-major-progression pattern is the blues convention.

Reads the key from [[form]]. Inherits time signature (12/8) and tempo (around 70 BPM, eighth-note triplet feel) from [[form]] as well, so the whole song stays coherent if any of those change at the source.

# Recipe

<!-- engineer-mode: this snippet's logic lives in # Python. The
frontmatter carries `edit_mode: python` so Forge-click runs the
Python directly instead of transpiling Recipe → Python. -->

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

    scale_pitches = minor_pentatonic(found_key if found_key else key.Key(tonic_name, mode),
                                     octave_range=(4, 5), include_blue=True)

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

    flat7_name = flat7_p.nameWithOctave

    # v0.3.3: lib.bar() handles trailing-rest padding (the rule the
    # v0.3.2 _pad helper used to enforce manually). m1 carries the
    # song-frame metadata (key, mm); inserted at offset 0 after bar()
    # builds the measure with its time signature.
    m1 = bar(
        note.Rest(quarterLength=1.5),
        note.Note(fifth_p.nameWithOctave, quarterLength=1.5),
        note.Note(fourth_p.nameWithOctave, quarterLength=1.0),
        note.Note(third_p.nameWithOctave, quarterLength=0.5),
        note.Rest(quarterLength=1.5),
        time_signature=ts1,
        number=1,
    )
    m1.insert(0, mm)
    m1.insert(0, ks)

    m2 = bar(
        note.Rest(quarterLength=1.5),
        note.Note(third_p.nameWithOctave, quarterLength=1.0),
        note.Note(tonic_p.nameWithOctave, quarterLength=0.5),
        note.Note(pitch.Pitch(k.pitchFromDegree(3).name + '4').nameWithOctave, quarterLength=1.5),
        note.Rest(quarterLength=1.5),
        time_signature=ts1,
        number=2,
    )

    m3 = bar(
        note.Rest(quarterLength=1.5),
        note.Note(flat7_name, quarterLength=2.0),
        note.Note(fourth_p.nameWithOctave, quarterLength=1.0),
        note.Rest(quarterLength=1.5),
        time_signature=ts1,
        number=3,
    )

    m4 = bar(
        note.Rest(quarterLength=1.5),
        note.Note(third_p.nameWithOctave, quarterLength=1.0),
        note.Note(tonic_p.nameWithOctave, quarterLength=2.0),
        note.Rest(quarterLength=1.5),
        time_signature=ts1,
        number=4,
    )

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
