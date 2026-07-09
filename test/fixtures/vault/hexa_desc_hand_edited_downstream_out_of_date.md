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

CW-1700 hand-edit scenario: this note has stored `description_hash` and
`recipe_derived_from_description_hash` both pointing at the same last-forged
snapshot value ("d...d"). But the actual body content on disk (this prose)
produces a different SHA-256 when computed by the ViewPlugin. Under pre-
CW-1700 impl (stored-hash comparison), Recipe would incorrectly render
`— derived from Description` (in sync) because both stored fields equal.
Under CW-1700 (current-body hash comparison), Recipe correctly renders
`— derived from Description, out of date` because the parent-hash stamp
("d...d") does not match the actual SHA-256 of this Description body.

# Recipe

Return.

# Python

```python
def compute(context):
    return None
```
