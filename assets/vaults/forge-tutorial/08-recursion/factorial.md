---
type: action
inputs:
  - n
description_hash: 9e319b1982304ab3fc3222fa305f8aa3ced81c48a2ce58b70b13682bba1c7bb5
recipe_hash: ba4623adb5ff79b14bf5c1e1139fe5ff27c773b648a71c6e942ded0d68ac3346
python_hash: 66709baf5d9e66e3e0229da932cf93bd07e1618a6b7f9c8b3707067bb9298eee
recipe_derived_from_source_hash: 9e319b1982304ab3fc3222fa305f8aa3ced81c48a2ce58b70b13682bba1c7bb5
source_facet: description
recipe_derived_from_description_hash: 9e319b1982304ab3fc3222fa305f8aa3ced81c48a2ce58b70b13682bba1c7bb5
python_derived_from_source_hash: 9e319b1982304ab3fc3222fa305f8aa3ced81c48a2ce58b70b13682bba1c7bb5
python_derived_from_recipe_hash: ba4623adb5ff79b14bf5c1e1139fe5ff27c773b648a71c6e942ded0d68ac3346
recipe_version: 1
---

# Description

a note that calls itself to multiply n by every number below it — with n=5, computes 5 × 4 × 3 × 2 × 1 = 120.

## Inputs

- n — non-negative integer

# Recipe

Input n: int = 5.
If n <= 1:
  Return 1.
Let n_minus_1 = n - 1.
Let sub = Call [[factorial]] with n=n_minus_1.
Return n * sub.

# Python

```python
def compute(context, n: int = 5):
  if (n <= 1):
    return 1
  n_minus_1 = (n - 1)
  sub = factorial(n=n_minus_1)
  return (n * sub)

```
