---
type: action
inputs:
  - n
description_hash: 4a998a0d1146d36e32946d6a36e0dfca0200dedde0c0b77f592180abb3687266
recipe_hash: 54e47913f5bf49c2976af710717920ee8f2a02873398f5d87bbcea6a5f5bad98
python_hash: e4c921fd6bd0ff7f404a7bf31e80052ee8e83c2fa419fab084833b7f9db11c76
recipe_derived_from_source_hash: 4a998a0d1146d36e32946d6a36e0dfca0200dedde0c0b77f592180abb3687266
source_facet: description
recipe_derived_from_description_hash: 4a998a0d1146d36e32946d6a36e0dfca0200dedde0c0b77f592180abb3687266
python_derived_from_source_hash: 4a998a0d1146d36e32946d6a36e0dfca0200dedde0c0b77f592180abb3687266
python_derived_from_recipe_hash: 54e47913f5bf49c2976af710717920ee8f2a02873398f5d87bbcea6a5f5bad98
---

# Description

Chapter 8 — a note that calls itself to multiply n by every number below it.

## Inputs

- n — non-negative integer

**What's next:** [[Slots]]

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
