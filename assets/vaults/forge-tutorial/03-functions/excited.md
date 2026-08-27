---
type: action
inputs:
  - word
description_hash: fadad5a1204974544b00dbc9ab5c0a885458a84320debb4accf474a60c6f7b08
recipe_hash: 8fb68b6e036ec49b849f072a355f31edb60e996711aceff9284694767f2db54f
python_hash: 9f22e0779157d3cd55c7471a82726bb6a0cccbcfe544df20300a5f9ee9ac7bef
recipe_derived_from_source_hash: fadad5a1204974544b00dbc9ab5c0a885458a84320debb4accf474a60c6f7b08
source_facet: description
recipe_derived_from_description_hash: fadad5a1204974544b00dbc9ab5c0a885458a84320debb4accf474a60c6f7b08
python_derived_from_source_hash: fadad5a1204974544b00dbc9ab5c0a885458a84320debb4accf474a60c6f7b08
python_derived_from_recipe_hash: 8fb68b6e036ec49b849f072a355f31edb60e996711aceff9284694767f2db54f
---

# Description

A reusable note that takes a word and returns it with excitement — given no word, defaults to "hooray" and returns "hooray!".

## Inputs

- word — the word to make excited

# Recipe

Input word: str = "hooray".
Return word + "!".

# Python

```python
def compute(context, word: str = 'hooray'):
  return (word + '!')

```
