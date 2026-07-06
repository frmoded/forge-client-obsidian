---
type: action
description_hash: dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
recipe_hash: rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr
python_hash: pppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppp
recipe_derived_from_description_hash: OLDDESCRIPTIONHASHBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB
python_derived_from_recipe_hash: rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr
canonical_facet: description
---

# Description

Description edited since Recipe was last derived. Recipe's parent-hash
points at old description → Recipe renders `— derived from Description,
out of date` (50% opacity). Python's own parent-hash matches current
recipe_hash, but per Q3 transitive rule, Python renders `— derived
from Recipe, out of date` because Recipe is upstream-broken.

# Recipe

Return.

# Python

```python
def compute(context):
    return None
```
