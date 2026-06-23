---
timestamp: 2026-06-25T15:00:00Z
session_id: drain-2026-06-25-1500
status: pending
priority: LOW — QoL feature; carry-forward from chip-ribbon backlog
---

# v0.2.137 (renumber to current) — SELECTION-based chip insertion

## §0 — Bug / feature

When a user has text selected in the editor and invokes the chip palette, chip insertion currently ignores the selection — it inserts at the cursor position (collapsing or pushing the selection aside). Authoring intent is almost always "wrap the selection with this chip" or "replace the selection with this chip's body".

### §0.1 — Concrete examples

1. User selects `state` → opens chip palette → picks `Set` chip → expected: chip body uses `state` as its operand (e.g. `Set state to ...`), or the selection is replaced by the chip body. Actual: chip inserts unrelated text at cursor; selection still highlighted but ignored.
2. User selects `if particle hits wall` (a phrase) → opens chip palette → picks `If` chip → expected: `If if particle hits wall: ...` (the chip wraps the selection) or the chip's placeholder is replaced by the selection. Actual: chip inserts the empty template at cursor.

The current behavior makes chip palette feel less integrated than it should — the selection is a strong intent signal and we ignore it.

## §1 — Goal

When the editor has a non-empty selection at chip-palette-invocation time, chip insertion uses the selection as input. Two specific behaviors based on chip type:

- **Single-line chip with a clear "subject" slot** (Set, Give back, print): the selection replaces the slot's placeholder text.
- **Multi-line chip with a body block** (If, For each, Otherwise): the selection wraps as the chip body (or replaces the placeholder body).

If no selection is present, current behavior unchanged.

## §2 — Investigation phase (per §78)

### §2.1 — Locate the insertion point

`src/chips.ts` is the home for chip palette insertion. Find `insertChipTextAtLine` (v0.2.135 §2 added pure-core helpers around it). The flow:
1. Palette user picks a chip.
2. Code calls `insertChipTextAtLine(editor, line, chipText)`.
3. Helper applies indentation (v0.2.135) + inserts.

We need to inject a "selection-aware" branch before step 3 fires.

### §2.2 — Selection detection

```typescript
const sel = editor.somethingSelected() ? editor.getSelection() : '';
```

(Confirm the exact Obsidian editor API; may be `editor.getSelection()` returning empty string if no selection — same shape.)

If `sel` is non-empty:
- Strip the selection ranges.
- Pass `sel` to a new pure-core helper `applySelectionToChip(chipBody, selection) → string`.

### §2.3 — Pure-core: `applySelectionToChip` (NEW)

`src/chips-core.ts`. New helper:

```typescript
export function applySelectionToChip(
  chipBody: string,
  selection: string,
): string {
  if (!selection) return chipBody;
  // Detect a placeholder pattern in the chip body. Two conventions:
  //   1. `<...>` — angle-bracket placeholder (e.g. "Set <x> to <value>")
  //   2. ellipsis "..." — Python-ish placeholder
  // Replace the FIRST placeholder match with the selection.
  // If no placeholder, prepend the chip body before the selection
  // (so the chip wraps the selection: "If <selection>: <body>").
  // ...
}
```

Decision needed in §2.4: which convention is canonical?

### §2.4 — Convention check on existing chips

```bash
# Audit existing chip bodies for placeholder patterns:
grep -n "<[a-z_]*>" forge-moda-bootstrap/forge-tutorial/_meta/_chips.md
grep -n "\.\.\." forge-moda-bootstrap/forge-tutorial/_meta/_chips.md
# Plus moda + music _chips.md
```

Convention will emerge from the data. Likely a mix; pick the most-used as canonical and document the rule. Don't force-migrate other patterns in this drain — incremental.

### §2.5 — Replacement vs wrap (which fires when?)

Heuristic:
- Chip body contains `<...>` placeholder → replacement (selection replaces FIRST placeholder).
- Chip body contains NO placeholder → wrap (selection is suffix-appended OR inserted between header line and body block).

CC's call after reading the existing chip set. Document the decision in feedback.

### §2.6 — Insertion mechanics

After computing the modified chip body:
- Delete the editor's current selection range.
- Insert the modified body at the (now-collapsed) cursor position.
- Apply existing v0.2.135 indent-matching.

## §3 — Tests required (TDD per §57–74)

### §3.1 — Pure-core (failing-first)

`chips-core.test.ts`:
1. `applySelectionToChip` no-selection → chipBody unchanged.
2. `applySelectionToChip` placeholder + selection → placeholder replaced.
3. `applySelectionToChip` no placeholder + selection → wrap pattern (chip wraps selection).
4. `applySelectionToChip` selection with special chars (newlines, quotes) → handled cleanly.
5. `applySelectionToChip` empty chipBody + non-empty selection → defensive (return selection? return empty? — decide & test).

### §3.2 — Integration smoke

`chips.test.ts` (if it exists; otherwise note as user-side smoke only):
- Mock editor with `getSelection()` returning a string → assert chip insertion uses selection.
- Mock editor with empty selection → assert current v0.2.135 behavior unchanged.

## §4 — User-side smoke

1. Open a snippet in english mode.
2. Select a word (e.g. `state`).
3. Open chip palette; pick a chip with a placeholder (Set or print).
4. Expected: selected word replaces the placeholder; surrounding chip text unchanged.

5. Open a snippet.
6. Select a phrase (e.g. `particle hits wall`).
7. Open chip palette; pick a chip with no placeholder (If or For each).
8. Expected: phrase appears inside the chip body in the appropriate position (e.g. `If particle hits wall: ...`).

9. Open a snippet.
10. Do NOT select anything.
11. Open chip palette; pick any chip.
12. Expected: current v0.2.135 behavior — chip inserts at cursor with indent matching.

## §5 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §2 enumerates the API + pattern audit.
- ✓ §57–74 (TDD): §3 pure-core failing-first cases.
- ✓ §86–118 (pure-core convention): `applySelectionToChip` is a NEW pure-core helper.
- ✓ §76 (don't ship speculative fix): driver-flagged carry-forward + concrete examples.
- ✓ §347 (version-bump sanity check): release.sh bumps appropriately (current+1).
- ✓ §321 (feedback before move): standard.
- ✓ v0.2.120 console.error HARD RULE: if any catches added, follow the rule.

## §6 — Open follow-ups + carry-forward

After this drain, remaining tracking-lane QoL items:
- v0.2.119 persistent expanded-state (v0.2.138 prompt next)
- v0.2.122 granular toggle commands (v0.2.139 prompt next)

## §7 — Architectural framing

V1 QoL polish. Reduces friction for chip-driven authoring. No V2 commitments.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §8 — Hand-off

Single focused drain. Pure-core extraction + integration glue. Estimated CC time: 30-45 min.

If §2.4 audit reveals the chip placeholder conventions are too fragmented to pick a canonical one (more than 3 patterns in active use), surface and split: ship a normalization prompt first, then the selection-aware logic. My guess: convention is mostly consistent; this won't trigger.
