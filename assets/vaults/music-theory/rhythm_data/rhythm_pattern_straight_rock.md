---
type: data
content_type: json
description: "Straight rock beat, one bar of 4/4 in sixteenth-note steps: kick on beats 1 and 3, snare on the backbeat (2 and 4), closed hi-hat on every eighth. Exported from the Rhythm Box widget's Export JSON button; read by rhythm_data_to_stream."
---

```json
{
  "time_signature": "4/4",
  "steps": 16,
  "group_size": 4,
  "swing_pct": 0,
  "tempo_bpm": 100,
  "channels": {
    "kick": [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
    "snare": [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
    "hihat": [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false]
  }
}
```
