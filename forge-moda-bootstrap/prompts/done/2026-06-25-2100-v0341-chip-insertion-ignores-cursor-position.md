---
timestamp: 2026-06-25T21:00:00Z
session_id: drain-2026-06-25-2100
status: pending
priority: HIGH — driver smoke surfaced; chip insertion is broken at the target level
---

# v0.2.141 (renumber to current) — Chip insertion ignores cursor position; lands in # English regardless

## §0 — Bug report

Driver smoke 2026-06-25 detailed v0.2.135 verification, Step 5 reproducer:

Setup:
1. Open `~/forge-vaults/bluh/forge-tutorial/01-hello/hello_world.md` (canonical content; English starts with `Do [[print]]("hello, world")}}.`).
2. Append at end of file:
   ```
   # Sandbox
   
       (cursor placed at column 5 of this indented blank line, verified by mouse-click)
   ```
3. Save.
4. Cmd-P → "Forge: Open Chips" → type "If" → Enter.

Expected (per v0.2.135 §B Section B fix): chip body inserts at cursor position with leading-whitespace indent matching.

Actual: chip body inserts at the END of the existing `# English` line, NOT at the cursor position in `# Sandbox`.

After-state of the file:
```
# English

Do [[print]]("hello, world")}}. If <condition>:
    <body>

# Python
...

# Sandbox

    (cursor was here — unchanged)
```

Reproduced reliably with mouse-click cursor positioning (not keyboard nav). Multiple chip selections show same target.

### §0.1 — Why this is critical

This invalidates the v0.2.135 §B Section B fix's user-facing value. Section B's purpose was "preserve indentation across chip-body lines". But if chips never insert at cursor in the first place, the indent fix is dead code at runtime — every chip insertion goes to the same hardcoded location regardless of cursor.

The pure-core 13 tests for `applyIndentToChipBody` still PASS in isolation; the helper works correctly given correct input. The problem is upstream: the integration layer is calling `insertChipTextAtLine` with the wrong line number / cursor position.

### §0.2 — Why pure-core tests didn't catch this

`applyIndentToChipBody` and `extractLeadingWhitespace` accept `cursorLineContent` as a parameter and operate on it. They don't see how the caller decides which line `cursorLineContent` represents. CC's audit was source-level correct that the helpers work; smoke proved the calling integration is broken.

This is a textbook case of the runtime-evidence-beats-source-audit HARD RULE (v0.2.132). Source audit looked at `applyIndentToChipBody` and confirmed correctness; runtime caught that the wrong cursor line was being fed in.

## §1 — Goal

Chip insertion respects editor cursor position at the moment the chip palette closes (or the chip is selected). Inserts the chip body AT the cursor, with v0.2.135 §B indent matching from the cursor's line.

If cursor is in `# Sandbox` at column 5, chip inserts at column 5 of that line. If cursor is at end of `# English` line, chip inserts there. If no cursor (e.g., palette opened without an editor focused), the current default behavior is acceptable — but surface a clear log so we don't silently insert in a confusing location.

## §2 — Investigation phase (per §78)

### §2.1 — Trace the cursor-position lookup

`src/chips.ts`. Find where the chip palette modal's "on chip picked" handler:
1. Closes the modal.
2. Calls `insertChipTextAtLine(editor, line, chipText)` or equivalent.

The `line` argument's source is the question. Hypotheses:
- **H1**: `editor.getCursor().line` is called BEFORE the palette opens; the line number is captured at palette-open time. The palette's Cmd-P → command-palette → chip-modal flow may shift focus and lose the cursor, but the captured line was correct.
- **H2**: `editor.getCursor().line` is called AFTER the palette closes; cursor may be at column 0 of line 0 (or somewhere else) because focus transitions reset cursor in some Obsidian contexts.
- **H3**: There's a hardcoded "insert after `# English` heading" path that fires when invoked via Cmd-P (vs invoked from a different context like a right-click menu).
- **H4**: The chip palette uses a different "insertion point" abstraction that scans the document for a known landmark (e.g., end of # English section) rather than respecting cursor.

```bash
grep -n "getCursor\|insertChipTextAtLine\|chipPickedHandler\|openChipPalette" src/chips.ts src/main.ts | head -20
```

Read each match's context to identify which hypothesis holds.

### §2.2 — Test in isolation

If H2: try invoking the chip palette via an alternate path that doesn't go through Cmd-P:
- Add a temporary `addEventListener('click', ...)` handler on the editor itself to open the palette.
- See if click-driven invocation preserves cursor where Cmd-P-driven doesn't.

If cursor IS preserved on click but lost on Cmd-P, the bug is in the command-palette → chip-modal transition (focus shift bug).

### §2.3 — Capture cursor at palette-OPEN time, not palette-close time

If H2 is confirmed (cursor lost across modal close):

In the command's callback (the function registered via `addCommand({callback: () => ...})`), capture cursor immediately:

```typescript
addCommand({
  id: 'open-chips',
  name: 'Forge: Open Chips',
  callback: () => {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    const editor = view.editor;
    const cursorAtInvocation = editor.getCursor();  // CAPTURE BEFORE palette opens
    const lineAtInvocation = editor.getLine(cursorAtInvocation.line);
    
    // Open palette with the captured cursor as a closure
    new ChipPaletteModal(this.app, {
      onPick: (chipText) => {
        insertChipTextAtLine(
          editor,
          cursorAtInvocation,        // use captured cursor, not current
          lineAtInvocation,          // and captured line content
          chipText,
        );
      }
    }).open();
  },
});
```

(Adjust to match actual modal class + signature.)

### §2.4 — Defensive: warn if cursor at column 0 of line 0

If the captured cursor is at `{line: 0, ch: 0}` (often a "no real cursor" sentinel), log a `console.error('openChipPalette: cursor at sentinel position, inserting at top of file may be unintended')` so cohort users at least get a diagnostic. Don't block the insertion — just surface it.

## §3 — Pure-core changes (if any)

`applyIndentToChipBody` + `extractLeadingWhitespace` are correct as-is per their tests. No change needed there.

`insertChipTextAtLine` itself may need a signature adjustment if it's currently doing its own `editor.getCursor()` call. Push that responsibility up to the caller (per H2 fix). The function becomes:

```typescript
insertChipTextAtLine(
  editor: Editor,
  position: EditorPosition,     // line + ch
  lineContent: string,          // already-fetched
  chipText: string,
): void
```

Caller is now responsible for fetching both — and the caller IS the place where the cursor was captured (per H2 fix).

## §4 — Tests required (TDD per §57–74)

### §4.1 — Pure-core (existing tests stay passing)

Verify `applyIndentToChipBody` 6 tests + `extractLeadingWhitespace` 5 tests still pass after any signature changes. No new pure-core tests for this drain.

### §4.2 — Integration / behavior test

If the harness can mock a chip palette modal: a test that asserts the cursor captured at palette-open time is honored at palette-close time.

If the harness can't: explicit user-side smoke (this drain ships smoke + commit).

### §4.3 — Regression: 2 driver smoke reproducers as documented fail-cases

Document in feedback that the v0.2.135 §B Section B chip indent fix CANNOT be verified end-to-end without this v0.2.141 fix landing first. The two are coupled: this fix unblocks Section B's runtime value.

## §5 — User-side smoke (deferred to driver)

Repro from §0. Expected after fix:
1. Open hello_world.md.
2. Append # Sandbox with a 4-space-indented blank line.
3. Click the indented line at column 5.
4. Cmd-P → Forge: Open Chips → If → Enter.
5. Chip body inserts AT the cursor in # Sandbox, with each line's leading 4-space indent matched.

Resulting Sandbox section:
```
# Sandbox

    If <condition>:
        <body>
```

## §6 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §2 enumerates 4 hypotheses + grep targets.
- ✓ §57–74 (TDD): integration test if harness permits; otherwise smoke.
- ✓ §86–118 (pure-core convention): no new pure-cores; existing ones unchanged.
- ✓ §76 (don't ship speculative fix): driver-smoke-flagged with reproducer.
- ✓ §347 (version-bump sanity check): release.sh bumps appropriately.
- ✓ §321 (feedback before move): standard.
- ✓ v0.2.120 console.error HARD RULE: any new catches use console.error with method-name prefix.
- ✓ v0.2.124 pure-core dispatch HARD RULE: if §2.3's capture-at-open logic adds branching, consider extraction.
- ✓ v0.2.132 runtime-evidence-beats-source-audit HARD RULE: APPLIED — this drain exists because runtime smoke caught what source audit missed.

## §7 — Open follow-ups

1. **v0.2.137 selection-based chip insertion (queued separately)** — depends on this fix. Once chips insert at cursor reliably, selection-based logic can layer on top.

2. **Tutorial English content polish** — `Do [[print]]("hello, world")}}.` in canonical hello_world.md has stray `}}` characters. Not blocking but worth a small content-cleanup pass on forge-tutorial.

3. **Re-run v0.2.135 §B smoke after fix** — once this ships, the Step 5 scenarios in 2026-06-25-1430 smoke become runnable. Driver can verify the indent fix end-to-end.

4. **Audit other modal-driven actions** for the same cursor-loss pattern — if H2 is the root cause, any other Cmd-P-driven modal-open-then-edit flow may have the same bug. Worth a brief sweep.

## §8 — Architectural framing

V1 cohort regression. Chip insertion is core authoring UX; if it's silently broken, cohort users assume "I don't understand chips" and abandon them. Higher impact than the v0.2.135 §B Section B fix that nominally landed for it.

The bug is decomposable: the cursor-capture issue is mechanical (capture at open, not close). The pure-core indent logic is already correct. Total scope: small.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §9 — Hand-off

Single focused drain. §2 investigation (~15-20 min) → §2.3 fix (~15 min) → tests/smoke (~10 min). Estimated total: 45-60 min.

If §2 surfaces that all 4 hypotheses miss the real cause (genuinely surprising root cause), surface and don't ship speculative — drain becomes a diagnostic-spike pattern (v0.2.94/v0.2.103/v0.2.127 precedent).
