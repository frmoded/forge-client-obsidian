---
type: action
inputs:
  - first_name
  - last_name
source_facet: description
description_hash: f3ef717735c4e1512c2a4a0288b76fcd245750c8640cebd33e7e957ea3c95551
recipe_hash: 0984b7a60d86eb5b59b2968af78cf7343520f11ba71070ced04e187c800e380a
python_hash: 1c47ab36215af66ac83510d5bb03b49982b0c10951ec01cdbb0238bdefe8dfb3
recipe_derived_from_description_hash: f3ef717735c4e1512c2a4a0288b76fcd245750c8640cebd33e7e957ea3c95551
recipe_derived_from_source_hash: f3ef717735c4e1512c2a4a0288b76fcd245750c8640cebd33e7e957ea3c95551
recipe_version: 1
python_derived_from_recipe_hash: 0984b7a60d86eb5b59b2968af78cf7343520f11ba71070ced04e187c800e380a
python_derived_from_source_hash: f3ef717735c4e1512c2a4a0288b76fcd245750c8640cebd33e7e957ea3c95551
---

# Description

A function that takes two inputs — first_name and last_name — and joins them into one string. Given no inputs, defaults to first_name="Ada", last_name="Lovelace" and returns "Ada Lovelace".

## Inputs

- first_name — a given name
- last_name — a family name

# Recipe

Input first_name: str = "Ada".
Input last_name: str = "Lovelace".
Return first_name + " " + last_name.

# Python

```python
def compute(context, first_name: str = 'Ada', last_name: str = 'Lovelace'):
  return ((first_name + ' ') + last_name)
```
