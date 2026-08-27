---
type: action
description_hash: df8450e4f64b862d14b412609b829602dbba72095fc1466be4f6464205be9ba3
recipe_hash: c59639dbd7ce35208cf04471658a9993e64f5c5fb028c58ac6b4db20de7c7423
python_hash: b06e30127ad89e2ae760a33d402b92320d271870a4bd45aa7924723772144dbe
recipe_derived_from_source_hash: df8450e4f64b862d14b412609b829602dbba72095fc1466be4f6464205be9ba3
source_facet: description
recipe_derived_from_description_hash: df8450e4f64b862d14b412609b829602dbba72095fc1466be4f6464205be9ba3
python_derived_from_source_hash: df8450e4f64b862d14b412609b829602dbba72095fc1466be4f6464205be9ba3
python_derived_from_recipe_hash: c59639dbd7ce35208cf04471658a9993e64f5c5fb028c58ac6b4db20de7c7423
---

# Description

Reads the color list from [[colors]] and prints each one: "red", "green", "blue".

# Recipe

Let palette = [[colors]].
For each color in palette:
  [[print]] color.

# Python

```python
def compute(context):
  palette = colors()
  for color in palette:
    print(color)

```
