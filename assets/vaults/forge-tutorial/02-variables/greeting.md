---
type: action
inputs: []
facet_form: canonical
description: Chapter 2 — Variables. Names two values and joins them into a greeting.
english_hash: 14393c45653eec2b10a8b4e45b52a8640a595023035efcda7bc40978110047e9
---

# English

Set name to "Ada".
Set greeting to "Hello, " plus name.
Do [[print]](greeting).

# Python

```python
def compute(context):
    name = "Ada"
    greeting = "Hello, " + name
    print(greeting)
```

# Dependencies

[[print]]
