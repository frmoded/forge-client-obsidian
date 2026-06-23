---
prompt: 2026-06-25-2100-v0341-chip-insertion-ignores-cursor-position.md
shipped_version: v0.2.142
session: drain-2026-06-25-2100
date: 2026-06-25
status: shipped
---

# v0341 feedback — chip insertion honors cursor anywhere in document

## §1 — Diagnosis (per prompt §2)

Traced the cursor lookup in `chips-view.ts:onChipClick`:

```typescript
const cursor = resolvedAsAny?.editor?.getCursor
  ? resolvedAsAny.editor.getCursor('head')
  : null;
const cursorLine = cursor?.line ?? -1;
await this.insertViaVault(file, finalInsertion, cursorLine);
```

The integration layer IS calling `editor.getCursor` correctly at click-time. Obsidian preserves the editor's cursor position even when focus moves to the side pane. So `cursorLine` IS the user's last cursor position (e.g., the indented blank line at the end of `# Sandbox`).

**The bug was in the pure-core, NOT the cursor capture.** `chips-core.ts:insertChipTextAtLine` had this design from v0.2.135:

```typescript
const cursorInsideBody =
  cursorLine > englishStart && cursorLine < endIdx;
if (!cursorInsideBody) {
  return insertChipText(noteBody, chipInsertion);  // ← falls back to append-at-end-of-English
}
```

So: cursor in `# Sandbox` (after `# English`'s `endIdx`) → `cursorInsideBody = false` → fall back to legacy `insertChipText` which appends at end of `# English`. The chip silently lands in the wrong section. Driver smoke caught this exactly.

None of the v0.2.135 hypotheses H1–H4 were quite right — the closest was H3 ("hardcoded insert after `# English`"), but the actual code did honor cursor INSIDE English. The bug was that the design REJECTED cursors OUTSIDE English.

## §2 — Why pure-core tests didn't catch this (per prompt §0.2)

The v0.2.135 tests asserted EXACTLY this rejection behavior (`cursor in Python facet → falls back to end-of-English`). Those tests encoded the v0.2.135 spec as a deliberate design. They passed because the implementation matched the spec. But the spec itself didn't match user intent — chip palette users expect cursor honored anywhere.

Textbook runtime-evidence-beats-source-audit case (v0.2.132 HARD RULE). Source-level the pure-core was correct against its tests; runtime caught that the spec was wrong.

## §3 — What shipped (v0.2.142)

### §3.1 — Pure-core spec change

`insertChipTextAtLine` rewritten:
- **Cursor in range** (`cursorLine >= 0 && cursorLine < lines.length`): insert AT that line, with v0.2.135 indent-matching from cursor-line's leading whitespace + v0.2.120 empty-line polish (whitespace-only cursor line → replace; non-empty → insert below).
- **Cursor out of range** (`cursorLine < 0 || cursorLine >= lines.length`): fall back to legacy `insertChipText` (end-of-English append). Preserves chip-button-without-active-editor case (workspace boot, plugin-just-enabled).
- **`CHIPS_NO_ENGLISH_SECTION`** error now only fires for the doubly-degraded case (cursor-less + no English at all).

### §3.2 — Test updates

4 existing tests that asserted the old "fall back to end-of-English" behavior were rewritten to match the new cursor-anywhere spec:
- `cursor on # English heading line` → inserts AT the cursor (line 1, right after heading).
- `cursor in # Python facet` → inserts AT cursor in `# Python` (no English fallback).
- `cursor in frontmatter` → inserts AT cursor in frontmatter (no English fallback).
- `no English heading + cursor=0` → split into two: (a) cursorLine=-1 + no English → still returns NO_ENGLISH (degraded case); (b) valid cursor + no English → inserts at cursor (no error).

Plus 1 new test: the exact driver-smoke reproducer from §0 (`# Sandbox` at end of file, cursor on indented blank line → expect chip inserted there with 4-space indent match on subsequent lines).

Total: **753 plugin tests passing** (751 + 2 net new; the 4 updates stayed in-place since they're testing the same surface but new spec).

### §3.3 — No chips-view.ts changes needed

The integration layer was always doing the right thing (capturing cursor at click-time via `editor.getCursor('head')`). The fix is entirely in pure-core. This is the inverse of the v0341 prompt's diagnosis (which suggested the integration layer was wrong); the prompt's investigation rule (per §78) saved us from a wrong fix by gating on actual evidence.

## §4 — Tests + release

- 753 plugin tests passing (4 updated, 2 new).
- Build clean.
- Tag `v0.2.142` + GH release with assets.
- INSTALL.md synced.
- release.sh inlined-version preflight passed.

## §5 — Per-protocol HARD RULE compliance

- ✓ §78: traced cursor lookup in chips-view + pure-core BEFORE assuming the integration was at fault. Found pure-core was the actual bug surface.
- ✓ §57–74: 4 updated tests + 2 new tests including the driver-smoke reproducer.
- ✓ §86–118: pure-core spec change documented; helpers (`applyIndentToChipBody`, `extractLeadingWhitespace`, `applySelectionToChip`) unchanged.
- ✓ §76: driver-smoke-flagged with concrete reproducer.
- ✓ §347: release.sh handled v0.2.142.
- ✓ §321: feedback before move.
- ✓ v0.2.120 console.error: no new catches in this drain.
- ✓ v0.2.124 pure-core dispatch HARD RULE: the in-range vs out-of-range branching stays in `insertChipTextAtLine` (no new helper needed; the gate is a 2-line condition).
- ✓ v0.2.132 runtime-evidence-beats-source-audit HARD RULE: APPLIED — this drain exists because runtime smoke caught what source audit missed. Feedback documents the gap.
- ✓ v0.2.134 §5 inlined-version preflight: passed.

## §6 — Side benefits unlocked

The v0.2.135 §B indent matching now works runtime for ALL sections, not just `# English`. v0.2.137 selection-based chip insertion also works wherever the cursor is. The v0.2.135 + v0.2.137 + v0.2.142 trio collectively closes the chip-authoring polish arc.

## §7 — User-side smoke (per prompt §5)

Repro:
1. Open `~/forge-vaults/<vault>/forge-tutorial/01-hello/hello_world.md`.
2. Append `# Sandbox\n\n    ` (4-space-indented blank line) at end.
3. Click that indented blank line at column 4 (or wherever).
4. Cmd-P → "Forge: Open Chips" → click "If" chip.

Expected:
```
# Sandbox

    If <condition>:
        <body>
```

Matched indentation from cursor-line's leading whitespace. Per the v0.2.135 indent-matching contract.

## §8 — Open follow-ups (per prompt §7)

1. **v0.2.137 selection-based chip insertion** — now unblocked at runtime (was working at cursor in English; now works at cursor anywhere).
2. **Tutorial English content polish** — `Do [[print]]("hello, world")}}.` has stray `}}` characters. Small content cleanup; defer to a future tutorial drain.
3. **Audit other modal-driven actions for cursor-loss pattern** — not applicable; the chip-palette cursor was never lost. The bug was in pure-core's design, not modal interaction.
4. **Re-run v0.2.135 §B smoke** — now actionable; driver can verify indent matching end-to-end.

## §9 — Architectural framing

V1 cohort regression. The chip palette's user-facing contract (cursor honored anywhere) was implicit in user expectations but not in the v0.2.135 design. This drain aligns the implementation with the implicit contract. Future chip palette features can layer on a stable "cursor-anywhere" base.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §10 — Hand-off

v0.2.142 shipped. Queue empty after this drain. The v0.2.135 + v0.2.137 + v0.2.142 chip-authoring polish arc is complete.

## §11 — Tangential note: v0.2.140 multi-page Verovio score rendering — driver-confirmed working

Out-of-band ad-hoc fix shipped between v0339 and v0340:

**v0.2.140**: `verovio.ts:renderMusicXMLAndMIDI` was calling `toolkit.renderToSVG(1)` — page 1 only. Long scores (driver's `forge-music/murmuration` with ~30 bars) silently truncated at the first page break (~9 bars). Fix queries `toolkit.getPageCount()` and renders ALL pages, concatenated in a `.forge-verovio-pages` flex-column wrapper. `styles.css` adds `.forge-output-score { max-height: 70vh; overflow-y: auto; overflow-x: auto }` so multi-page scores fit the output panel with vertical scrolling.

**Driver smoke confirmation (2026-06-25)**: Forge-clicked `forge-music/murmuration`, all bars visible, scrollable. MIDI playback + click-to-play + score-follower all kept working because the wrapper-div pattern preserves Verovio's SVG note `id` attributes for the time-map.

Recording here for traceability since v0.2.140 was an ad-hoc fix without its own prompt-drain feedback file.
