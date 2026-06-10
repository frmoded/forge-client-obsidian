---
from: forge-doc
to: forge-core
date: 2026-06-07
topic: two tutorial-use feedback items for your lane — drop the `Do` keyword (E-- grammar) + gate the Forge button off non-snippet notes (plugin)
status: open
---

# Tutorial-use feedback: `Do` keyword + Forge-button gating

Driver gave tutorial feedback; two items are in your lane (E-- grammar + plugin
UX), relayed below. Two others were content-side (handled by me).

## §1 — Suggestion: drop the `Do` prefix on bare calls (E-- grammar)

Driver's read: a call should be written `[[print]]("hello, world").` rather than
`Do [[print]]("hello, world").` — simpler, and since action-snippet names are
verbs, the `Do` is redundant.

This is an E-- B7.1 grammar question, not a tutorial-content one: `Do <call>.` is
the canonical statement form for a call whose return value is discarded, paired
with `Set x to <call>.` for a returning call. Dropping `Do` means E-- has to
accept a bare `<call>.` as a statement. Since E-- is vendored upstream, this is
yours to weigh / ferry to the E-- cowork — I'm relaying, not requesting.

My forge-doc take, for what it's worth: the driver's readability intuition is
real (one less word, verb-named snippets read fine without `Do`). The
counter-considerations: (a) `Do` parallels `Set` / `If` / `Give back` / `For
each` — every statement opens with a keyword, which is easy to teach as "every
line starts with what it does"; (b) dropping it only for bare calls creates an
asymmetry — a returning call still needs `Set x to [[f]](...)`, so the learner
still meets the `[[ ]]`-without-`Do` and `[[ ]]`-with-`Set` forms. If E-- did
drop `Do`, the tutorial adapts trivially. Your/E--'s call.

## §2 — Forge button shows on non-snippet notes (plugin UX)

Verified concretely: `forge-client-obsidian/src/main.ts:847` adds the editor
Forge button (`view.addAction('flame', 'Forge', () => this.forgeSnippet())`) to
**every** markdown file. The `if (fm?.type === 'action')` gate at `main.ts:826`
only wraps the edit-mode toggle (lines 826–841); the Forge run button (847) and
New Snippet button (843) are added unconditionally after that block closes.

Consequence for the tutorial: the chapter **lesson notes** (`Hello.md`,
`Variables.md`, … — plain notes, no `type: action` frontmatter) show a Forge
button. Clicking it on a non-snippet would error (`forgeSnippet` has no English
facet to run). The driver flagged this from tutorial use: lesson notes are
notes, not snippets, and shouldn't present Forge UI.

Suggestion (your lane): gate the editor **Forge run button** (and likely the
mode/edges/chips buttons, maybe leave New Snippet) on snippet-ness — i.e.
`fm?.type === 'action' || fm?.type === 'data'` — so plain notes in a Forge vault
present no Forge UI. Benefits the tutorial (clean lesson notes) and general UX
(any stray note in a vault). I can't fix this content-side — there's no
frontmatter a note could carry to suppress an ungated button.

## §3 — Context

- Tutorial source: `~/projects/forge-tutorial/` (lesson notes are the
  title-named `.md` in each chapter dir; snippets are the canonical `.md`).
- Forge-button code: `forge-client-obsidian/src/main.ts:826` (gate), `:843`
  (New Snippet), `:847` (Forge run button).
- The other two feedback items were content-side and handled by forge-doc: a
  "snippets open in a new tab" tip (added to chapter 1) and a push-back on
  "every snippet should have a `# Python` facet" (canonical snippets are
  English-only by design; a `# Python` would shadow the canonical compile path
  per `resolve_action_code`).
