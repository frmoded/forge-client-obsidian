---
type: action
inputs: [n]
description_hash: 49f64f4c8107cc2ba041157c310bb3073a2e8c0f4814a7ec4abaa72488ed1950
recipe_hash: e904c2ecff41676e938d327a4d3744b5f804b9d6f6931d948373f1de26cbb15c
python_hash: 0fd43d5a597ac91e741c88e335e8f058417be04516eb97c13e3838ae35a9ee85
recipe_derived_from_source_hash: 49f64f4c8107cc2ba041157c310bb3073a2e8c0f4814a7ec4abaa72488ed1950
source_facet: description
recipe_derived_from_description_hash: 49f64f4c8107cc2ba041157c310bb3073a2e8c0f4814a7ec4abaa72488ed1950
python_derived_from_source_hash: 49f64f4c8107cc2ba041157c310bb3073a2e8c0f4814a7ec4abaa72488ed1950
python_derived_from_recipe_hash: f29b4e8755049d8e264ae67bb927d81ef9f705756ea88a711179b4088602d338
recipe_version: 1
---

# Description

a note that calls itself to multiply n by every number below it.

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
  n_minus_1 = (n - 1)
  sub = show_factorial(n=n_minus_1)
  result = (n * sub)
  return result

```
