---
type: action
description_hash: 5b5a3ac7c1590caba4e619fe0ce73f95bed1492d0f06dbb3735da76fdd1e6fff
recipe_hash: ccd630ff095847a6b7f52d7b98e705b4dc2308afa2e4e590f298c3d19bad8de5
python_hash: 9d7369113e91f77b9e8a0d8f698a40e939e9da155897546dff01fb5d9c4d5a5a
recipe_derived_from_source_hash: 5b5a3ac7c1590caba4e619fe0ce73f95bed1492d0f06dbb3735da76fdd1e6fff
source_facet: description
recipe_derived_from_description_hash: 5b5a3ac7c1590caba4e619fe0ce73f95bed1492d0f06dbb3735da76fdd1e6fff
python_derived_from_source_hash: 5b5a3ac7c1590caba4e619fe0ce73f95bed1492d0f06dbb3735da76fdd1e6fff
python_derived_from_recipe_hash: ccd630ff095847a6b7f52d7b98e705b4dc2308afa2e4e590f298c3d19bad8de5
---

# Description

Chapter 3 — calls the excited note and returns the result.

**What's next:** [[excited]]

# Recipe

Let result = Call [[excited]] with word="cheer".
Return result.

# Python

```python
def compute(context):
  result = excited(word='cheer')
  return result

```
