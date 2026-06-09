---
type: action
inputs: []
facet_form: canonical
description: Chapter 4 — Composition. Calls another snippet and uses what it gives back.
english_hash: 9ea27a2e5befdbf31e57f6d43d979a98bef0bc1204d2d10f48b43e53a096a0d1
---

# English

Set word to [[excited_word]]().
Do [[print]]("Forge is " plus word plus ".").

# Python

```python
def compute(context):
    word = excited_word()
    print("Forge is " + word + ".")
```

# Dependencies

[[excited_word]]
[[print]]
