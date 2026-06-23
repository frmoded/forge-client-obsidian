---
timestamp: 2026-06-25T16:00:00Z
session_id: drain-2026-06-25-1600
status: pending
priority: LOW — QoL feature; carry-forward from v0.2.122
---

# v0.2.139 (renumber to current) — granular toggle commands (per-section, not all-at-once)

## §0 — Bug / feature

Carry-forward from v0.2.122. Today there are toggle commands for frontmatter and dependencies visibility, but the granularity is mixed:
- `Forge: Toggle frontmatter visibility` — flips frontmatter only ✓
- `Forge: Toggle Python/English editing mode` — flips frontmatter `editing_mode` field ✓
- (User-perceived gap): no clean "toggle ONLY dependencies" without going through some indirect path.

Actual current state may differ. Audit + clean up so the command palette has:
- `Forge: Toggle frontmatter` — frontmatter only.
- `Forge: Toggle dependencies` — `# Dependencies` only.
- `Forge: Toggle both` (optional convenience) — both at once.

The trigger for codifying this was v0.2.122's introduction of CSS class gating; the per-section commands were partially shipped but not consistently named/exposed.

## §1 — Goal

Three command-palette entries with consistent naming + behavior, each independent. Combined with v0.2.138 (persistent per-snippet expanded state), the user gets fine-grained control over what's visible per snippet.

## §2 — Investigation phase (per §78)

### §2.1 — Current commands

```bash
grep -n "addCommand\|Toggle frontmatter\|Toggle dependencies\|Toggle Python\|toggle.*visib" src/main.ts | head -20
```

Enumerate every existing toggle-related command. Identify:
- Which section(s) each one affects.
- Whether their action is "flip current state" (toggle) or "set to true" (show) or "set to false" (hide).
- Naming consistency (is there a "Forge: ..." prefix convention?).

### §2.2 — Decide the canonical set

Three commands as the target:
1. **`Forge: Toggle frontmatter`** — flips frontmatter visibility.
2. **`Forge: Toggle dependencies`** — flips `# Dependencies` visibility.
3. **`Forge: Toggle both`** — flips both based on the OR of their current states (if either is hidden, show both; if both visible, hide both).

If a "show only" or "hide only" variant is genuinely useful (e.g., a teacher mode), add as separate commands. Not in scope here unless §2.1 reveals an existing one that should be preserved.

### §2.3 — Coupling with v0.2.138 (persistent state)

Each toggle command MUST persist the new state via the v0.2.138 `expanded-state-core` helpers (`toggleExpanded`). If v0.2.138 is shipped before this drain, plug into its helpers. If not, this drain ships first with non-persistent toggles (each command-palette flip changes the active editor but doesn't survive file switch); v0.2.138 then adds persistence.

CC's call based on drain order. If both prompts are queued together, ship v0.2.138 first.

### §2.4 — Discoverability

Add the three commands to the chip palette context menu OR a right-click menu (optional, defer if scope grows). Keep the command-palette entries as the canonical surface.

## §3 — Tests required (TDD per §57–74)

### §3.1 — Pure-core (if logic warrants)

If toggle-both's "OR-of-current-states" logic warrants extraction:

`toggle-section-core.ts` (NEW or amend):
- `decideToggleBoth(currentFrontmatter, currentDependencies): {frontmatter: boolean, dependencies: boolean}` — the "if either is hidden, show both" logic.

Tests:
1. Both visible → both hide.
2. Both hidden → both show.
3. Frontmatter visible, dependencies hidden → both show.
4. Frontmatter hidden, dependencies visible → both show.

### §3.2 — Integration

Mock the command-palette invocation; assert the editor's CSS class state flips appropriately. Likely user-side smoke given harness limitations.

## §4 — User-side smoke

1. Open `simulation.md`. Both frontmatter + dependencies default-collapsed.
2. Cmd-P "Forge: Toggle frontmatter" → frontmatter expands; dependencies still collapsed.
3. Cmd-P "Forge: Toggle dependencies" → dependencies expands; both visible.
4. Cmd-P "Forge: Toggle both" → both collapse (since both were visible).
5. Cmd-P "Forge: Toggle both" → both expand (since both were hidden).
6. Cmd-P "Forge: Toggle frontmatter" → frontmatter collapses; dependencies still visible.

If v0.2.138 is shipped: switch to `hello_world.md` and back to `simulation.md`. State should persist.

## §5 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §2.1 enumerates the existing surface.
- ✓ §57–74 (TDD): pure-core test if applicable.
- ✓ §86–118 (pure-core convention): if any decide-logic warrants extraction, into `toggle-section-core.ts`.
- ✓ §76 (don't ship speculative fix): carry-forward from v0.2.122.
- ✓ §347 (version-bump sanity check): release.sh bumps appropriately.
- ✓ §321 (feedback before move): standard.
- ✓ v0.2.120 console.error HARD RULE: any catches use console.error.

## §6 — Open follow-ups + carry-forward

After this drain + v0.2.137 + v0.2.138, the QoL backlog is largely closed:
- v0.2.131 §4 #2 status-bar persistent indicator (defer until cohort signal)
- CDN resilience bundle (publish-readiness pile)
- Cohort staleness signal (publish-readiness pile)

## §7 — Architectural framing

V1 QoL polish. Triple of small-prompts (v0.2.137 selection chip + v0.2.138 persistent expanded + v0.2.139 granular toggle) closes the "make authoring feel polished" arc.

No V2 commitments.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §8 — Hand-off

Single focused drain. Estimated CC time: 25-40 min depending on §2.1 audit findings (may surface that the current set is already nearly what we want, in which case this is just naming consistency + a missing toggle-both).

If §2.3 timing (v0.2.138 ordering) creates a constraint, surface and ship without persistence; v0.2.138 plugs in.
