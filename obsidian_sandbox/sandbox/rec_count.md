---
type: action
inputs: [n]
description: Recursively counts down from n, greeting at each level.
---

# English

Given a positive integer n, greet someone named "level <n>" via [[greet]],
then recurse on [[rec_count]] with n - 1. The base case at n <= 0 returns
the string "done".

---

# Python

```python
def compute(context, n):
    if n <= 0:
        return "done"
    greeting = context.compute("greet", name=f"level {n}")
    print(greeting)
    return context.compute("rec_count", n=n - 1)
```

# Dependencies

*Synced from Python. Edit the Python and regenerate, or run "Forge: Sync edges" to refresh.*

[[greet]] [[rec_count]]
