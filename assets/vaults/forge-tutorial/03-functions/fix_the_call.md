---
type: action
description_hash: 9b73a75e1c77bd7a2a7351ee25e2c82524e30cd7ba0c94c109589efda35f7d52
recipe_hash: 8d18c804d30a2a42d5cc32ac19c073fcb7e7eb606d64b93981faec685014d875
source_facet: recipe
---

# Description

This note is broken on purpose. It's supposed to call [[excited]] with the
word "hooray" and hand back the shout — "hooray!" — but the call passes the
word over without saying which input it is. Run it, read the error, then fix
the call.

# Recipe

Let shout = Call [[excited]] with "hooray".
Return shout.
