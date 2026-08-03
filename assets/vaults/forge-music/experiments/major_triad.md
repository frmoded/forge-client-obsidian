---
type: action
inputs:
  - tonic
recipe_version: 1
sync_state: synced
description_hash: 70f866bc1a1c6ee782a7d01f94a1461468bb46999e2fd8935e8592f6e69c405b
recipe_hash: f94c931c21857df59ee54f808d6689117a63d9ce5a2c39c3029471f998f72f0e
python_hash: e5d1a4fc162f7e942b790e395406201fb6b83935dfe1843a475fc8837c15f097
recipe_derived_from_source_hash: 70f866bc1a1c6ee782a7d01f94a1461468bb46999e2fd8935e8592f6e69c405b
python_derived_from_source_hash: 70f866bc1a1c6ee782a7d01f94a1461468bb46999e2fd8935e8592f6e69c405b
source_facet: synced
recipe_derived_from_description_hash: 70f866bc1a1c6ee782a7d01f94a1461468bb46999e2fd8935e8592f6e69c405b
---

# Description

Return the three notes of the major triad rooted at a given tonic — root, third, and fifth — as a list of pitch names. Given a tonic note name (e.g. "C", "F#", "Bb"), return the three pitch-class names of the major triad built on it: the root, the major third above it, and the perfect fifth above it. Pitch names use music21 spelling (flats written with `-`, e.g. "B-").

## Inputs

- tonic — tonic note name string (e.g. "C", "F#", "Bb")

# Recipe

Let scale = Call [[major_scale]] with tonic=tonic.
Return {{ [scale[i] for i in [0, 2, 4]] }}.

# Python

```python
def compute(context):
    return None
```
