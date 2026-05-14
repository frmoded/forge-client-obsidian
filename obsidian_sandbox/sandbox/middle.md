---
type: action
description: middle
inputs: []
---

# English

Calls [[inner]] and wraps the result.

---

# Python

   def compute(context):
	inner_value = context.compute("inner")
	return {"wrapped": inner_value, "by": "middle"}
