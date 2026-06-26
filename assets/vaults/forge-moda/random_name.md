---
type: action
description: Build a random N-character lowercase name. Used by both the freeze-via-wikilink demos AND canonical_demo_compose (Stage 2.5).
---

# Description

Build a string of `n` random lowercase letters and return it. Used
by the freeze-via-wikilink demos and `canonical_demo_compose`.

## Inputs

- n — number of letters (e.g. 5)

# Recipe

Let name = Call [[random_name]] with n=n.
Return name.
