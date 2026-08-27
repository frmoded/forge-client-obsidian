---
type: action
description_hash: e6ad975b8ff2becc70ac65e19bd2e8d19705f3d944c406b89c1d6a4837acf74b
recipe_hash: f243c4273b50373d8e7ffc9e73f3361d10ebc92fd77771d3ceca9ecd38a50dbb
python_hash: e5d1a4fc162f7e942b790e395406201fb6b83935dfe1843a475fc8837c15f097
recipe_derived_from_source_hash: e6ad975b8ff2becc70ac65e19bd2e8d19705f3d944c406b89c1d6a4837acf74b
source_facet: description
recipe_derived_from_description_hash: e6ad975b8ff2becc70ac65e19bd2e8d19705f3d944c406b89c1d6a4837acf74b
recipe_version: 2
---

# Description

Puts the text "Ada" into a value called name, joins it to "Hello, " to build a greeting, and returns that greeting — "Hello, Ada".

# Recipe
Let name = "Ada".
Let greeting = "Hello, " + name.
Return greeting.

# Python

```python
def compute(context):
    return None
```
