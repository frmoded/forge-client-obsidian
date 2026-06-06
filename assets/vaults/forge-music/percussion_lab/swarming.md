---
type: action
description: swarming
inputs: [bars]
snapshot_capture: false
---

# English


The flock turning together. Toms enter (low on beat 2 + and-of-4; mid on and-of-2). Open hi-hat punches on the and-of-4 of each bar. Snare on syncopated backbeats. Six voices active; only crash remains in rest at its canonical position.

Mechanically: kick alternates dense/sparse bars; closed hi-hat eighths; open hi-hat and-of-4 only; snare offsets 0.5, 1.0, 2.5, 3.0; low tom beat 2 + 3.5; mid tom and-of-2. `human` profile (`mf`). One dynamic mark (`mf`) on the kick's first note.

---

# Python

```python
def compute(context, bars=4):
    import copy as _copy
    ts = meter.TimeSignature('4/4')
    mm = tempo.MetronomeMark(number=96)
    bar_ql = ts.barDuration.quarterLength

    PROFILE = 'human'
    KICK = [
        [(0.0, 0.25), (1.5, 0.25), (2.0, 0.25), (3.5, 0.25)],
        [(0.0, 0.25), (2.0, 0.25)],
        [(0.0, 0.25), (1.5, 0.25), (2.0, 0.25), (3.5, 0.25)],
        [(0.0, 0.25), (2.0, 0.25)],
    ]
    SNARE  = [[(0.5, 0.25), (1.0, 0.25), (2.5, 0.25), (3.0, 0.25)]] * 4
    CHIHAT = [[(i * 0.5, 0.25) for i in range(8)]] * 4
    OPENHH = [[(3.5, 0.25)]] * 4
    LOWTOM = [[(1.0, 0.25), (3.5, 0.25)]] * 4
    MIDTOM = [[(1.5, 0.25)]] * 4
    CRASH  = [[]] * 4

    def _cycle(p4, n):
        if n <= 0:
            return []
        return [p4[i % len(p4)] for i in range(n)]

    def _build_bar(hits):
        items = []
        cursor = 0.0
        for off, dur in hits:
            if off > cursor:
                items.append(note.Rest(quarterLength=off - cursor))
                cursor = off
            items.append(note.Note('C4', quarterLength=dur))
            cursor += dur
        if cursor < bar_ql:
            items.append(note.Rest(quarterLength=bar_ql - cursor))
        return items

    def _build_part(inst_factory, p4):
        cycled = _cycle(p4, bars)
        part = stream.Part()
        part.append(inst_factory())
        notes = []
        for bar_idx, hits in enumerate(cycled):
            items = _build_bar(hits) if hits else [note.Rest(quarterLength=bar_ql)]
            for it in items:
                if isinstance(it, note.Note):
                    notes.append(it)
            m = stream.Measure(number=bar_idx + 1)
            if bar_idx == 0:
                m.append(_copy.deepcopy(ts))
                m.append(_copy.deepcopy(mm))
            for it in items:
                m.append(it)
            part.append(m)
        return part, notes

    if bars <= 0:
        return stream.Score()

    kp,  kn  = _build_part(kick,         KICK)
    sp,  sn  = _build_part(snare,        SNARE)
    chp, chn = _build_part(closed_hihat, CHIHAT)
    ohp, ohn = _build_part(open_hihat,   OPENHH)
    ltp, ltn = _build_part(low_tom,      LOWTOM)
    mtp, mtn = _build_part(mid_tom,      MIDTOM)
    crp, crn = _build_part(crash_cymbal, CRASH)

    if kn:
        with_velocity(kn[:1], PROFILE, mark_dynamics=True)
        if len(kn) > 1:
            with_velocity(kn[1:], PROFILE)
    for ns in (sn, chn, ohn, ltn, mtn, crn):
        if ns:
            with_velocity(ns, PROFILE)

    return voices(kp, sp, chp, ohp, ltp, mtp, crp)
```
