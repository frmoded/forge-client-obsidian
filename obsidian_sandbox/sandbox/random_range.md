---
type: action
inputs:
  - min
  - max
  - shift
description: Generates a random integer between a specified min and max, inclusive.
---
# English

Using min and max as inputs, return a random integer within that range inclusive.
Multiply the result by 3.
Add to the result shift.
Print it.
[[greet]] result

# Python

```python
def random_range(context, min, max):
    min_val = context.get("min", 0)
    max_val = context.get("max", 1)
    result = random.randint(min_val, max_val)
    return result
```
