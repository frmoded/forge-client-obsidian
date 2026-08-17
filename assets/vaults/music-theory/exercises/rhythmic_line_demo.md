---
type: action
inputs:
  - pattern_choice
input_enums:
  pattern_choice:
    - swing
    - waltz
    - even_eighths
    - syncopated
---

# Description

A demo of [[rhythmic_line]]: pick a canned pattern from the dropdown and
hear the rhythm played on middle C.

Rhythm first, notes later — every pattern here is one pitch, so the only
thing you are listening to is the placement in time. Try `waltz` against
`even_eighths` to hear how much of a groove is duration alone.

# Recipe

Let pattern = {{ {"swing": ["q", "e", "e", "q", "e", "e"], "waltz": ["q", "q", "q"], "even_eighths": ["e", "e", "e", "e", "e", "e", "e", "e"], "syncopated": ["e", "q", "e", "q", "e", "q", "e"]}[pattern_choice] }}.
Return Call [[rhythmic_line]] with pattern=pattern.
