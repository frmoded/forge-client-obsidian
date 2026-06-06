---
type: action
description: dispersing
inputs: [bars]
snapshot_capture: false
---

# English


The flock thinning. Crash is gone; toms drop to single hits per bar; snare retreats to backbeats. Kick thins bar-by-bar (bar 1 still has a syncopated pickup; bar 4 only the downbeat). The defining feature: the `decrescendo` profile inserts a hairpin spanner — visible in MuseScore, audible in MIDI — that slopes the section from `mf` down toward `mp`.

Mechanically: kick varies (bar 1 adds `3.5`; bar 4 has only `0.0`); closed hi-hat eighths; open hi-hat on beat 1 only; snare on backbeats; low tom on beat 2; mid tom on and-of-2. Six voices active. `decrescendo` velocity profile.

The `bars` parameter cycles the asymmetric kick pattern; the hairpin still anchors on the kick's first note regardless of length.

---

# Python

```python
def compute(context, bars=4):
    import copy as _copy
    ts = meter.TimeSignature('4/4')
    mm = tempo.MetronomeMark(number=96)
    bar_ql = ts.barDuration.quarterLength

    PROFILE = 'decrescendo'
    KICK = [
        [(0.0, 0.25), (2.0, 0.25), (3.5, 0.25)],
        [(0.0, 0.25), (2.0, 0.25)],
        [(0.0, 0.25), (2.0, 0.25)],
        [(0.0, 0.25)],
    ]
    SNARE  = [[(1.0, 0.25), (3.0, 0.25)]] * 4
    CHIHAT = [[(i * 0.5, 0.25) for i in range(8)]] * 4
    OPENHH = [[(0.0, 0.25)]] * 4
    LOWTOM = [[(1.0, 0.25)]] * 4
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

    # Decrescendo: single call across the WHOLE kick span so the
    # Diminuendo spanner anchors first→last kick note.
    if kn:
        with_velocity(kn, PROFILE, mark_dynamics=True)
    for ns in (sn, chn, ohn, ltn, mtn, crn):
        if ns:
            with_velocity(ns, PROFILE)

    return voices(kp, sp, chp, ohp, ltp, mtp, crp)
```
