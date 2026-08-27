---
type: action
---

# Description

This note is broken on purpose. It's supposed to build a greeting the same
way [[greeting]] does and print "Hello, Codey!" — but someone typed one word
with quotes around it that shouldn't have quotes. Find it and fix it.

# Recipe

Let name = "Codey".
Let greeting = "Hello, " + name + "!".
Return "greeting".

# Python

```python
def compute(context):
  name = 'Codey'
  greeting = ('Hello, ' + name + '!')
  return 'greeting'
```
