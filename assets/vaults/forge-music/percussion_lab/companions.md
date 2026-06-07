---
type: action
description: companions
inputs: [bars]
snapshot_capture: false
---

# English


A few birds join. Kick stays the heartbeat (beats 1 and 3); closed hi-hat enters with steady quarter notes. Two voices play; the other 5 instruments fill rest staves at their canonical voice positions so [[murmuration]] can `sequence()` sections without pitch-collapse on rendering.

Mechanically: kick on 1 and 3; closed hi-hat on every beat (quarters). `human` velocity profile (`mf` band). One dynamic mark (`mf`) on the kick's first note.

The `bars` parameter cycles both patterns identically.

---

# Python

```python
def compute(context, bars=4):
    import copy as _copy
    ts = meter.TimeSignature('4/4')
    mm = tempo.MetronomeMark(number=96)
    bar_ql = ts.barDuration.quarterLength

    PROFILE = 'human'
    # v0.3.11: active parts only. companions plays kick + closed hi-hat.
    KICK   = [[(0.0, 0.25), (2.0, 0.25)]] * 4
    CHIHAT = [[(0.0, 0.25), (1.0, 0.25), (2.0, 0.25), (3.0, 0.25)]] * 4

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
    chp, chn = _build_part(closed_hihat, CHIHAT)

    if kn:
        with_velocity(kn[:1], PROFILE, mark_dynamics=True)
        if len(kn) > 1:
            with_velocity(kn[1:], PROFILE)
    if chn:
        with_velocity(chn, PROFILE)

    return voices_canonical(kp, chp=chp)
```
