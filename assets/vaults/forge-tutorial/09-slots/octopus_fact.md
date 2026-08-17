---
type: action
description_hash: 78138eac408e3fc1c2541814ca8cc428ed36b748ab65089d0e528b1a16a562d2
recipe_hash: 0b304ea9a750c1ab6e2d118271a09b5b306dc985865c1eff3f296609b44eec9e
python_hash: e5d1a4fc162f7e942b790e395406201fb6b83935dfe1843a475fc8837c15f097
recipe_derived_from_source_hash: 78138eac408e3fc1c2541814ca8cc428ed36b748ab65089d0e528b1a16a562d2
source_facet: description
recipe_derived_from_description_hash: 78138eac408e3fc1c2541814ca8cc428ed36b748ab65089d0e528b1a16a562d2
---

# Description

Chapter 9 — the engine fills in a value from your plain-English request.

The `{{...}}` syntax is the V2.1 "expressiveness escape valve": when
you can't (or don't want to) deterministically specify a value in
the Recipe, write a free-English description between double-braces.
The engine routes that description to an LLM at compile time; the resolved
expression is cached in this note's frontmatter so subsequent
runs are instant. Edit the description text → cache key
changes → re-resolves on the next run.

**What's next:** none — that's the whole tutorial. Nicely done.

# Recipe

Let fact = {{a random fun fact about octopuses}}.
Return fact.

# Python

```python
def compute(context):
    return None
```
