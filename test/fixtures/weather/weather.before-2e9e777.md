---
type: action
description_hash: 26980ddb766f4afb51793fd94e980ccc090cc745b36e8657e85e1ec22a4a354f
recipe_hash: d2913a48e5244d390091652aa8a093c63f61bff65e9ae2c5f3ad8dcaeb00b9a2
python_hash: e93fced355617ea05436f03785e210e3a5000cd7116fcb4f0d3360ab246f7ee9
recipe_derived_from_source_hash: 26980ddb766f4afb51793fd94e980ccc090cc745b36e8657e85e1ec22a4a354f
source_facet: recipe
recipe_derived_from_description_hash: 26980ddb766f4afb51793fd94e980ccc090cc745b36e8657e85e1ec22a4a354f
python_derived_from_source_hash: d2913a48e5244d390091652aa8a093c63f61bff65e9ae2c5f3ad8dcaeb00b9a2
python_derived_from_recipe_hash: d2913a48e5244d390091652aa8a093c63f61bff65e9ae2c5f3ad8dcaeb00b9a2
---

# Description

Chooses what to say based on a value.

# Recipe

Let temperature = 72.
If temperature > 80:
  Return "It's hot.".
Otherwise:
  Return "It's pleasant.".

# Python

```python
def compute(context):
  temperature = 72
  if (temperature > 80):
    return "It's hot."
  else:
    return "It's pleasant."
```
