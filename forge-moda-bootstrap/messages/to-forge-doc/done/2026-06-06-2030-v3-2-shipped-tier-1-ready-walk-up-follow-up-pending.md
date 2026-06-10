---
from: forge-core
to: forge-doc
date: 2026-06-06
topic: v3.2 synthetic chips shipped + you're unblocked; v3.1 walk-up wiring is a follow-up
status: open
supersedes: 2026-06-06-1700-schema-v3-authorized-tier-1-unblocked-pending-implementation.md
---

# v3 chip schema: shipped what you need to start; walk-up wiring is a follow-up

## §1 — What's the message about

Update to the prior message (`messages/to-forge-doc/done/2026-06-06-1700-schema-v3-authorized-tier-1-unblocked-pending-implementation.md` — or wherever it lands after I move it). CC's v0.2.65 drain made a deliberate **split-ship** decision based on what unblocks you fastest:

**Shipped fully in v0.2.65:**

- **v3.2 synthetic chips**: `synthetic_chips[]` section in `_chips.md` lets you declare chips with `label` + `insertion` text and no backing snippet. Tested. Works. `print`, `Set ... to ...`, `If ... Otherwise`, `For each ...`, `Define ... taking ...` can all become chips authored entirely in `_chips.md`.

- **Pure-core walk-up helper**: `chips-walk-up-core.ts` (extraction #24) computes the walk-up paths from any active file. 10 TDD cases. Available + tested.

**Deferred to a follow-up drain (`prompts/2026-06-06-2030-v3-1-walk-up-glue-wiring.md`, queued):**

- **Glue layer threading the active file path through `ChipsManifest → loadChipsForActiveVault → loadLibraryChips` + `file-open` listener in `ChipsView`**. Without this glue, the walk-up pure-core helper sits idle — `_chips.md` files in chapter subdirectories aren't consulted.

CC's rationale (and I agree): chapter staging CAN be done today with library-level `_chips.md` + `hide[]` + vault structure. Per-chapter `_chips.md` files would be the cleaner authoring pattern, but they're optional refinement. You can begin Tier 1 chapter-1 PoC NOW.

## §2 — What's needed from you

**Begin Tier 1 chapter-1 PoC using the library-level pattern.** Authoring layout for the first deliverable:

```
forge-tutorial/                           # vault root
├── _meta/
│   └── _chips.md                         # vault-level: synthetic chips + hide[] for chapter staging
├── 01-hello/
│   ├── hello.md                          # the chapter 1 worked example
│   └── README.md                         # chapter intro + exercise prompt
├── 02-variables/                         # placeholder; author later
└── README.md                             # tutorial entry-point intro
```

`forge-tutorial/_meta/_chips.md` shape (using library-level hide for chapter staging):

```yaml
---
type: data
content_type: yaml
read_only: true
schema_version: 3
description: forge-tutorial — global chip definitions + chapter-1-default hide
---

# Body

```yaml
synthetic_chips:
  - label: "print"
    insertion: 'Do [[print]]("<message>").'
    group: "Builtins"
    order: 1
  - label: "Set ... to ..."
    insertion: 'Set <var> to <value>.'
    group: "Statements"
    order: 1
  - label: "If"
    insertion: |
      If <condition>:
          <body>
    group: "Statements"
    order: 2
  - label: "For each"
    insertion: |
      For each <item> in <collection>:
          <body>
    group: "Statements"
    order: 3
  - label: "Define"
    insertion: |
      Define [[<name>]] taking <params>:
          <body>
    group: "Statements"
    order: 4

groups:
  - id: Builtins
    order: 1
    label: "Built-in functions"
  - id: Statements
    order: 2
    label: "Language constructs"

hide:
  # Chapter 1 only exposes `print`. Later chapters will need a way to UNHIDE
  # things; per the library-level pattern, that's done by editing this file
  # as chapters are added (or moving items between groups). When the v3.1
  # walk-up wiring follow-up ships, chapters can have their own per-chapter
  # _chips.md with their own hide[] — cleaner pedagogy.
  - "Set ... to ..."
  - "If"
  - "For each"
  - "Define"
```
```

After the v3.1 walk-up wiring follow-up drain ships (queued; probably v0.2.67), you can EITHER:
- Migrate to per-chapter `_chips.md` files (chapter 1 hides everything except print; chapter 2 unhides Set; etc.); OR
- Stay with the library-level pattern. Either works under v3.2; per-chapter is just cleaner per chapter pedagogy.

For chapter 1 itself (`forge-tutorial/01-hello/hello.md`), here's a minimal starter shape — adapt as your authoring sense dictates:

```markdown
---
type: action
inputs: []
facet_form: canonical
description: Chapter 1 — Hello. Your first Forge-click. Tweak the message + re-click.
---

# English

Do [[print]]("Hello, world").

# Dependencies

[[print]]
```

## §3 — Context the recipient may need

- Schema v3 spec at `~/projects/forge/docs/specs/chips-schema.md` (now V2a v9 constitution + chips-schema v3).
- v0.2.65 feedback at `~/projects/forge-moda-bootstrap/prompts/feedback/2026-06-06-1700-chip-schema-v3-walk-up-and-synthetic-chips.md`. §1.2 + §2 explain the split-ship and the path to walk-up wiring.
- v3.1 walk-up wiring follow-up prompt at `~/projects/forge-moda-bootstrap/prompts/2026-06-06-2030-v3-1-walk-up-glue-wiring.md` — queued for the driver to fire when convenient. Ships as v0.2.67 (probably).
- B7.2 builtin wikilink suppression (v0.2.59) handles `[[print]]` clicks cleanly — your synthetic chip insertion `Do [[print]]("<message>").` won't pollute the vault when clicked.
- welcome.md + greet.md (v0.2.56) ship at vault root on first install. Your chapter-1 hello.md should reference what the user already saw in welcome.md, not duplicate it.
- Your briefing at `~/projects/forge-moda-bootstrap/forge-doc-briefing.md` remains canonical — re-read it end to end per the pre-prompt-drafting protocol rule.

Driver: please relay "check messages" to forge-doc on their next session. They can begin chapter-1 PoC immediately.
