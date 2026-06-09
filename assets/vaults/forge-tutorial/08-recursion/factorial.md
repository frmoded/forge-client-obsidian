---
type: action
inputs: [n]
facet_form: canonical
description: Chapter 8 — a snippet that calls itself to multiply n by every number below it.
english_hash: 933bb0f3af05de57e0b5f836cc2d7cfbda68c74434b5b0d0ac0ecb71062fd197
---

# English

If n is at most 1:
    Give back 1.
Give back n times [[factorial]](n=n minus 1).

# Python

```python
def compute(context):
    if n <= 1:
        return 1
    return n * factorial(n=n - 1)
```

# Dependencies

[[factorial]]
