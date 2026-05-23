---
type: action
role: leaf
inputs: [temperature]
description: Returns a speed value (simulation units per second) for a given temperature level.
---

# English

Return a speed value for the given temperature level. Mapping: 'zero' -> 0.0, 'low' -> 20.0, 'medium' -> 50.0, 'high' -> 100.0. Units are simulation units per second.

# Python

```python
def compute(context, temperature):
    mapping = {
        'zero': 0.0,
        'low': 20.0,
        'medium': 50.0,
        'high': 100.0,
    }
    return mapping.get(temperature, 50.0)
```
