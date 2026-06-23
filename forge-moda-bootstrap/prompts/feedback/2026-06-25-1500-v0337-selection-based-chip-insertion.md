---
prompt: 2026-06-25-1500-v0337-selection-based-chip-insertion.md
shipped_version: v0.2.137
session: drain-2026-06-25-1500
date: 2026-06-25
status: shipped
---

# v0337 feedback — selection-based chip insertion

## §1 — What shipped (v0.2.137)

### §1.1 — Convention audit (§2.4 of prompt)

Grepped `<...>` and `...` patterns across `forge-tutorial/_meta/_chips.md`, `forge-moda/_meta/_chips.md`. Findings:

- **All tutorial synthetic chips use `<name>` angle-bracket placeholders consistently**: `Do [[print]]("<message>").`, `Set <name> to <value>.`, `Give back <value>.`, `If <condition>:`, `Otherwise:`, `For each <item> in <collection>:`, `<body>`.
- No ellipsis-based placeholders.
- moda chips are signature-derived (per the file's description: "no insertion strings hand-authored here") — placeholders come from `inputs:` field shape.

Conclusion: **angle-bracket `<name>` is the canonical placeholder convention**. Adopted as v1 source of truth; no migration needed for existing chips.

### §1.2 — New pure-core `applySelectionToChip(chipBody, selection)`

Lives in `chips-core.ts`. Behavior:

- **No selection** (empty/null/undefined) → return chip body unchanged.
- **Selection + empty chip body** → return chip body unchanged (defensive — empty chip "replacing" something would surprise).
- **Selection + chip body with `<...>` placeholder** → replace FIRST placeholder with selection.
- **Selection + chip body without placeholder** → return chip body unchanged (no-op passthrough; deferred "wrap" semantic for v2).

Regex: `/<([^<>]+)>/` — matches angle-bracket placeholders that don't contain `<` themselves (defensive against nested patterns in code-like chip bodies).

### §1.3 — Integration in `chips-view.ts`

In `onChipClick` (line ~388):
- Detect cursor + selection via the resolved view's editor (`getCursor`, `getSelection`).
- If selection is non-empty: call `applySelectionToChip(insertion, selection)` BEFORE handing off to `insertChipTextAtLine`.
- Selection is consumed by the chip body (not replaced separately); the existing `insertChipTextAtLine` path handles cursor positioning + indent matching (v0.2.135).

### §1.4 — Tests: 11 failing-first cases

- Empty / null / undefined selection → chip unchanged (3 cases).
- Placeholder + selection → first placeholder replaced (2 cases — single-line + multi-line `If`).
- For each chip (two placeholders) → first match wins.
- No placeholder + selection → no-op passthrough.
- Empty chip body + selection → empty chip returned.
- Selection with newline → spliced in verbatim (downstream indent-matching handles).
- Nested angle brackets → defensive regex matches inner pattern only.

Total: **721 plugin tests passing (710 + 11 new)**.

### §1.5 — Convention decisions

Per prompt §2.5, the "wrap vs replace" decision: chose **replace-only for v1**. Reasoning:
- Every chip in current libraries has a placeholder, so replace covers 100% of practical cases.
- Wrap semantics would require deciding WHERE the selection goes for placeholder-less chips (above? below? wrapped around?). Deferring this avoids shipping a guess.
- No-op passthrough is the safe default — predictable behavior, no silent surprise.

If a future chip lacks placeholders and would benefit from wrap, v2 can add a `wrap_placeholder: true` chip-config field with explicit positioning.

## §2 — Tests + release

- 721 plugin tests passing (710 + 11 new).
- Build clean.
- Tag `v0.2.137` + GH release with assets.
- INSTALL.md synced.
- release.sh inlined-version preflight passed cleanly.

## §3 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): convention audit before code.
- ✓ §57–74 (TDD): 11 failing-first pure-core tests.
- ✓ §86–118 (pure-core convention): `applySelectionToChip` is a new pure-core helper joining the chips-core family.
- ✓ §76 (don't ship speculative fix): driver-flagged carry-forward + concrete examples.
- ✓ §347 (version-bump sanity check): release.sh handled v0.2.137 cleanly.
- ✓ §321 (feedback before move): standard.
- ✓ v0.2.120 console.error HARD RULE: no new catches in this drain.
- ✓ v0.2.134 §5 release.sh inlined-version preflight: passed.

## §4 — User-side smoke (deferred to driver)

Per §4 of prompt:
1. Open snippet, select `state`, palette → `Set` chip → expect `Set state to <value>.`
2. Open snippet, select `particle hits wall`, palette → `If` chip → expect `If particle hits wall:` with `<body>` placeholder still present.
3. Open snippet, no selection, palette → any chip → v0.2.135 behavior unchanged.

## §5 — Open follow-ups + carry-forward

After this drain, remaining tracking-lane QoL items:
- v0.2.119 persistent expanded-state (v0338 next)
- v0.2.122 granular toggle commands (v0339 next)
- Wrap-semantics for placeholder-less chips (deferred to v2)
- v0.2.131 §4 #2 status-bar persistent indicator (defer until cohort feedback)
- v0.2.91 + v0.2.92 CDN resilience (3 items — publish-readiness bundle)

## §6 — Architectural framing

V1 QoL polish. Reduces friction for chip-driven authoring. The angle-bracket convention is now codified as the canonical chip placeholder pattern — future chip authoring guidance can reference `<name>` as the spec.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §7 — Hand-off

v0.2.137 shipped. v0338 (persistent expanded-state) up next.
