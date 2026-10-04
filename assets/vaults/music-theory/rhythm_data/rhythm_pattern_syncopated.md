---
type: data
content_type: json
description: "Syncopated funk-style beat, one bar of 4/4 in sixteenth-note steps: kick pushed onto the last sixteenth of beat 1 and the and of beat 3, snare displaced off the backbeat, hi-hat on the offbeat eighths only. Meant to be layered with rhythm_pattern_straight_rock. Exported from the Rhythm Box widget's Export JSON button; read by rhythm_data_to_stream."
---

```json
{
  "time_signature": "4/4",
  "steps": 16,
  "group_size": 4,
  "swing_pct": 0,
  "tempo_bpm": 100,
  "channels": {
    "kick": [true, false, false, true, false, false, false, false, false, false, true, false, false, false, false, false],
    "snare": [false, false, false, false, false, false, false, true, false, false, false, false, true, false, false, false],
    "hihat": [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false]
  }
}
```
