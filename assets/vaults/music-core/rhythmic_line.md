---
type: action
inputs:
  - pitches
  - rhythm_pattern
recipe_version: 1
---

# Description

Return a rhythmic line: a list of `{"pitch": ..., "duration": ...}`
dictionaries pairing each note name with a rhythm code, ready for
multi-voice rendering. Take `pitches` (note names like
`["C4", "D4", "E4"]`) and `rhythm_pattern` (one rhythm code per pitch:
`"W"` whole, `"H"` half, `"Q"` quarter, `"E"` eighth, `"S"` sixteenth).
Both lists must be the same length — one duration per pitch, in order.

Example:

- Input: pitches = `["C4", "D4", "E4", "F4"]`, rhythm_pattern = `["Q", "Q", "E", "E"]`
- Output: `[{"pitch": "C4", "duration": "Q"}, {"pitch": "D4", "duration": "Q"}, {"pitch": "E4", "duration": "E"}, {"pitch": "F4", "duration": "E"}]`

Composition primitive: pairs pitch and rhythm so downstream renderers
can score both with correct timing.

## Inputs

- pitches (default ["C4", "D4", "E4", "F4"]) — note names, in order
- rhythm_pattern (default ["Q", "Q", "E", "E"]) — one rhythm code per pitch: W, H, Q, E, S

# Recipe

Let pitches: list[str] = ["C4", "D4", "E4", "F4"].
Let rhythm_pattern: list[str] = ["Q", "Q", "E", "E"].
Let valid_codes = ["W", "H", "Q", "E", "S"].
Let length_ok = {{ True if len(pitches) == len(rhythm_pattern) else (_ for _ in ()).throw(ValueError("rhythmic_line: pitches has %d item(s) but rhythm_pattern has %d — one duration per pitch, same length" % (len(pitches), len(rhythm_pattern)))) }}.
Let codes_ok = {{ True if all(d in valid_codes for d in rhythm_pattern) else (_ for _ in ()).throw(ValueError("rhythmic_line: unknown rhythm code(s) %s — use W (whole), H (half), Q (quarter), E (eighth), S (sixteenth)" % sorted(set(rhythm_pattern) - set(valid_codes)))) }}.
Let line = {{ [{"pitch": p, "duration": d} for p, d in zip(pitches, rhythm_pattern)] }}.
Return line.
