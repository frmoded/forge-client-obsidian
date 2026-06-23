---
timestamp: 2026-06-25T12:00:00Z
session_id: drain-2026-06-25-1200
status: pending
priority: MEDIUM — small-bugs cleanup bundle as part of publish-readiness arc
---

# v0.2.136 — Small bugs bundle: basename-match audit + chip indent + tutorial chips parse error

## §0 — Scope rationale

Three small carry-forward items that don't fit into v0.2.133's polish bundle but are worth closing before the official Obsidian community-plugins publish push. Each section is independent + small. CC may ship as one drain or split; each section is ~15-30 min.

Driver pivoted focus to forge-music (drums-first) + minimal-plugin-publish. Moda is paused; many carry-forward items have been dropped as moda-specific. The remaining survivors are these three: defensive coding, an actual bug, and a tutorial parse error that's a bad first-impression risk.

## §1 — Section A: basename-match site audit (carry-forward from v0.2.104)

v0.2.104 fixed a path-lookup bug where a snippet's basename was used to match against a fully-qualified id, leading to false collisions when two domains have snippets with the same name (e.g. `forge-moda/setup.md` and `forge-music/setup.md`).

The fix was site-local. There may be other path-lookup sites with the same pattern. v0.2.129 flagged this as carry-forward (item §5 in feedback). v0.2.133's polish prompt did NOT include it because it's a different audit class (data-flow, not log-level).

### §1.1 — Investigation

Enumerate sites that compare a snippet identifier-or-path against a basename-derived value:

```bash
grep -rn "basename\|\.name\b" src/ --include="*.ts" | \
  grep -v "\.test\.ts\|\.d\.ts" | head -30
```

For each match:
- Read 10-20 lines of context.
- Is the comparison id-vs-id (safe) or id-vs-basename (suspicious)?
- If suspicious: does the caller ever pass two paths with the same basename from different domains?

Likely suspects (per v0.2.104's pattern):
- Anywhere a vault-wide snippet lookup runs
- Anywhere a UI command resolves a path from a partial name
- chip resolution paths (`chips-core.ts` and adjacent)

### §1.2 — Fix or document

For each suspicious site:
- **If unsafe**: fix using the v0.2.104 pattern (compare against fully-qualified id).
- **If safe-by-construction** (caller guarantees no cross-domain basename collisions): add a 1-line comment documenting WHY this site is safe.

End state: zero unaudited basename-match sites; each is either fixed or documented.

### §1.3 — Tests

Add a regression test for any newly-fixed site: synthesize a cross-domain basename collision, assert lookup returns the correct fully-qualified id (not the first-match).

If no sites needed fixing: no new tests; document the audit completion in feedback file.

## §2 — Section B: multi-line chip content indentation matching (driver-flagged)

Bug: when a chip's content spans multiple lines and is inserted into a snippet body that has leading indentation (e.g. inside a code fence indented by 4 spaces), the chip content's subsequent lines don't get the matching indentation. Result: visually broken inserted code.

### §2.1 — Reproducer

1. Open a snippet with an indented code fence (e.g. inside a list item with the fence at 4-space indent).
2. Place cursor at an indented position inside the fence.
3. Invoke chip palette → select a chip with multi-line body (e.g. a function definition).

Expected: each line of the inserted chip body gets the cursor-line's leading indentation. Actual: only the first line gets the indentation; subsequent lines start at column 0.

### §2.2 — Investigation

Source: `src/chips.ts` insertion path. Find where chip content is written to the editor. The current code likely does a single `editor.replaceRange(content, ...)` without per-line indent matching.

### §2.3 — Fix

Detect the cursor-line's leading whitespace before insertion. Split chip content on `\n`. Prepend the leading-whitespace prefix to lines 2..N. Re-join. Replace.

```typescript
const cursorLine = editor.getLine(cursorPos.line);
const leadingWs = cursorLine.match(/^[\t ]*/)?.[0] ?? '';
const lines = chipContent.split('\n');
const indented = [lines[0], ...lines.slice(1).map(l => leadingWs + l)].join('\n');
editor.replaceRange(indented, cursorPos);
```

### §2.4 — Tests

Pure-core test in `chips-core.test.ts` (extract indent logic to a pure helper first if not already pure):

```typescript
test('multi-line chip insertion preserves indentation', () => {
  const result = applyIndentToChipBody(
    'def f():\n  return 42',
    '    '  // 4-space indent
  );
  expect(result).toBe('def f():\n      return 42');  // 4+2 = 6 for inner
});
```

Plus one more test for tab indentation + one for no indentation (cursor at column 0 → no-op).

## §3 — Section C: forge-tutorial `_meta/_chips.md` v3 parse error (carry-forward)

The forge-tutorial vault's `_meta/_chips.md` file fails to parse against the v3 chips schema. This was flagged multiple times in carry-forward lists but never specifically diagnosed.

### §3.1 — Reproduce + diagnose

Open forge-tutorial in a vault. Open DevTools console. Trigger chip loading (e.g., open chip palette).

**Expected error**: a `console.error` from `chips.ts` with the parse failure detail. The v0.2.130 method-name prefix work should make this easy to find by greppable prefix (`loadLibraryChips:` or similar).

Read the actual `_meta/_chips.md` content (in forge-tutorial repo or installed vault). Compare against v3 schema in `chips-core.ts`. Identify which field is mis-shaped.

### §3.2 — Fix

Two options:
- **A. Fix the `_chips.md` content** to match v3 schema. Update the forge-tutorial repo's canonical copy + bump tutorial domain version.
- **B. Make the parser tolerant** of the legacy shape if it's a common pattern. Document the legacy shape as supported.

My pick: **A** unless the legacy shape is genuinely common (e.g., multiple tutorial chips files exist with the same shape and changing them all is more work than parser tolerance). Investigation will reveal.

### §3.3 — Tests

If A: regression test asserting forge-tutorial's `_chips.md` parses cleanly post-fix.

If B: add a tolerant-parse test case with the legacy shape.

## §4 — Tests required summary

- Section A: 0-2 regression tests (depending on audit findings).
- Section B: 3 pure-core tests for indent matching.
- Section C: 1 regression test for forge-tutorial parse.

Plugin suite: ~698-703 depending on Section A audit.

## §5 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): each section enumerates the audit/repro step.
- ✓ §57–74 (TDD): failing-first tests called out per section.
- ✓ §86–118 (pure-core convention): Section B extracts indent helper to pure-core; Sections A and C touch existing cores.
- ✓ §76 (don't ship speculative fix): each is driver-flagged or carry-forward with established context.
- ✓ §347 (version-bump sanity check): release.sh bumps to v0.2.136.
- ✓ §321 (feedback before move): standard.
- ✓ v0.2.120 console.error HARD RULE: Section C diagnosis relies on it.

## §6 — User-side smoke

After ship:

```
# Section A: nothing user-visible if no fixes needed; otherwise spot-check chip/snippet resolution in a multi-domain vault.

# Section B:
# 1. Open any snippet with an indented code fence.
# 2. Place cursor on an indented line inside the fence.
# 3. Insert a multi-line chip via the palette.
# 4. Expected: all lines of inserted chip body share the cursor-line's leading indent.

# Section C:
# 1. Open forge-tutorial vault.
# 2. Open chip palette.
# 3. Expected: no console.error related to _meta/_chips.md parse.
# 4. Chips load successfully and appear in the palette.
```

## §7 — Open follow-ups + carry-forward survivors

After this drain, remaining tracking-lane items (all DEFERRED, not in any active prompt):

- v0.2.91 + v0.2.92 CDN resilience (3 items — bundle as publish-readiness prompt when publish push starts)
- v0.2.119 persistent expanded-state (QoL feature)
- v0.2.122 granular toggle commands (QoL feature)
- v0.2.131 §4 #2 status-bar persistent indicator (defer until cohort signal)
- SELECTION-based chip insertion (QoL feature)
- Cohort staleness signal for slot-free `# Python` (publish-readiness UX)

## §8 — Architectural framing

V1 institutional hygiene + cohort first-impression defense. No V2 commitments. Each section closes a documented carry-forward item with concrete reproducer / audit step. The bundle pattern follows v0.2.129's example.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §9 — Hand-off

Suggested order (cheapest-first):
1. §3 forge-tutorial parse error (~15-20 min) — concrete repro, narrow fix
2. §2 chip indent bug (~25-30 min) — pure-core test + fix
3. §1 basename-match audit (~30-45 min) — broader investigation, may surface zero-find

Total: 1-1.5 hours. If §1 surfaces unexpected complexity, split off as v0.2.137.
