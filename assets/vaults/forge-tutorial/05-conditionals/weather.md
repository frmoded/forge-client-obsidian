---
type: action
description_hash: 26980ddb766f4afb51793fd94e980ccc090cc745b36e8657e85e1ec22a4a354f
recipe_hash: d2913a48e5244d390091652aa8a093c63f61bff65e9ae2c5f3ad8dcaeb00b9a2
python_hash: e5d1a4fc162f7e942b790e395406201fb6b83935dfe1843a475fc8837c15f097
recipe_derived_from_source_hash: 26980ddb766f4afb51793fd94e980ccc090cc745b36e8657e85e1ec22a4a354f
source_facet: recipe
recipe_derived_from_description_hash: 26980ddb766f4afb51793fd94e980ccc090cc745b36e8657e85e1ec22a4a354f
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
    return None
```
