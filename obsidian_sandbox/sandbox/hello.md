---
type: action
description: Generates a greeting based on project context.
---

# English

This action processes the incoming `context` object to generate a personalized greeting. It specifically looks for a variable named `name` passed within the `context` data. If the `name` variable is present, the action uses it to construct the output; otherwise, it falls back to "World" as the default subject.

**Logic Requirement**: Print a string that combines "Hello" with the value of the `name` variable extracted from the `context`.

---

# Python

def run(context):
  name = context.get("name", "World")
  print(f"Hello {name}")
