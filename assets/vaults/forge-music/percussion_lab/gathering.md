---
type: action
description: gathering
inputs: [bars]
snapshot_capture: false
---

# English


Dozens. Snare enters with ghost notes on each "and" — the offbeat pulse that gives the section its forward lean. Closed hi-hat moves to eighth notes; kick varies bar-to-bar. Three voices active; open hi-hat, toms, and crash fill rest staves to preserve canonical voice positions.

Mechanically: kick varies (bar 1 + 3 add `1.5`; bar 4 adds `3.5`); closed hi-hat on every eighth (8/bar); snare ghosts on every "and" (offsets 0.5, 1.5, 2.5, 3.5). `human` profile (`mf`). One dynamic mark (`mf`) on the kick's first note.

The `bars` parameter cycles the asymmetric kick variation alongside the steady patterns.

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
        [(0.0, 0.25), (1.5, 0.25), (2.0, 0.25)],
        [(0.0, 0.25), (2.0, 0.25)],
        [(0.0, 0.25), (1.5, 0.25), (2.0, 0.25)],
        [(0.0, 0.25), (2.0, 0.25), (3.5, 0.25)],
    ]
    # v0.3.11: active parts only. gathering plays kick + snare + closed hi-hat.
    SNARE  = [[(0.5, 0.25), (1.5, 0.25), (2.5, 0.25), (3.5, 0.25)]] * 4
    CHIHAT = [[(i * 0.5, 0.25) for i in range(8)]] * 4

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

    kp, kn = _build_part(kick, KICK)
    sp, sn = _build_part(snare, SNARE)
    chp, chn = _build_part(closed_hihat, CHIHAT)

    if kn:
        with_velocity(kn[:1], PROFILE, mark_dynamics=True)
        if len(kn) > 1:
            with_velocity(kn[1:], PROFILE)
    for ns in (sn, chn):
        if ns:
            with_velocity(ns, PROFILE)

    return voices_canonical(kp, sp=sp, chp=chp)
```
