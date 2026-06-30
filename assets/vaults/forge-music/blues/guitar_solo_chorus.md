---
type: action
edit_mode: python
---

# Description

A 12-bar instrumental solo chorus over the song's harmonic frame. Played on electric guitar. Twelve bars in 12/8, sitting in the same key as [[form]] — the minor pentatonic and blue notes are derived from that key, not hardcoded, so transposing [[form]] propagates here.

Should feel like the song breaks open — denser than the vocal choruses, taking the emotional arc up rather than across. The moment the song stops singing about the feeling and just shows it. Sits between the second and third vocal choruses in the song.

Twelve bars matching [[form]]'s harmonic progression (I for 4 bars, IV for 2, I for 2, V-IV-I-V turnaround). The solo line should breathe with the underlying chord changes — lean on chord tones at the bar boundaries, especially when the harmony shifts to IV (bar 5), V (bar 9), and through the turnaround — but feel improvisational within each bar. Uses minor pentatonic with the blue note (b5), with occasional chromatic passing tones.

Uses `minor_pentatonic(...)` — blues instrumental-solo convention: minor-pentatonic line over the major-mode chord progression.

Reads the key and structure from [[form]]. Inherits time signature (12/8) and tempo (around 70 BPM, eighth-note triplet feel) from [[form]] as well, so the whole song stays coherent if any of those change at the source.

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
    key_mode = found_key.mode if found_key else 'minor'
    ts_str = found_ts.ratioString if found_ts else '12/8'
    bpm = found_mm.number if found_mm else 70

    ts = meter.TimeSignature(ts_str)
    bar_ql = ts.barDuration.quarterLength  # 6.0 for 12/8

    if found_ts and found_ts.beatDuration.quarterLength == 1.5:
        mm_referent = duration.Duration(type='quarter', dots=1)
    else:
        mm_referent = duration.Duration('quarter')

    ks = key.Key(tonic_name, key_mode)

    scale_pitches = minor_pentatonic(ks, octave_range=(4, 6), include_blue=True)

    def pitch_names_in_range(octave_range):
        return minor_pentatonic(ks, octave_range=octave_range, include_blue=True)

    scale_low = minor_pentatonic(ks, octave_range=(4, 5), include_blue=True)
    scale_mid = minor_pentatonic(ks, octave_range=(4, 6), include_blue=True)
    scale_high = minor_pentatonic(ks, octave_range=(5, 6), include_blue=True)

    def chord_tones_for(root_name, quality, octave=4):
        if quality == 'minor':
            intervals = [0, 3, 7]
        elif quality == 'major':
            intervals = [0, 4, 7]
        else:
            intervals = [0, 4, 7]
        root_p = pitch.Pitch(root_name + str(octave))
        return [pitch.Pitch(midi=root_p.midi + i) for i in intervals]

    tonic_root = ks.tonic.name
    iv_root = ks.pitchFromDegree(4).name
    v_root = ks.pitchFromDegree(5).name

    tonic_ct = chord_tones_for(tonic_root, 'minor', 4)
    iv_ct = chord_tones_for(iv_root, 'minor', 4)
    v_ct = chord_tones_for(v_root, 'minor', 4)

    def pick_from(pitches):
        return random.choice(pitches)

    def make_note(p, ql):
        n = note.Note()
        n.pitch = copy.deepcopy(p) if hasattr(p, 'name') else pitch.Pitch(p)
        n.quarterLength = ql
        return n

    def make_bar_solo(bar_num, chord_tones, scale, number):
        m = stream.Measure(number=number)
        if bar_num == 1:
            m.append(key.Key(tonic_name, key_mode))
            m.append(meter.TimeSignature(ts_str))
            m.append(tempo.MetronomeMark(number=bpm, referent=copy.deepcopy(mm_referent)))

        eighth = 0.5
        dotted_q = 1.5

        patterns = [
            [dotted_q, dotted_q, dotted_q, dotted_q],
            [1.0, 0.5, 1.0, 0.5, 1.0, 0.5, 1.0, 0.5],
            [dotted_q, 0.5, 0.5, dotted_q, 0.5, 1.0, 0.5],
            [0.5, 0.5, 0.5, dotted_q, dotted_q, 0.5, 0.5, 0.5, 0.5],
            [2.0, 1.0, 1.5, 1.5],
            [0.5, 0.5, 0.5, 0.5, dotted_q, dotted_q, 0.5, 0.5, 0.5],
        ]

        valid_patterns = [p for p in patterns if abs(sum(p) - bar_ql) < 0.001]
        if not valid_patterns:
            valid_patterns = [[dotted_q, dotted_q, dotted_q, dotted_q]]

        pattern = random.choice(valid_patterns)
        total = sum(pattern)

        for i, ql in enumerate(pattern):
            if i == 0 or i == len(pattern) - 1:
                p = pick_from(chord_tones)
            else:
                use_scale = random.random() < 0.8
                if use_scale:
                    p = pick_from(scale)
                else:
                    p = pick_from(chord_tones)
            m.append(make_note(p, ql))

        return m

    def make_expressive_bar(bar_num, chord_tones, scale, number, density='high'):
        m = stream.Measure(number=number)
        if bar_num == 1:
            m.append(key.Key(tonic_name, key_mode))
            m.append(meter.TimeSignature(ts_str))
            m.append(tempo.MetronomeMark(number=bpm, referent=copy.deepcopy(mm_referent)))

        eighth = 0.5
        dotted_q = 1.5

        if density == 'high':
            pattern = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]
        elif density == 'medium':
            pattern = [dotted_q, dotted_q, dotted_q, dotted_q]
        else:
            pattern = [2.0, dotted_q, dotted_q, 1.0]

        total = sum(pattern)
        if abs(total - bar_ql) > 0.001:
            pattern = [dotted_q, dotted_q, dotted_q, dotted_q]

        for i, ql in enumerate(pattern):
            if i == 0:
                p = pick_from(chord_tones)
            elif i == len(pattern) - 1:
                p = pick_from(chord_tones)
            else:
                r = random.random()
                if r < 0.65:
                    p = pick_from(scale)
                elif r < 0.85:
                    p = pick_from(chord_tones)
                else:
                    chromatic_candidates = []
                    for ct in chord_tones:
                        up = pitch.Pitch(midi=ct.midi + 1)
                        down = pitch.Pitch(midi=ct.midi - 1)
                        chromatic_candidates.extend([up, down])
                    if chromatic_candidates:
                        p = pick_from(chromatic_candidates)
                    else:
                        p = pick_from(scale)
            m.append(make_note(p, ql))

        return m

    measures = []

    bars_1_4_patterns = ['medium', 'high', 'high', 'medium']
    for b in range(4):
        if b < 2:
            sc = scale_mid
        else:
            sc = scale_high
        m = make_expressive_bar(b + 1, tonic_ct, sc, b + 1, density=bars_1_4_patterns[b])
        measures.append(m)

    iv_ct_higher = chord_tones_for(iv_root, 'minor', 5)
    iv_scale = minor_pentatonic(ks, octave_range=(5, 6), include_blue=True)
    for b in range(2):
        density = 'high' if b == 0 else 'medium'
        m = make_expressive_bar(5 + b, iv_ct_higher, iv_scale, 5 + b, density=density)
        measures.append(m)

    for b in range(2):
        density = 'medium' if b == 0 else 'high'
        m = make_expressive_bar(7 + b, tonic_ct, scale_high, 7 + b, density=density)
        measures.append(m)

    v_ct_mid = chord_tones_for(v_root, 'minor', 4)
    m9 = make_expressive_bar(9, v_ct_mid, scale_high, 9, density='high')
    measures.append(m9)

    iv_ct_mid = chord_tones_for(iv_root, 'minor', 4)
    m10 = make_expressive_bar(10, iv_ct_mid, scale_mid, 10, density='high')
    measures.append(m10)

    m11 = make_expressive_bar(11, tonic_ct, scale_mid, 11, density='medium')
    measures.append(m11)

    m12 = make_expressive_bar(12, v_ct_mid, scale_low, 12, density='medium')
    measures.append(m12)

    part = stream.Part()
    part.append(instrument.ElectricGuitar())
    for m in measures:
        part.append(m)

    score = stream.Score()
    score.append(part)
    return score
```

# Dependencies

*Synced from Python. Edit the Python and regenerate, or run "Forge: Sync edges" to refresh.*

[[form]]
