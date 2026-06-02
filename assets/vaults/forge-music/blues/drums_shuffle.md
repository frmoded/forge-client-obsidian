---
type: action
description: drums_shuffle
inputs: []
---

# English


A 12-bar shuffle drum pattern in 12/8, the rhythmic backbone of a slow blues. Kick on beats 1 and 3 (the downbeats); snare on beats 2 and 4 (the backbeats); hi-hat on every dotted-quarter beat (the four-count that anchors the swing feel). No melodic content — pure percussion.

Returns a Score with one or more Parts containing the three percussion voices: kick (`instrument.BassDrum`), snare (`instrument.SnareDrum`), and hi-hat (`instrument.HiHatCymbal`). Whether music21 emits these as one drum-kit stave with three voices, or three separate staves, is a v0.3.5 spike outcome — the snippet uses the natural music21 API and accepts whatever shape comes out.

---

# Python

```python
def compute(context):
    # v0.3.5 spike — single isolated drums snippet. Percussion notation
    # via standard note.Note() + per-Part percussion-instrument
    # metadata. If Verovio renders with regular noteheads on a treble
    # staff, the follow-up explores note.Unpitched + custom notehead;
    # we deliberately try the simpler path first to isolate variables.
    ts = meter.TimeSignature('12/8')
    bar_ql = ts.barDuration.quarterLength  # 6.0

    # Hit positions in eighth-note units within each 12/8 bar.
    # 12/8 = 4 dotted-quarter beats, each beat = 3 eighth notes.
    # Eighth note = quarterLength 0.5.
    KICK_BEATS  = [0, 6]        # downbeats: beats 1, 3
    SNARE_BEATS = [3, 9]        # backbeats: beats 2, 4
    HIHAT_BEATS = [0, 3, 6, 9]  # every dotted-quarter beat

    def make_drum_part(inst, hit_positions):
        part = stream.Part()
        part.append(inst)
        for bar_idx in range(12):
            m = stream.Measure(number=bar_idx + 1)
            if bar_idx == 0:
                m.append(ts)
            cursor = 0.0
            for pos in sorted(hit_positions):
                gap = pos * 0.5 - cursor
                if gap > 0:
                    m.append(note.Rest(quarterLength=gap))
                    cursor += gap
                hit = note.Note('C4')  # placeholder; instrument metadata directs renderer
                hit.duration = duration.Duration(0.5)
                m.append(hit)
                cursor += 0.5
            remaining = bar_ql - cursor
            if remaining > 0:
                m.append(note.Rest(quarterLength=remaining))
            part.append(m)
        return part

    kick  = make_drum_part(instrument.BassDrum(),    KICK_BEATS)
    snare = make_drum_part(instrument.SnareDrum(),   SNARE_BEATS)
    hihat = make_drum_part(instrument.HiHatCymbal(), HIHAT_BEATS)

    return voices(kick, snare, hihat)
```
