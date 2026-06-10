---
timestamp: 2026-06-09T11:00:00Z
session_id: drain-2026-06-09-1100
status: COMPLETED
shipped_version: 0.2.113
prompt_target_version: 0.2.113
---

# Feedback — v0.2.113 — chip insertion at cursor in # English facet

## §1 — What shipped

Cursor-aware chip insertion lands. Authors mid-`# English` editing now get chips inserted on the line below their cursor; out-of-body cursor falls back cleanly to the v0.2.69 end-of-section append.

### §1.1 Pure-core: `findEnglishFacetBounds` + `isLineInsideEnglishBody`

New module `src/find-english-facet-bounds.ts`:

```ts
export interface EnglishFacetBounds { englishStart: number; englishEnd: number; }
export function findEnglishFacetBounds(doc: string): EnglishFacetBounds | null;
export function isLineInsideEnglishBody(doc: string, line: number): boolean;
```

Returns 0-based line indices matching Obsidian's `editor.getCursor().line`. `englishEnd` is the line index of the FIRST line AFTER the body — i.e. the next `# *` heading or `---` separator, or `lines.length` if EOF. Cursor on the heading itself is NOT inside body (strict `(englishStart, englishEnd)` range).

11 tests covering: standard snippet shape, no English heading, English at doc-start, English-only doc, empty English body, `---` separator boundary, multiple-English-headings (first wins), case-insensitive match, and the inside-body checks (heading line, no-English, past-doc-end).

### §1.2 Pure-core: `insertChipTextAtLine`

Added to `chips-core.ts` next to existing `insertChipText`:

```ts
export function insertChipTextAtLine(
  noteBody: string,
  chipInsertion: string,
  cursorLine: number,
): InsertResult;
```

Behavior:
- Cursor strictly inside `(englishStart, englishEnd)` → insert at `cursorLine + 1`.
- Else (heading, frontmatter, Python, EOF, no editor) → delegate to legacy `insertChipText` (end-of-section append).

6 tests covering: cursor-in-body, cursor-on-heading (falls back), cursor-in-Python (falls back), cursor-in-frontmatter (falls back), cursor-at-last-body-line, and no-English error case.

### §1.3 Integration: chips-view.ts

`onChipClick` reads `editor.getCursor('head')` from the resolved markdown view (works for both active-view and `lastMarkdownView` paths per the v0.2.69 `findFallbackMarkdownView` chain). Passes `cursorLine` through `insertViaVault` to the new helper. `cursorLine === -1` (no editor available) flows naturally to legacy behavior.

The vault.process write pattern is preserved — Reading-mode-safe, atomic, `readOnlyFacetFilter`-bypass-immune per v0.2.69's design.

## §2 — Tests

- **Before**: 621 passing.
- **After**: 638 passing (+17).
  - 11 new for `findEnglishFacetBounds` + `isLineInsideEnglishBody`.
  - 6 new for `insertChipTextAtLine`.

No integration tests via the v0.2.112 harness this drain — the harness covers CM6/decoration paths, and chip insertion writes through Obsidian's vault.process which the harness doesn't currently shim. Pure-core coverage of `insertChipTextAtLine` discharges the contract; user-side smoke covers the editor.getCursor wiring.

## §3 — Cross-cutting verification

- Build clean.
- Tests 638 passing.
- Asset version stamping auto-handles inlined-asset refresh.
- Existing chip behavior (out-of-body cursor → end-of-section) preserved.

## §4 — User-side smoke checklist

```
# Step 1 — install v0.2.113.
# Step 2 — open hello_world.md or any snippet with multi-line English.
# Step 3 — place cursor on a non-first line in # English body.
# Step 4 — open chip palette; click a chip.
# Expected: chip lands on the line BELOW cursor (NOT end-of-section).
# Step 5 — Cmd-Z to undo.
# Step 6 — place cursor in frontmatter (between --- lines).
# Step 7 — click chip.
# Expected: legacy fallback (end-of-English-section append).
# Step 8 — place cursor in # Python body.
# Step 9 — click chip.
# Expected: legacy fallback (chip still lands in English, not Python).
```

## §5 — Open follow-ups

1. **Chip insertion at SELECTION not just cursor**: future enhancement — replace selected text with chip content (or wrap selection). Out of scope per prompt §5.
2. **Multi-line chip content indentation**: if a chip is multi-line, current logic just splices the chip's own line breaks. May need indentation-matching for nested contexts. Defer pending cohort feedback.
3. **Integration test via harness (chip insertion path)**: harness currently doesn't shim Obsidian's editor.getCursor or vault.process. Future harness extension could cover this for full coverage. Pure-core helper tests are sufficient discharge for now.
4. **Carrying forward from prior drains**:
   - **Item B (v0.2.99) facet_form removal** — still pending; option C recommended.
   - **Plugin-side path-lookup audit** (v0.2.104).
   - **moda bridge pytest** (v0.2.95).
   - **release.sh drift preflight** (v0.2.91).
   - **v0.2.19 generate-internal pre-flight sync now dead** (v0.2.102).
   - **Frontmatter fold programmatic vs CSS** — v0.2.114 prompt addresses.

## §6 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §2.1 audit located chip handler; mechanics specified in §2.2-§2.4 before implementation.
- ✓ §57–74 (TDD): pure-core failing-first tests landed before integration wiring.
- ✓ §86–118 (pure-core convention): `findEnglishFacetBounds` + `isLineInsideEnglishBody` + `insertChipTextAtLine` all pure-core; chip-view integration is integration layer.
- ✓ §76 (don't ship speculative fix): targeted at the specific authoring friction (mid-body chip insertion).
- ✓ §347 (version-bump sanity): manifest 0.2.112 → 0.2.113.
- ✓ §321 (feedback file before move): this file written before prompt move.
- ✓ v0.2.106 patterns: N/A — no path-prefix gating; cursor-position is the gate.
- ⚠ NEW v0.2.112 rule (CM6 changes need integration tests): this drain is NOT a CM6 extension change (chip insertion is a vault.process write); pure-core tests are sufficient discharge.

## §7 — Architectural framing

V1 authoring polish. Pattern (cursor-aware insertion) carries forward to V2's chip-palette successor if any. No V2 architectural commitments.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.
