---
type: action
---

# Description

Chapter 9 — Forge fills in a value from your plain-English request.

The `{{...}}` syntax is the V2.1 "expressiveness escape valve": when
you can't (or don't want to) deterministically specify a value in
the Recipe, write a free-English description between double-braces.
Forge routes that description to an LLM at compile time; the resolved
expression is cached in this note's frontmatter so subsequent
Forge-clicks are instant. Edit the description text → cache key
changes → re-resolves on the next click.

# Recipe

Let fact = {{a random fun fact about octopuses}}.
[[print]] fact.
