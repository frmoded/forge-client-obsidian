---
type: action
inputs: []
facet_form: canonical
description: Chapter 5 — Conditionals. Chooses what to say based on a value.
english_hash: ba644ca423e55f9aaa512de267ef2e2385783dc15d0adca9de81997f20c12f2b
---

# English

Set temperature to 72.
If temperature is greater than 80:
    Do [[print]]("It's hot.").
Otherwise:
    Do [[print]]("It's pleasant.").

# Python

```python
def compute(context):
    temperature = 72
    if temperature > 80:
        print("It's hot.")
    else:
        print("It's pleasant.")
```

# Dependencies

[[print]]
