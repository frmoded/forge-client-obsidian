---
type: action
source_facet: python
description_hash: cc518a38c4f10f938a78576dc1af67a53582424fc0a793b793528dbc7d4e51e2
recipe_hash: 8176284eaa172a840f743a463aadba5656a4c6e021d44a9ba3e13ad905acfad0
python_hash: e5d1a4fc162f7e942b790e395406201fb6b83935dfe1843a475fc8837c15f097
recipe_derived_from_source_hash: cc518a38c4f10f938a78576dc1af67a53582424fc0a793b793528dbc7d4e51e2
recipe_derived_from_description_hash: cc518a38c4f10f938a78576dc1af67a53582424fc0a793b793528dbc7d4e51e2
---

# Description

Does the same thing once for each item in a list: here a countdown from 3, ending with Liftoff!

# Recipe

For each number in [3, 2, 1]:
  [[print]] number.
[[print]] "Liftoff!".

# Python

```python
def compute(context):
    return None
```
