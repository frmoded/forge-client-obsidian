---
type: action
description: Adds two 3D points using numpy and prints the result.
inputs: []
---

# English

Using numpy, define two 3D points as arrays and add them together element-wise. Print the resulting point.

Return the result as a list.

---

# Python

```python
def compute(context):
    point1 = numpy.array([1.0, 2.0, 3.0])
    point2 = numpy.array([4.0, 5.0, 6.0])
    result = point1 + point2
    print(result)
    return result.tolist()
```
