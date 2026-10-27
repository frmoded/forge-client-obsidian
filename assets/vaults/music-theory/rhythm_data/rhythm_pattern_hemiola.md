---
type: data
content_type: json
description: "The 2-against-3 hemiola in one bar of 3/4 in sixteenth-note steps: the kick plays two dotted-quarter pulses (steps 0 and 6) while the hi-hat plays three quarter-note pulses (steps 0, 4 and 8). Read by rhythm_data_to_stream."
---

```json
{
  "time_signature": "3/4",
  "steps": 12,
  "group_size": 4,
  "swing_pct": 0,
  "tempo_bpm": 120,
  "channels": {
    "kick": [true, false, false, false, false, false, true, false, false, false, false, false],
    "hihat": [true, false, false, false, true, false, false, false, true, false, false, false]
  }
}
```
