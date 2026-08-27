---
type: action
description_hash: b92ddc485e341d0131b1b3b68ceeb510ef0535d6b094fe363a5fc446d34dc269
recipe_hash: da84477d105d869993f1718c4c85917cd94459260b3898f00b37416a4852bc70
python_hash: b0dd246a844e8914b7bc3cf23617f553bc10d5802965584a872715295358a82d
recipe_derived_from_source_hash: b92ddc485e341d0131b1b3b68ceeb510ef0535d6b094fe363a5fc446d34dc269
python_derived_from_source_hash: b92ddc485e341d0131b1b3b68ceeb510ef0535d6b094fe363a5fc446d34dc269
source_facet: synced
recipe_derived_from_description_hash: b92ddc485e341d0131b1b3b68ceeb510ef0535d6b094fe363a5fc446d34dc269
python_derived_from_recipe_hash: da84477d105d869993f1718c4c85917cd94459260b3898f00b37416a4852bc70
---

# Description

This note is broken on purpose. It's supposed to build a greeting the same
way [[greeting]] does and print "Hello, Codey!" — but someone typed one word
with quotes around it that shouldn't have quotes. Find it and fix it.

# Recipe

Let name = "Codey".
Let greeting = "Hello, " + name + "!".
Return "greeting".

# Python

```python
def compute(context):
  name = 'Codey'
  greeting = (('Hello, ' + name) + '!')
  return 'greeting'

```
