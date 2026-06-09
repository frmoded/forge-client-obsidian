---
type: action
inputs: []
facet_form: canonical
description: Chapter 7 — Data. Reads a list from a data snippet and walks through it.
english_hash: d40c97c4ca7526cae9aea09a2e43190482271d7cf89a19eeb22b062d00a5c181
---

# English

Set palette to [[colors]]().
For each color in palette:
    Do [[print]](color).

# Python

```python
def compute(context):
    palette = colors()
    for color in palette:
        print(color)
```

# Dependencies

[[colors]]
[[print]]
