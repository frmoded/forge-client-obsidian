---
type: action
description: Returns the nth Fibonacci number recursively.
inputs: [n]
---

# English

Given an integer `n`, return the nth Fibonacci number using recursion.

The Fibonacci sequence is defined as:
- fibonacci(0) = 0
- fibonacci(1) = 1
- fibonacci(n) = fibonacci(n - 1) + fibonacci(n - 2)

Return the result.

---

# Python

```python
def fibonacci(context, n):
    if n == 0:
        return 0
    if n == 1:
        return 1
    return context.execute("fibonacci", n=n - 1) + context.execute("fibonacci", n=n - 2)
```
