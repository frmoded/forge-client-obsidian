---
type: action
description_hash: fa8dce42cd6ac55afe2f99fd1ce1ca667c6e5949ebc740d80cfaefbcdbbccea4
recipe_hash: f1ea88a549d45b99c8eccb29e70492ccc970c420e6df1bc8e356b5d597a18d89
python_hash: 5c6437772eed1664a209a6a80a8b2350136634cd18140a323caeb36bc201d6ce
recipe_derived_from_source_hash: fa8dce42cd6ac55afe2f99fd1ce1ca667c6e5949ebc740d80cfaefbcdbbccea4
source_facet: description
recipe_derived_from_description_hash: fa8dce42cd6ac55afe2f99fd1ce1ca667c6e5949ebc740d80cfaefbcdbbccea4
python_derived_from_source_hash: fa8dce42cd6ac55afe2f99fd1ce1ca667c6e5949ebc740d80cfaefbcdbbccea4
python_derived_from_recipe_hash: f1ea88a549d45b99c8eccb29e70492ccc970c420e6df1bc8e356b5d597a18d89
---

# Description

Calls the excited note with no arguments and returns the result — "hooray!", from excited's own default.


# Recipe

Let result = Call [[excited]].
Return result.

# Python

```python
def compute(context):
  result = excited()
  return result

```
