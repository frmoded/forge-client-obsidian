---
type: action
---

# Description

Chapter 9 — Forge fills in a value from your plain-English request.

(V2.1 will let you write `{{a very interesting fact about octopuses}}` in
E-- and Forge will route to an LLM at compile time. For V2.0 the value is
cached inline; the lesson is the same — separating intent (Description)
from value (E--).)

# E--

Let fact = "Octopuses have three hearts and blue blood".
[[print]] fact.
