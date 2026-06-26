---
type: data
content_type: yaml
read_only: true
schema_version: 3
description: forge-tutorial chip palette — library floor (schema v3). Declares the whole tutorial vocabulary as synthetic chips. Each chapter's own _chips.md hides what it hasn't introduced yet (hide[] unions up the walk), so the palette grows one construct at a time as the learner advances.
---

# Body

```yaml
# schema_version inside the body (in addition to frontmatter) because
# parseChipsV2Config reads it from the parsed YAML body, not from
# frontmatter. Mirrors the forge-moda _chips.md shape. (v0.2.135 fix
# per v0334 §3: pre-v0.2.135 the body was missing this line and the
# parser fell through with "schema_version must be 2 or 3, got
# undefined", silently dropping the tutorial's synthetic-chip palette.)
schema_version: 3

synthetic_chips:
  - label: "print"
    insertion: 'Call [[print]] with text="<message>".'
    group: "Builtins"
    order: 1
  - label: "Let"
    insertion: 'Let <name> = <value>.'
    group: "Statements"
    order: 1
  - label: "Return"
    insertion: 'Return <value>.'
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
