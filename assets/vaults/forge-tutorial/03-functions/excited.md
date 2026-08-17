---
type: action
inputs:
  - word
description_hash: 30922e6c14498e658bd743028187c4c99610ce15a1fa48ed514593742e1eb46d
recipe_hash: 8fb68b6e036ec49b849f072a355f31edb60e996711aceff9284694767f2db54f
python_hash: 9f22e0779157d3cd55c7471a82726bb6a0cccbcfe544df20300a5f9ee9ac7bef
recipe_derived_from_source_hash: 30922e6c14498e658bd743028187c4c99610ce15a1fa48ed514593742e1eb46d
source_facet: description
recipe_derived_from_description_hash: 30922e6c14498e658bd743028187c4c99610ce15a1fa48ed514593742e1eb46d
python_derived_from_source_hash: 30922e6c14498e658bd743028187c4c99610ce15a1fa48ed514593742e1eb46d
python_derived_from_recipe_hash: 8fb68b6e036ec49b849f072a355f31edb60e996711aceff9284694767f2db54f
---

# Description

Chapter 3 — a reusable note that takes a word and returns it with excitement.

## Inputs

- word — the word to make excited

**What's next:** [[function_inputs]]

# Recipe

Input word: str = "hooray".
Return word + "!".

# Python

```python
def compute(context, word: str = 'hooray'):
  return (word + '!')

```
