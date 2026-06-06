---
type: action
description: threading
inputs: [bars]
snapshot_capture: false
---

# English


The quiet return. Kick on the heartbeat (1 and 3); closed hi-hat back to quarter notes; snare's soft ghost notes on the "and of 2" and "and of 4" — a small offbeat shimmer beneath the steady pulse. Three voices play; the rest fill rest staves at canonical positions.

Mechanically: kick on 1 and 3; closed hi-hat on every beat (quarters); snare on offsets 1.5 and 3.5. `human` profile (`mf`). One dynamic mark (`mf`) on the kick's first note.

---

# Python

```python
def compute(context, bars=4):
    import copy as _copy
    ts = meter.TimeSignature('4/4')
    mm = tempo.MetronomeMark(number=96)
    bar_ql = ts.barDuration.quarterLength

    PROFILE = 'human'
    KICK   = [[(0.0, 0.25), (2.0, 0.25)]] * 4
    SNARE  = [[(1.5, 0.25), (3.5, 0.25)]] * 4
    CHIHAT = [[(0.0, 0.25), (1.0, 0.25), (2.0, 0.25), (3.0, 0.25)]] * 4
    OPENHH = [[]] * 4
    LOWTOM = [[]] * 4
    MIDTOM = [[]] * 4
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
