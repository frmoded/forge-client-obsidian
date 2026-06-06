---
type: action
inputs: [n]
description: Build a random N-character lowercase name. Used by both the freeze-via-wikilink demos AND canonical_demo_compose (Stage 2.5).
---

# English

Make a string of `n` random lowercase letters and return it.

# Python

```python
def compute(context, n):
    import random
    import string
    return ''.join(random.choices(string.ascii_lowercase, k=n))
```
