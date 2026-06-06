---
type: action
description: peak
inputs: [bars]
snapshot_capture: false
---

# English


The whole flock, single mind. Loudest section. Kick on every beat; open hi-hat washes over the beat; snare 16th-note rolls; both toms on the offbeats; crash on bars 1 and 3. Six voices play (closed hi-hat sits in rest at its canonical position — open hi-hat takes over the cymbal duties).

Mechanically: kick on every beat; closed hi-hat silent; open hi-hat on every beat; snare 16th rolls (16/bar); low tom on every beat; mid tom on offbeats; crash on bars 1 and 3 downbeat only. `accent` profile (`ff`). One dynamic mark (`ff`) on the kick's first note.

When `bars` > 4 the crash continues to fire on the FIRST and THIRD bars of each 4-bar cycle. `bars=1` has no crash; `bars` ∈ {2, 3} has only the first crash hit.

---

# Python

```python
def compute(context, bars=4):
    import copy as _copy
    ts = meter.TimeSignature('4/4')
    mm = tempo.MetronomeMark(number=96)
    bar_ql = ts.barDuration.quarterLength

    PROFILE = 'accent'
    KICK   = [[(0.0, 0.25), (1.0, 0.25), (2.0, 0.25), (3.0, 0.25)]] * 4
    SNARE  = [[(i * 0.25, 0.25) for i in range(16)]] * 4
    CHIHAT = [[]] * 4
    OPENHH = [[(0.0, 0.25), (1.0, 0.25), (2.0, 0.25), (3.0, 0.25)]] * 4
    LOWTOM = [[(0.0, 0.25), (1.0, 0.25), (2.0, 0.25), (3.0, 0.25)]] * 4
    MIDTOM = [[(0.5, 0.25), (1.5, 0.25), (2.5, 0.25), (3.5, 0.25)]] * 4
    CRASH  = [[(0.0, 0.25)], [], [(0.0, 0.25)], []]

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
