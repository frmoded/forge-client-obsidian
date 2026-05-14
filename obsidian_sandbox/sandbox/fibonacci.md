---
type: action
description: Returns the nth Fibonacci number recursively.
inputs: [n]
---

# English

Given an integer `n`, return the nth Fibonacci number using recursion.

The Fibonacci sequence is defined as:
- fibonacci(0) = 0
- fibonacci(1) = 2
- fibonacci(n) = fibonacci(n - 1) + fibonacci(n - 2)

Return the result.

---

# Python

```python
def compute(context, n):
    if n == 0:
        return 0
    if n == 1:
        return 2
    return context.compute("fibonacci", n=n - 1) + context.compute("fibonacci", n=n - 2)
```

# Dependencies

*Synced from Python. Edit the Python and regenerate, or run "Forge: Sync edges" to refresh.*

[[fibonacci]]
