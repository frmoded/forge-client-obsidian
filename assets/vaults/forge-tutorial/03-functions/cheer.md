---
type: action
description_hash: aafcd6fbe1d9f51fd094a6f4cfd886fb4194fa10050d66ab9cfbbf7e39986b6a
recipe_hash: ccd630ff095847a6b7f52d7b98e705b4dc2308afa2e4e590f298c3d19bad8de5
python_hash: 9d7369113e91f77b9e8a0d8f698a40e939e9da155897546dff01fb5d9c4d5a5a
recipe_derived_from_source_hash: aafcd6fbe1d9f51fd094a6f4cfd886fb4194fa10050d66ab9cfbbf7e39986b6a
source_facet: description
recipe_derived_from_description_hash: aafcd6fbe1d9f51fd094a6f4cfd886fb4194fa10050d66ab9cfbbf7e39986b6a
python_derived_from_source_hash: aafcd6fbe1d9f51fd094a6f4cfd886fb4194fa10050d66ab9cfbbf7e39986b6a
python_derived_from_recipe_hash: ccd630ff095847a6b7f52d7b98e705b4dc2308afa2e4e590f298c3d19bad8de5
---

# Description

Calls the excited note and returns the result.


# Recipe

Let result = Call [[excited]] with word="cheer".
Return result.

# Python

```python
def compute(context):
  result = excited(word='cheer')
  return result

```
