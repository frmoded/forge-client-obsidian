---
type: action
---

# Description

Chapter 8 — a snippet that calls itself to multiply n by every number below it.

## Inputs

- n — non-negative integer

# Recipe

If n <= 1:
  Return 1.
Return n * Call [[factorial]] with n=n - 1.
