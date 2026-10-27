---
type: action
python_hash: c5e9cacd139497b7a7bc8c1d14be45dfe38aaf8650873e3da66666102a9721b7
description_hash: cc518a38c4f10f938a78576dc1af67a53582424fc0a793b793528dbc7d4e51e2
recipe_hash: 8176284eaa172a840f743a463aadba5656a4c6e021d44a9ba3e13ad905acfad0
recipe_derived_from_source_hash: cc518a38c4f10f938a78576dc1af67a53582424fc0a793b793528dbc7d4e51e2
python_derived_from_source_hash: cc518a38c4f10f938a78576dc1af67a53582424fc0a793b793528dbc7d4e51e2
source_facet: synced
recipe_derived_from_description_hash: cc518a38c4f10f938a78576dc1af67a53582424fc0a793b793528dbc7d4e51e2
python_derived_from_recipe_hash: 8176284eaa172a840f743a463aadba5656a4c6e021d44a9ba3e13ad905acfad0
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
  for number in [3, 2, 1]:
    print(number)
  print('Liftoff!')
```
