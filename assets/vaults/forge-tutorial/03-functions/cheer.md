---
type: action
description_hash: ce2515094c395ede82d33206df5bfc333790ef638a6d9bd3be97ec9c38aeb5ca
recipe_hash: 3999e92fca4f67ced2665eaeebfab25cbdcc6db7f0e0667b1aeecb474c94eddd
python_hash: e2232fee8be2b8e639dc4e76e03969b572cf018df71d40c2aae9337f7645c8c0
recipe_derived_from_source_hash: ce2515094c395ede82d33206df5bfc333790ef638a6d9bd3be97ec9c38aeb5ca
source_facet: description
recipe_derived_from_description_hash: ce2515094c395ede82d33206df5bfc333790ef638a6d9bd3be97ec9c38aeb5ca
python_derived_from_source_hash: ce2515094c395ede82d33206df5bfc333790ef638a6d9bd3be97ec9c38aeb5ca
python_derived_from_recipe_hash: 3999e92fca4f67ced2665eaeebfab25cbdcc6db7f0e0667b1aeecb474c94eddd
---

# Description

Chapter 3 — calls the excited note and returns the result.

**What's next:** [[excited]]

# Recipe

Let shout = Call [[excited]] with word="hooray".
Return shout.

# Python

```python
def compute(context):
  shout = excited(word='hooray')
  return shout

```
