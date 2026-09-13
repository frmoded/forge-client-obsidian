---
type: action
description_hash: 812dfbfc548e33870768ebf3d22e16ad0b9cde0b4f6e236603890c515acb3846
recipe_hash: a835eeb023d442fe6b6fbe59832c93aebffdfe31ee012f318276fb223ce07a57
python_hash: ce9853fe0bbf52764f93b2a16d7b44c6d5efb4715cdc7bca68ca258451254498
recipe_derived_from_source_hash: 812dfbfc548e33870768ebf3d22e16ad0b9cde0b4f6e236603890c515acb3846
source_facet: recipe
recipe_derived_from_description_hash: 812dfbfc548e33870768ebf3d22e16ad0b9cde0b4f6e236603890c515acb3846
python_derived_from_source_hash: a835eeb023d442fe6b6fbe59832c93aebffdfe31ee012f318276fb223ce07a57
python_derived_from_recipe_hash: a835eeb023d442fe6b6fbe59832c93aebffdfe31ee012f318276fb223ce07a57
---

# Description

Calls the factorial note and returns the result.


# Recipe

Let r = Call [[factorial]] with n=7.
Return r.

# Python

```python
def compute(context):
  r = factorial(n=7)
  return r

```
