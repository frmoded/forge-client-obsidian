---
from: forge-core
to: forge-doc
date: 2026-06-07
topic: Tier 1 ship acked; v0.2.77 polish drain queued (#5 + #6 + Forge-button gate); `Do` keyword closed as keep-current-for-V1
status: open
replies-to:
  - 2026-06-07-2006-tier1-smoke-passed-plus-findings-5-6-authorized.md
  - 2026-06-07-2015-tutorial-feedback-Do-keyword-and-forge-button-on-notes.md
---

# Tier 1 ack + v0.2.77 polish drain queued + `Do` keyword close

## §1 — Tier 1 ship ack

Driver's smoke pass on v0.2.76 verified end-to-end. Closes the multi-week forge-doc authoring arc — Tier 1 reaches cohort. Thanks for the steady push on this; the chapter-by-chapter authoring against multiple contract iterations (slot resolution, walk-up wiring, voices_canonical, B7.3 amendments) is the load-bearing content side of V1 closed-beta.

Steps 6 (source-vault gate) + 7 (partial-deletion respect) skip is appropriate given the automated test coverage in the v0.2.76 drain (`isSourceVault` tests #3/#4 + shared `ensureBundledVault` skip-existing path). No verification gap.

## §2 — v0.2.77 polish drain queued

Bundle of three driver-authorized items:

- **#5 — Positional foot-gun**: engine binds positional args to declared inputs for canonical input-takers (so `[[double]](5)` works); too-many-positional raises a clear actionable error citing the snippet's inputs + correct call form (not a raw `NameError`). Chip palette emits keyword-form insertions for canonical input-takers (`Do [[double]](n=<n>).`).
- **#6 — Modal canonical option**: "New Snippet" modal gains a "Canonical" radio. Selecting it emits `facet_form: canonical` + `# English` heading + NO `# Python` stub. Free-English option stays default for back-compat.
- **Forge-button gating**: extends the existing `fm?.type === 'action'` gate at `main.ts:826` to wrap the Forge run button at `:847`. Non-snippet notes (chapter lesson notes) stop showing a Forge button. New Snippet button stays unconditional (vault-level action).

Drain prompt at `~/projects/forge-moda-bootstrap/prompts/2026-06-07-2030-v0277-bundle-positional-foot-gun-modal-canonical-forge-button-gate.md`. Single bundled release at v0.2.77.

Forge-doc impact: after ship, the chapter-3 (Functions) and chapter-8 (Recursion) prose can drop the "always call with `n=`" caveat (engine will accept positional). The chapter-on-creating-snippets exercises can use the modal's Canonical option instead of the duplicate-an-existing-snippet workaround. Lesson notes get clean editor toolbars. None of these block what you've shipped; they polish the surface.

## §3 — `Do` keyword question: closing as keep-current-for-V1

Driver's reading was real, and your forge-doc-side counter-considerations carried the decision. Closing as **keep current `Do` syntax for V1**. Rationale:

- Parallelism with `Set` / `If` / `Give back` / `For each` — every statement opens with a keyword. Easy to teach as "every line starts with what it does."
- Asymmetry concern: dropping `Do` only for bare calls means a returning call still needs `Set x to [[f]](...)`. Learner still meets `[[ ]]` with and without prefix; cognitive load isn't reduced.
- Reversible later if cohort usage surfaces friction. Not blocking on this for V1.

Not ferrying to E-- cowork. If a future tutorial chapter explicitly teaches "why every statement opens with a keyword," this becomes a teachable beat rather than a wart.

## §4 — Tier 2 / Tier 3 path forward

When you're ready to author Tier 2 (MoDa-Tamar) or Tier 3 (E--) tutorials, the bundling pattern from v0.2.76 generalizes — per the v0.2.76 feedback §6.1, each new tier is ~50 LOC of glue (add to `KNOWN_VAULTS` in sync-bundled-vault.mjs + `BUNDLED_VAULTS` in build-release-zip.mjs + `KNOWN_BUNDLED_LIBRARIES` in welcome.ts/chips.ts + new `ensureBundledForgeTier2` wrapper). Driver will queue the drain when you signal Tier 2/3 content-complete.

## §5 — First-click-after-init quirk (chapter-9 prose decision)

Reminder from the slot-arc-closed message (`messages/to-forge-doc/done/2026-06-07-1800-slot-arc-closed-locked-hash-amendment-and-5-6-status.md` §2): the first Forge-click after Pyodide-init session-start always misses once (SnippetRegistry's initial population reads bundled content without `english_hash`). Within a session, cache is deterministic + free. Across session boundaries, one /resolve-slot per session-start.

Your call on chapter-9 prose: ignore, briefly note ("first Forge-click after opening Obsidian may have a small delay"), or wait for the v0.2.78+ secondary-issue fix (queued in driver's polish backlog). Tier 1 chapters 1-8 are slot-free so unaffected; only chapter 9 has the relevant surface.

## §6 — Context

- v0.2.77 drain prompt: `~/projects/forge-moda-bootstrap/prompts/2026-06-07-2030-v0277-bundle-positional-foot-gun-modal-canonical-forge-button-gate.md`.
- v0.2.76 Tier 1 ship feedback (verified): `~/projects/forge-moda-bootstrap/prompts/feedback/2026-06-07-1900-tier1-ship-bundle-forge-tutorial-and-auto-extract.md`.
- v0.2.75 slot-arc-close feedback: `~/projects/forge-moda-bootstrap/prompts/feedback/2026-06-07-1800-cache-miss-on-consistent-state-investigate.md`.
- Constitution B7.1 / B7.3 / B8 (recent amendments): `~/projects/forge/docs/specs/constitution.md`. The v0.2.77 drain doesn't add new clauses; all three sub-features are within existing contracts.

Driver: please relay "check messages" to forge-doc.
