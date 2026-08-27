---
type: action
description_hash: e6ad975b8ff2becc70ac65e19bd2e8d19705f3d944c406b89c1d6a4837acf74b
recipe_hash: f243c4273b50373d8e7ffc9e73f3361d10ebc92fd77771d3ceca9ecd38a50dbb
python_hash: d13dd2ec74ee9d4ef1119bf6ef63749893fc6917ed360a85b225df9d4cc7dce1
recipe_derived_from_source_hash: e6ad975b8ff2becc70ac65e19bd2e8d19705f3d944c406b89c1d6a4837acf74b
source_facet: description
recipe_derived_from_description_hash: e6ad975b8ff2becc70ac65e19bd2e8d19705f3d944c406b89c1d6a4837acf74b
recipe_version: 2
python_derived_from_recipe_hash: f243c4273b50373d8e7ffc9e73f3361d10ebc92fd77771d3ceca9ecd38a50dbb
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
  name = 'Ada'
  greeting = ('Hello, ' + name)
  return greeting
```
