---
type: action
description: solitary
inputs: [bars]
snapshot_capture: false
---

# English


One bird, slow turns. The opening of the murmuration arc: just the kick, on beats 1 and 3 of each bar. Spare, deliberate, quiet — `mp`-band velocity (70). The piece's resting heartbeat; later sections add to this baseline.

Mechanically: kick on beats 1 and 3 every bar. Snare, hi-hats, toms, and crash are all silent (rest-filled in the canonical 7-part layout so `sequence()` aligns them with the active staves in other sections — see `README.md`). One dynamic mark (`mp`) anchored on the kick's first note.

The `bars` parameter (default 4) sets the section length. Values >4 elongate by cycling the 4-bar pattern. Values <4 truncate to the first N bars. `bars=0` returns an empty Score.

---

# Python

```python
def compute(context, bars=4):
    import copy as _copy
    ts = meter.TimeSignature('4/4')
    mm = tempo.MetronomeMark(number=96)
    bar_ql = ts.barDuration.quarterLength

    PROFILE = 70  # int → mp band per v0.3.8 velocity boundaries

    # Canonical 7-instrument layout (kick, snare, closed_hh, open_hh,
    # low_tom, mid_tom, crash). Silent instruments use [[]]*4 so the
    # part exists at the canonical voice position even when it doesn't
    # play. `sequence()` in lib.py groups by type(inst).__name__ only
    # (not by percMapPitch), so we MUST keep distinct same-class
    # instruments (closed vs open hi-hat; low vs mid tom) at distinct
    # voice positions across all sections to avoid pitch-collapse on
    # rendering. See the feedback file §5 for the full analysis.
    KICK   = [[(0.0, 0.25), (2.0, 0.25)]] * 4
    SNARE  = [[]] * 4
    CHIHAT = [[]] * 4
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

    # Dynamic mark anchored on kick's first note; other instruments
    # with notes get profile-only velocity (no mark). Silent parts
    # (empty `notes` list) skip velocity entirely.
    if kn:
        with_velocity(kn[:1], PROFILE, mark_dynamics=True)
        if len(kn) > 1:
            with_velocity(kn[1:], PROFILE)
    for ns in (sn, chn, ohn, ltn, mtn, crn):
        if ns:
            with_velocity(ns, PROFILE)

    return voices(kp, sp, chp, ohp, ltp, mtp, crp)
```
