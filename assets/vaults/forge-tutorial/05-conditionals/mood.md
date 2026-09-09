---
type: action
inputs:
  - style
source_facet: description
description_hash: 499a494b6ee8814198b45f9ca03394a92dc215223976425a38ff470976da29f3
recipe_hash: 88d9f9076020b3f3afc8c37a6ab5365ae3438c9a350c73a2d351e2eb0033a84b
python_hash: 1f32b7253202ea41f21654710b70d13709789f3797330c42ff508703fc671b09
recipe_derived_from_description_hash: 499a494b6ee8814198b45f9ca03394a92dc215223976425a38ff470976da29f3
recipe_derived_from_source_hash: 499a494b6ee8814198b45f9ca03394a92dc215223976425a38ff470976da29f3
recipe_version: 2
python_derived_from_recipe_hash: 88d9f9076020b3f3afc8c37a6ab5365ae3438c9a350c73a2d351e2eb0033a84b
python_derived_from_source_hash: 499a494b6ee8814198b45f9ca03394a92dc215223976425a38ff470976da29f3
---

# Description

An input with a fixed set of choices shows up as a dropdown instead of a text box. Pick a style and get a greeting in that voice.

## Inputs

- style — one of "cheerful", "formal", "sleepy"

# Recipe
Input style: 'cheerful' | 'formal' | 'sleepy' = "cheerful".
If style == "cheerful":
  Return "Hey hey hey!!!".
If style == "formal":
  Return "Good day to you.".
Return "...zzz...".

# Python

```python
from typing import Literal

def compute(context, style: Literal['cheerful', 'formal', 'sleepy'] = 'cheerful'):
  if (style == 'cheerful'):
    return 'Hey hey hey!!!'
  if (style == 'formal'):
    return 'Good day to you.'
  return '...zzz...'
```
