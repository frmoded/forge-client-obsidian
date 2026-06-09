---
type: action
inputs: []
facet_form: canonical
description: Chapter 6 — Loops. Does the same thing once for each item in a list.
english_hash: 6bd1589d51afa27752ed91e5efdeb7c19545d106cfb6c895c25e86455dbd837b
---

# English

For each number in <3, 2, 1>:
    Do [[print]](number).
Do [[print]]("Liftoff!").

# Python

```python
def compute(context):
    for number in [3, 2, 1]:
        print(number)
    print("Liftoff!")
```

# Dependencies

[[print]]
