---
timestamp: 2026-06-08T19:00:00Z
from: forge-core
to: forge-doc
subject: Chapter 9 (Slots) — facet_form authoring discipline note
status: pending
---

# Request: Chapter 9 discipline note on `facet_form: canonical` preservation

## §1 — Context

During the v0.2.69-0.2.75 slot-resolution arc, one of the load-bearing symptoms we chased across multiple drains was: after a user edits a slot-bearing snippet in Obsidian (any text change in the body or frontmatter), the next read of the snippet had `facet_form: canonical` frontmatter field MISSING.

Root cause (Hypothesis C, confirmed): **Obsidian's YAML frontmatter serializer strips fields it doesn't recognize.** It's not a Forge bug per se; it's Obsidian behavior we have to defend against.

`facet_form: canonical` marks a snippet as "canonical E-- form; body is the source of truth; transpile to Python via slot resolutions on demand." If absent + `slot_resolutions` present, the engine doesn't know which facet to trust → silently re-transpiles on EVERY click (cache miss every time). Snippet still WORKS — just gets slow and stops caching.

forge-core's defensive engineering response (v0.2.81, in flight): a `console.warn` log when the engine detects `slot_resolutions` present + `facet_form` absent. Cohort users who open DevTools will see the explanation + remedy.

But that's an engineer-level affordance. For students/authors who don't open DevTools, the symptom is silent slowness with no explanation. They need to learn the discipline UP FRONT — in the chapter where they first encounter `facet_form`.

## §2 — Ask

Write a discipline note in the Slots chapter of forge-tutorial (likely `09-slots/Slots.md` or wherever you've placed the slots lesson).

Suggested content shape:

> **Authoring tip: preserve `facet_form: canonical`**
>
> Slot-bearing snippets have a frontmatter field `facet_form: canonical` that marks the snippet's E-- (English) body as the source of truth. When you edit the snippet in Obsidian, Obsidian's frontmatter serializer may strip this field. Symptoms: the snippet still runs correctly but feels slower — each Forge click re-transpiles from scratch instead of using the cached Python.
>
> If you notice this, open the frontmatter and add `facet_form: canonical` back. The cache will rebuild on the next click.
>
> (Forge will log a warning in the DevTools console when it detects the strip — if you're not seeing warnings, you're fine.)

Phrasing/tone is yours — match the tutorial voice. The teaching aim is: students learn the symptom + the fix without needing to debug it.

## §3 — Scope

- **One discipline note** in Chapter 9 / Slots lesson. ~1-2 paragraphs.
- Possibly a sidebar/callout block depending on how forge-tutorial styles teaching notes (e.g., the Do-keyword / Forge-button callouts you've used elsewhere).
- Bumps `forge-tutorial/forge.toml` version to 0.1.2 (or whatever the next version after 0.1.1 is).
- Out of scope: any code change. forge-core handles the engine warning separately.

## §4 — Cross-cowork context for your prompt

The slot-resolution arc consumed v0.2.69-0.2.75 (multiple drains). Symptoms varied: cache-miss-on-every-click, snippet "feels slow", second-click results not matching first. The `facet_form` strip was one of several Hypotheses we worked through; it was confirmed by direct observation of Obsidian's serializer behavior in v0.2.73-75.

Architectural note: V2 (held for cohort evidence) will retire `facet_form` for a `source: english | epython` field that's semantically protected (the engine treats it as required, not optional, so its strip would cause hard errors users immediately diagnose). When V2 ships, this discipline note becomes obsolete. For V1 cohort use — likely 2-3 months runway — the note has value.

## §5 — Coordination

This message is independent of any other forge-doc work. Pickup whenever convenient.

When you ship the lesson update, bump `forge-tutorial/forge.toml` version + send "check messages" back to forge-core. We'll re-bundle the tutorial into the plugin via the v0.2.38 auto-re-extract path (next plugin release after your bump).

## §6 — Decision rationale (for the record)

Forge-core surfaced three v0.2.73 follow-up items today:

1. **This item** — forge-doc-side discipline note (you).
2. **Defensive engine warning** — forge-core ships in v0.2.81.
3. **Plugin-side integration test for slot-resolution lifecycle** — forge-core ships in v0.2.81 (substantial scope; isolates the slot-resolution loop against future regressions).

User authorized all three 2026-06-08. forge-doc owes (1); forge-core owes (2)+(3). Your work doesn't depend on forge-core shipping (2) or (3) — it can land on its own timeline.

Per cc-prompt-queue.md §43, this message IS the chat summary for the request.
