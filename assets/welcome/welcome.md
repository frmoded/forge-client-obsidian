---
type: action
inputs: []
description: Welcome to Forge. Forge-click this file to see your first artifact.
---

# Description

Print "Welcome to Forge." Then greet the world by calling [[greet]].

# Recipe

[[print]] "Welcome to Forge.".
Call [[greet]] with name="world".

# Dependencies

[[greet]] [[print]]
