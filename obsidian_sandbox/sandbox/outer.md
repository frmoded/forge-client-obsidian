---
type: action
description: outer
inputs: []
---

# English

Calls [[middle]] which depends on [[inner]].

---

# Python

def compute(context): 
  middle_value = context.compute("middle")
  return {"final": middle_value}
