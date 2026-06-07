---
type: data
content_type: yaml
read_only: true
schema_version: 3
description: forge-tutorial chip palette — library floor (schema v3). Declares the whole tutorial vocabulary as synthetic chips. Each chapter's own _chips.md hides what it hasn't introduced yet (hide[] unions up the walk), so the palette grows one construct at a time as the learner advances.
---

# Body

```yaml
synthetic_chips:
  - label: "print"
    insertion: 'Do [[print]]("<message>").'
    group: "Builtins"
    order: 1
  - label: "Set"
    insertion: 'Set <name> to <value>.'
    group: "Statements"
    order: 1
  - label: "Give back"
    insertion: 'Give back <value>.'
    group: "Statements"
    order: 2
  - label: "If"
    insertion: |
      If <condition>:
          <body>
    group: "Statements"
    order: 3
  - label: "Otherwise"
    insertion: |
      Otherwise:
          <body>
    group: "Statements"
    order: 4
  - label: "For each"
    insertion: |
      For each <item> in <collection>:
          <body>
    group: "Statements"
    order: 5

groups:
  - id: Builtins
    order: 1
    label: "Built-in functions"
  - id: Statements
    order: 2
    label: "Language constructs"
```
