---
timestamp: 2026-06-25T15:30:00Z
session_id: drain-2026-06-25-1530
status: pending
priority: LOW — QoL feature; carry-forward from v0.2.119
---

# v0.2.138 (renumber to current) — persistent per-snippet expanded state across file switches

## §0 — Bug / feature

Carry-forward from v0.2.119 (frontmatter/Dependencies fold introduction).

Currently, when a user toggles a snippet's frontmatter or `# Dependencies` section to be expanded (via the Cmd-P toggle commands), that expanded state is LOST when they switch to another file and switch back. Each file-open resets to the default-collapsed state.

User intent: the expanded-state is per-snippet. If I expanded frontmatter on `simulation.md`, I probably want it expanded next time I open `simulation.md` too. Today I have to re-expand every time.

## §1 — Goal

Per-snippet, per-section expanded state persists across file switches AND across Obsidian restarts. Two sections: `frontmatter` and `dependencies` (the existing v0.2.122 surface).

Storage: localStorage keyed by snippet path. Format: `forge:expanded:<path>` → JSON `{frontmatter: bool, dependencies: bool}`.

Reset behavior: explicit user reset via existing toggle command flips the value AND persists. No auto-reset.

## §2 — Investigation phase (per §78)

### §2.1 — Current state location

`src/main.ts` or a sibling — find where the frontmatter/dependencies fold CSS classes are applied. v0.2.116 added the CSS-class gating; v0.2.119 first introduced the per-snippet expand state; v0.2.122 added the toggle commands.

```bash
grep -rn "frontmatter-expanded\|dependencies-expanded\|class=.expanded" src/ --include="*.ts" | head -20
```

Locate:
- Where the class is added/removed on the editor's container.
- Where the toggle commands fire.
- Where the initial-load state is determined (currently: default-collapsed).

### §2.2 — Pure-core: state persistence

`src/expanded-state-core.ts` (NEW):

```typescript
type ExpandedState = { frontmatter: boolean; dependencies: boolean };

const STORAGE_PREFIX = 'forge:expanded:';

export function readExpandedState(snippetPath: string): ExpandedState {
  // localStorage.getItem(STORAGE_PREFIX + snippetPath)
  // Default both false on missing/malformed.
}

export function writeExpandedState(
  snippetPath: string,
  state: ExpandedState,
): void {
  // localStorage.setItem(...)
}

export function toggleExpanded(
  snippetPath: string,
  section: 'frontmatter' | 'dependencies',
): ExpandedState {
  // Read, flip the section, write, return new state.
}
```

Defensive against:
- localStorage unavailable (graceful default-false).
- Malformed JSON (graceful default-false).
- Path with special chars (URL-encode or sanitize for the key).

### §2.3 — Glue in main.ts

On file-open:
- Read expanded state via `readExpandedState(activeFile.path)`.
- Apply CSS classes accordingly.

On toggle command fire:
- Call `toggleExpanded(activeFile.path, 'frontmatter' | 'dependencies')`.
- Apply CSS class update.

### §2.4 — Edge cases

- File rename: localStorage key is path-based. Rename leaves orphan key + new key starts default. Acceptable for v1 (no migration on rename). Document.
- File delete: orphan key remains. Acceptable surface bloat; document as known.
- Multiple panes showing same file: both reflect the same state on toggle (since they read the same key). Verify.

## §3 — Tests required (TDD per §57–74)

### §3.1 — Pure-core

`expanded-state-core.test.ts`:
1. `readExpandedState` missing key → `{frontmatter: false, dependencies: false}`.
2. `readExpandedState` valid JSON → returns parsed.
3. `readExpandedState` malformed JSON → default.
4. `writeExpandedState` → readable via `readExpandedState` (roundtrip).
5. `toggleExpanded` from missing → `{<section>: true, other: false}`.
6. `toggleExpanded` from `true` → `false` (and vice versa).
7. localStorage unavailable (mock to throw) → defensive default + write no-ops.

### §3.2 — Integration

If the test harness can mount the fold extension + drive a synthetic file-switch event: assert CSS class state persists across switches. Likely deferred to user-side smoke given the harness limitations (v0.2.131 §1.6 pattern).

## §4 — User-side smoke

1. Open `simulation.md`. Use Cmd-P "Forge: Toggle frontmatter visibility" → frontmatter expands.
2. Switch to `hello_world.md`. Switch back to `simulation.md`. Expected: frontmatter STILL expanded.
3. Quit Obsidian (Cmd-Q). Reopen. Open `simulation.md`. Expected: frontmatter STILL expanded.
4. Use Cmd-P toggle again on `simulation.md` → frontmatter collapses. Switch and switch back. Expected: STILL collapsed.
5. On `hello_world.md` (untouched): frontmatter default-collapsed.

Same set of checks for `# Dependencies` section.

## §5 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §2 enumerates the surface.
- ✓ §57–74 (TDD): §3.1 failing-first pure-core cases.
- ✓ §86–118 (pure-core convention): `expanded-state-core.ts` is a NEW pure-core helper.
- ✓ §76 (don't ship speculative fix): driver-flagged carry-forward from v0.2.119.
- ✓ §347 (version-bump sanity check): release.sh bumps appropriately.
- ✓ §321 (feedback before move): standard.
- ✓ v0.2.120 console.error HARD RULE: any localStorage-failure catches use `console.error` with method-name prefix.

## §6 — Open follow-ups + carry-forward

After this drain, remaining tracking-lane QoL items:
- v0.2.122 granular toggle commands (v0.2.139 prompt — see partner prompt)

## §7 — Architectural framing

V1 QoL polish. Per-snippet state persistence is a small surface for localStorage; this validates the pattern in case more per-snippet state is needed later (e.g., per-snippet pinned chips, per-snippet edit-mode preference).

No V2 commitments. State is local to the browser; doesn't sync across devices. If sync becomes a need, this localStorage scheme migrates to a vault-local config file. Document the future migration path in the feedback.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §8 — Hand-off

Single focused drain. Pure-core extraction + minimal glue. Estimated CC time: 30-45 min.

The orphan-key surface bloat (§2.4) is acceptable for v1; if it becomes a real concern, a cleanup pass walking localStorage and removing keys with no matching file is a small follow-up. Out of scope here.
