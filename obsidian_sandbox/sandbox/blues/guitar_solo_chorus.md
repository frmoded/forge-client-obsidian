---
type: action
description: action
inputs: []
---

±±±
# English

A 12-bar instrumental solo chorus over the song's harmonic frame. Played on electric guitar. Twelve bars in 12/8, sitting in the same key as [[form]] — the minor pentatonic and blue notes are derived from that key, not hardcoded, so transposing [[form]] propagates here.

Should feel like the song breaks open — denser than the vocal choruses, taking the emotional arc up rather than across. The moment the song stops singing about the feeling and just shows it. Sits between the second and third vocal choruses in the song.

Twelve bars matching [[form]]'s harmonic progression (I for 4 bars, IV for 2, I for 2, V-IV-I-V turnaround). The solo line should breathe with the underlying chord changes — lean on chord tones at the bar boundaries, especially when the harmony shifts to IV (bar 5), V (bar 9), and through the turnaround — but feel improvisational within each bar. Uses minor pentatonic with the blue note (b5), with occasional chromatic passing tones.

Reads the key and structure from [[form]]. Inherits time signature (12/8) and tempo (around 70 BPM, eighth-note triplet feel) from [[form]] as well, so the whole song stays coherent if any of those change at the source.

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

    ks = key.Key(tonic_name, mode)
    referent = duration.Duration(type='quarter', dots=1)
    mm = tempo.MetronomeMark(number=bpm, referent=referent)

    scale_pitches = pentatonic(tonic_name, mode='minor', octave_range=(4, 6), include_blue=True)

    def pitch_name(p):
        return p.nameWithOctave

    def nearest_pitch(pname, candidates):
        target = pitch.Pitch(pname)
        best = min(candidates, key=lambda p: abs(p.midi - target.midi))
        return best

    tonic_p = pitch.Pitch(tonic_name + '4')
    fourth_p = pitch.Pitch(tonic_name + '4')
    fourth_p.midi = tonic_p.midi + 5
    fifth_p = pitch.Pitch(tonic_name + '4')
    fifth_p.midi = tonic_p.midi + 7

    def chord_tone_pitches(root_midi, octave_range=(4, 6)):
        minor_intervals = [0, 3, 7]
        result = []
        for octave in range(octave_range[0], octave_range[1] + 1):
            base = pitch.Pitch(midi=root_midi % 12 + (octave * 12))
            for iv in minor_intervals:
                p = pitch.Pitch(midi=base.midi + iv)
                if octave_range[0] * 12 + 12 <= p.midi <= (octave_range[1] + 1) * 12:
                    result.append(p)
        return result

    def scale_pitches_in_range(lo_midi, hi_midi):
        return [p for p in scale_pitches if lo_midi <= p.midi <= hi_midi]

    def make_solo_bar(prev_pitch_midi, chord_root_midi, is_boundary, bar_number, first=False):
        m = stream.Measure()
        if first:
            m.append(copy.deepcopy(ks))
            m.append(copy.deepcopy(ts))
            m.append(copy.deepcopy(mm))

        eighth = 0.5
        dotted_quarter = 1.5

        ct_pitches = chord_tone_pitches(chord_root_midi, octave_range=(4, 5))
        sc_pitches = scale_pitches_in_range(52, 76)

        if is_boundary:
            anchor = min(ct_pitches, key=lambda p: abs(p.midi - prev_pitch_midi)) if ct_pitches else pitch.Pitch(midi=prev_pitch_midi)
        else:
            anchor = min(sc_pitches, key=lambda p: abs(p.midi - prev_pitch_midi)) if sc_pitches else pitch.Pitch(midi=prev_pitch_midi)

        patterns = [
            [dotted_quarter, dotted_quarter, dotted_quarter, dotted_quarter],
            [eighth, eighth, eighth, dotted_quarter, eighth, eighth, eighth, dotted_quarter],
            [dotted_quarter, eighth, eighth, eighth, dotted_quarter, dotted_quarter],
            [eighth * 3, dotted_quarter, dotted_quarter, dotted_quarter],
            [dotted_quarter, dotted_quarter, eighth, eighth, eighth, eighth, eighth, eighth],
        ]
        pattern = random.choice(patterns)

        total = sum(pattern)
        if abs(total - bar_ql) > 0.001:
            pattern = [dotted_quarter, dotted_quarter, dotted_quarter, dotted_quarter]

        current_midi = anchor.midi
        notes_out = []
        all_scale_midi = [p.midi for p in sc_pitches] if sc_pitches else [current_midi]

        for i, dur in enumerate(pattern):
            if i == 0 and is_boundary:
                chosen_midi = anchor.midi
            else:
                direction = random.choice([-1, 0, 1, 1])
                if direction == 0:
                    chosen_midi = current_midi
                else:
                    step = random.randint(1, 3)
                    candidates = [m for m in all_scale_midi if abs(m - current_midi) <= step * 2 + 1 and m != current_midi]
                    if not candidates:
                        candidates = all_scale_midi
                    if direction > 0:
                        up = [m for m in candidates if m > current_midi]
                        chosen_midi = min(up) if up else (max(candidates) if candidates else current_midi)
                    else:
                        dn = [m for m in candidates if m < current_midi]
                        chosen_midi = max(dn) if dn else (min(candidates) if candidates else current_midi)

                    if random.random() < 0.12:
                        chosen_midi += random.choice([-1, 1])

                chosen_midi = max(52, min(76, chosen_midi))

            n = note.Note(midi=chosen_midi, quarterLength=dur)
            notes_out.append(n)
            current_midi = chosen_midi

        for n in notes_out:
            m.append(n)

        return m, current_midi

    chord_roots = []
    tonic_midi = pitch.Pitch(tonic_name + '4').midi
    fourth_midi = tonic_midi + 5
    fifth_midi = tonic_midi + 7

    for bar_num in range(1, 13):
        if bar_num <= 4:
            chord_roots.append(tonic_midi)
        elif bar_num <= 6:
            chord_roots.append(fourth_midi)
        elif bar_num <= 8:
            chord_roots.append(tonic_midi)
        elif bar_num == 9:
            chord_roots.append(fifth_midi)
        elif bar_num == 10:
            chord_roots.append(fourth_midi)
        elif bar_num == 11:
            chord_roots.append(tonic_midi)
        else:
            chord_roots.append(fifth_midi)

    boundary_bars = {1, 5, 7, 9, 10, 11, 12}

    part = stream.Part()
    part.append(instrument.ElectricGuitar())

    prev_midi = tonic_midi + 7

    for i, cr in enumerate(chord_roots):
        bar_num = i + 1
        is_boundary = bar_num in boundary_bars
        m, prev_midi = make_solo_bar(prev_midi, cr, is_boundary, bar_num, first=(bar_num == 1))
        m.number = bar_num
        part.append(m)

    score = stream.Score()
    score.append(part)
    return score
```

# Dependencies

*Synced from Python. Edit the Python and regenerate, or run "Forge: Sync edges" to refresh.*

[[form]]
