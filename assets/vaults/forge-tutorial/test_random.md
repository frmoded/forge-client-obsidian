---
type: action
description: test_random
source_facet: description
description_hash: 1769c75ba919b5645f31e1dd016322970051c4fc14869e7a38f9fbcd944eeeaf
recipe_hash: ed8cd9bb08bbf902327d9ed35ca24ae316e9597bb680cebd8cc9b92369c25f66
python_hash: 628eb6cd97d362dc9a7dc71aedc5e7f8eb6a76315256572bf946ef7479684700
recipe_derived_from_description_hash: 1769c75ba919b5645f31e1dd016322970051c4fc14869e7a38f9fbcd944eeeaf
recipe_derived_from_source_hash: 1769c75ba919b5645f31e1dd016322970051c4fc14869e7a38f9fbcd944eeeaf
python_derived_from_recipe_hash: ed8cd9bb08bbf902327d9ed35ca24ae316e9597bb680cebd8cc9b92369c25f66
python_derived_from_source_hash: 1769c75ba919b5645f31e1dd016322970051c4fc14869e7a38f9fbcd944eeeaf
inputs:
  - scale
---

# Description


Print a random number between 0 and 2 multiplied by an input var scale

# Recipe

Input scale: float = 1.0.
Let rand = Call [[random_float]].
Let scaled = rand * 2 * scale.
Return scaled.

# Python

```python
def compute(context, scale: float = 1.0):
  rand = random_float()
  scaled = ((rand * 2) * scale)
  return scaled

```
