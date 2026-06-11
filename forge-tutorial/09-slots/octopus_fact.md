---
type: action
inputs: []
facet_form: canonical
description: Chapter 9 — Forge fills in a value from your plain-English request.
english_hash: 8002397c045b8b1f02f9b28aa9c858bf6274d1533df00f2684357a3a479b3d73
edit_mode: python
locked_english_hash: 8002397c045b8b1f02f9b28aa9c858bf6274d1533df00f2684357a3a479b3d73
---

# English

Set fact to {{a very interesting fact about octopuses}}.
Do [[print]](fact).

# Python

```python
def compute(context):
    fact = "Octopuses have three hearts and blue blood"
    print(fact)
```

# Dependencies

[[print]]
