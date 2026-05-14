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
def compute(context, min, max, shift):
    result = random.randint(min, max)
    result = result * 3
    result = result + shift
    print(result)
    result = context.compute("greet", param=result)
    return result
```
