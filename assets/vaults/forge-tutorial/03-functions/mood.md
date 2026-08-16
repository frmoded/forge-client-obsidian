---
type: action
inputs:
  - style
source_facet: description
sync_state: synced
description_hash: 1f399496530d424c1cb3fa1bf1cd2aa4c7faede4a922f7a6857827c0b6dd4521
recipe_hash: b021764a6c06e758d387cc0a04ac066a505e9df78208506553758e0ded32e85e
python_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
recipe_derived_from_description_hash: 1f399496530d424c1cb3fa1bf1cd2aa4c7faede4a922f7a6857827c0b6dd4521
recipe_derived_from_source_hash: 1f399496530d424c1cb3fa1bf1cd2aa4c7faede4a922f7a6857827c0b6dd4521
python_derived_from_recipe_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
python_derived_from_source_hash: 1f399496530d424c1cb3fa1bf1cd2aa4c7faede4a922f7a6857827c0b6dd4521
recipe_version: 1
---

# Description

Chapter 3 — an input with a fixed set of choices shows up as a dropdown instead of a text box. Pick a style and get a greeting in that voice.

## Inputs

- style — one of "cheerful", "formal", "sleepy"

**What's next:** [[Composition]]

# Recipe

Input style: str = "cheerful".
If style == "cheerful":
  Return "Hey hey hey!!!".
If style == "formal":
  Return "Good day to you.".
Return "...zzz...".
