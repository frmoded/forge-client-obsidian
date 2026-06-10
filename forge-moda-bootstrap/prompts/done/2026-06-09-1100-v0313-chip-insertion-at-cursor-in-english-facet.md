---
timestamp: 2026-06-09T11:00:00Z
session_id: drain-2026-06-09-1100
status: pending
priority: MEDIUM — cohort authoring ergonomics
---

# v0.2.113 — Chip insertion at cursor location within # English facet

## §0 — Context

v0.2.112 shipped chip palette folding (Item A) + integration harness (Item B) + frontmatter Plan B (Item C). The "chip cursor insertion" item (originally Item D in v0.2.112 prompt) was missed in that drain, likely because CC read an earlier version of the prompt before the mid-stream addition.

This focused drain ships that item alone. Small scope; ~60-90 min CC work.

## §1 — Goal

When a user clicks a chip in the chip palette while their cursor is positioned inside the `# English` facet of the active snippet, the chip content is inserted at the cursor's line (specifically, on the line BELOW the cursor's current line). When the cursor is OUTSIDE the `# English` facet, the existing fallback behavior is preserved.

Authoring ergonomics improvement: authors mid-`# English` editing get chips inserted where they're working, not at the end of file/facet.

## §2 — Investigation phase (per §78)

### §2.1 — Locate existing chip insertion code path

```bash
grep -rn "insertChip\|chipInsert\|appendChip\|onChipClick\|ChipsView.*click" forge-client-obsidian/src/
```

Identify:
- Where chip click is handled in `ChipsView` (post-v0.2.112 folding work landed)
- Current insertion mechanism: `editor.replaceRange`, `editor.replaceSelection`, vault.modify, or other
- Whether cursor-aware logic already exists for any other operation (e.g., New Snippet template insertion in `ForgeSnippetModal`)

Document the current handler shape before modifying.

### §2.2 — Cursor position read mechanics

Obsidian API:
- `editor.getCursor('head')` returns `{line: number, ch: number}` for the cursor's active position
- `editor.getValue()` returns full document content (for facet-bounds parsing)
- `view.file` (MarkdownView) gives the active TFile

Active view detection:
- `app.workspace.getActiveViewOfType(MarkdownView)` returns the active editor (if any)
- Per v0.2.111 retrospective: don't read `workspace.getActiveViewOfType` from a StateField (initial-mount race). For chip-click handler, we're in a user event context — workspace pointer is reliable.

### §2.3 — English facet boundary detection

Pure-core function `findEnglishFacetBounds(doc: string)`:

```typescript
type FacetBounds = { englishStart: number; englishEnd: number } | null;

export function findEnglishFacetBounds(doc: string): FacetBounds {
  // Find line matching /^# English\s*$/
  // englishStart = that line's index (0-based)
  // englishEnd = index of next heading line (any #+) OR doc-end if no further heading
  // Return null if no # English heading found
}
```

Lines indexed 0-based to match Obsidian's `editor.getCursor().line`. Returns line indices; the chip insertion logic converts to character positions via `editor.replaceRange`.

Edge cases:
- No `# English` heading: return null → fallback behavior
- `# English` followed immediately by another heading (empty body): bounds are valid; cursor can't be IN the empty body, so insertion logic naturally falls back
- Multiple `# English` headings: use the FIRST occurrence (snippets shouldn't have multiple)
- `# English` heading inside a code block: ignored (only top-level body headings count). Document whether this is a concern in practice; if rare, accept the limitation.

### §2.4 — Insertion logic

After cursor + bounds known:

```typescript
const cursor = editor.getCursor('head');
const bounds = findEnglishFacetBounds(editor.getValue());

if (!bounds || cursor.line < bounds.englishStart || cursor.line >= bounds.englishEnd) {
  // Cursor outside English facet — fallback behavior (existing)
  existingFallbackInsertion(chipContent);
  return;
}

// Cursor inside English facet — insert at line below cursor
const insertLine = cursor.line + 1;
editor.replaceRange(chipContent + '\n', { line: insertLine, ch: 0 });
```

Bound check: `cursor.line >= bounds.englishStart` AND `cursor.line < bounds.englishEnd`. The strict-less on `englishEnd` means cursor on the line that IS the next heading falls to fallback (cursor's "outside" the English content).

If `cursor.line === bounds.englishStart` (cursor on the `# English` line itself), the insertion at `cursor.line + 1` lands at the first line of the body — that's correct.

### §2.5 — Integration test via harness (v0.2.112 capability)

The new `createIntegrationHarness()` lets us write actual integration tests for the chip insertion behavior. Use it.

```typescript
test('chip insert at cursor: cursor in English body', async () => {
  const harness = createIntegrationHarness();
  try {
    const view = harness.mount('---\ntype: action\n---\n\n# English\n\nLine A\nLine B\n\n# Python\n', []);
    view.dispatch({ selection: { anchor: 30, head: 30 } });  // cursor at "Line A"
    await harness.flush();
    
    // Simulate chip insertion
    insertChipAtCursor(view, "// new chip content");
    await harness.flush();
    
    expect(view.state.doc.toString()).toContain("Line A\n// new chip content\nLine B");
  } finally {
    harness.destroy();
  }
});
```

(Pseudo-code; CC adapts to actual ChipsView API.)

## §3 — Implementation

### §3.1 — Pure-core

`src/find-english-facet-bounds.ts`:
- Export `findEnglishFacetBounds(doc: string): FacetBounds | null`
- Inline tests covering edge cases per §2.3

### §3.2 — Wire to chip insertion handler

Per §2.1 location:
- Read cursor + bounds at click handler entry
- Branch on cursor position
- In-bounds: `editor.replaceRange(chipContent + '\n', { line: cursorLine + 1, ch: 0 })`
- Out-of-bounds: invoke existing fallback (no behavior change for this case)

Preserve all existing edge cases (no active editor, no English heading, etc.).

### §3.3 — Tests

- Pure-core tests (≥7): well-formed snippet; no English heading; English at doc-start; English mid-doc; English at doc-end; multiple headings; cursor lines past doc-end
- Integration tests via harness (≥3): cursor in English → insert at cursor+1; cursor in Python → fallback; cursor in frontmatter → fallback

Total: ~10 new tests.

## §4 — User-side smoke

```
# Step 1 — install v0.2.113.
grep version ~/forge-vaults/bluh/.obsidian/plugins/forge-client-obsidian/manifest.json
# Expected: 0.2.113

# Step 2 — open a snippet with # English content (e.g., hello_world.md).
# Place cursor on a non-empty line in the middle of # English body.
# Note the cursor's line position (count lines from # English heading).

# Step 3 — open chip palette (Cmd-P → "Forge: Open Chips" or wherever).
# Click any chip.
# Expected: chip content inserted on the line BELOW your cursor's line.
# NOT at the end of the file. NOT at end of # English facet.

# Step 4 — undo (Cmd-Z) to restore.

# Step 5 — place cursor in the frontmatter region (between --- lines).
# Open chip palette; click a chip.
# Expected: chip content inserted at existing fallback location (likely
# end of # English facet) — NOT at the cursor position in frontmatter.

# Step 6 — switch snippet to python edit mode (Cmd-P → "Forge: Toggle
# Python/English editing mode"). # English now folded.
# Try to place cursor in # Python body; click a chip.
# Expected: existing fallback behavior (cursor in Python, not English,
# so chip inserts at fallback location).

# Step 7 — Snippet with no # English heading (extremely rare edge case).
# Try to click a chip; should not crash. Falls back to existing handler.
```

## §5 — Open follow-ups

1. **Chip insertion at SELECTION not just cursor**: future enhancement — if user has text selected when clicking chip, insert chip and select the inserted content (or replace selection). Out of scope.
2. **Multi-line chip content alignment**: if a chip is multi-line, current logic just inserts at cursor+1 with the chip's own line breaks. May need indentation matching for nested contexts. Defer pending cohort feedback.
3. **Chip palette folding work (v0.2.112)** continues to ship; this drain is additive.

## §6 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §2.1 locates existing handler; §2.2-§2.4 specify mechanics before implementation.
- ✓ §57–74 (TDD): pure-core failing-first tests + harness integration tests per §2.5.
- ✓ §86–118 (pure-core convention): `findEnglishFacetBounds` is pure-core; chip-click handler integration is integration layer.
- ✓ §76 (don't ship speculative fix): cursor logic targeted at the specific authoring friction.
- ✓ §347 (version-bump sanity check): manifest pre-bump at 0.2.112; explicit version arg.
- ✓ §321 (feedback file before move): standard.
- ✓ v0.2.106 patterns: path-prefix gates need positive frontmatter signal — N/A here (no path gating; cursor-position gate).
- ✓ NEW v0.2.112: CM6 extension changes must include integration tests — chip-click handler tests use `createIntegrationHarness()`.

## §7 — Architectural framing

V1 polish. Authoring ergonomics. No V2 architectural commitments.

V2's chip palette successor (if any) carries forward the cursor-aware insertion pattern naturally.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §8 — Hand-off

Single focused drain. Suggested order:
1. §2.1 audit chip-click handler
2. §3.1 pure-core `findEnglishFacetBounds`
3. §3.2 wire to handler
4. §3.3 tests
5. Release v0.2.113

Estimated CC time: 60-90 min including tests + smoke prep.
