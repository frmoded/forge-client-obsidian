---
type: action
description_hash: dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
recipe_hash: rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr
python_hash: pppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppp
recipe_derived_from_description_hash: dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
python_derived_from_recipe_hash: rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr
source_facet: description
---

# Description

All three facets aligned with v11.6 parent-hash fields. Recipe should
render `— derived from Description`; Python should render `— derived
from Recipe`; Description shows `— source`.

# Recipe

Return.

# Python

```python
def compute(context):
    return None
```
