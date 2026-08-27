---
type: action
inputs: [n]
description_hash: e1cf47f025216257478b615ad529f6cdc24334fab291803fb9f720dbef088be0
recipe_hash: e904c2ecff41676e938d327a4d3744b5f804b9d6f6931d948373f1de26cbb15c
python_hash: e4c921fd6bd0ff7f404a7bf31e80052ee8e83c2fa419fab084833b7f9db11c76
recipe_derived_from_source_hash: e1cf47f025216257478b615ad529f6cdc24334fab291803fb9f720dbef088be0
source_facet: description
recipe_derived_from_description_hash: e1cf47f025216257478b615ad529f6cdc24334fab291803fb9f720dbef088be0
python_derived_from_source_hash: e1cf47f025216257478b615ad529f6cdc24334fab291803fb9f720dbef088be0
python_derived_from_recipe_hash: e904c2ecff41676e938d327a4d3744b5f804b9d6f6931d948373f1de26cbb15c
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
Return n * Call [[factorial]] with n=n - 1.

# Python

```python
def compute(context, n: int = 5):
  if (n <= 1):
    return 1
  return (n * factorial(n=(n - 1)))
```
