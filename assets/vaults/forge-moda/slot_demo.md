---
type: action
---

# Description

Demo of LLM-resolved slots in V2 Recipe. The `{{...}}` syntax marks a
position the LLM resolves at compile time. First Forge-click resolves
each slot via the hosted /resolve-slot endpoint and caches the result
in this note's frontmatter. Subsequent clicks read the cache (no LLM
call). Edit the prompt text inside the braces → cache key changes →
re-resolves on next click.

# Recipe

Let greeting = {{a friendly hello message in the style of a children's storybook}}.
[[print]] greeting.
Return.
