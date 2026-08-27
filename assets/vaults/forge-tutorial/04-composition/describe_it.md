---
type: action
inputs: []
source_facet: description
description_hash: de60aeb12f8db0d41f733ea7fce69fbc361dbe968708751e205f8e425025c0f0
recipe_hash: ecdc77cb658c99430ed1f18d5cfe42963facc02d855527c9e4ba3518764f5f5c
python_hash: 9ad7265efd6fcabbe0aac0608013919441618347db45383299e8d5a417bb17d7
recipe_derived_from_description_hash: de60aeb12f8db0d41f733ea7fce69fbc361dbe968708751e205f8e425025c0f0
recipe_derived_from_source_hash: de60aeb12f8db0d41f733ea7fce69fbc361dbe968708751e205f8e425025c0f0
recipe_version: 1
python_derived_from_recipe_hash: ecdc77cb658c99430ed1f18d5cfe42963facc02d855527c9e4ba3518764f5f5c
---

# Description

Calls [[excited_word]] and returns "This is " followed by its result and a period — for example, "This is wonderful.".

# Recipe

Let word = Call [[excited_word]].
Return "This is " + word + ".".

# Python

```python
def compute(context):
  word = excited_word()
  return (('This is ' + word) + '.')
```
