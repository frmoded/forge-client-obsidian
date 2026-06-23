---
prompt: 2026-06-25-1600-v0339-granular-toggle-commands-per-section.md
shipped_version: v0.2.139
session: drain-2026-06-25-1600
date: 2026-06-25
status: shipped
---

# v0339 feedback — granular toggle commands per-section

## §1 — Investigation findings (§2.1 of prompt)

**Pre-v0.2.139 state**:
- Single command: `forge-toggle-frontmatter` → name `"Toggle frontmatter + dependencies visibility (active snippet)"`, callback `toggleFrontmatterVisibility()`.
- The callback flipped one CSS class `forge-expanded`. CSS rules paired both frontmatter (`.metadata-container`, `.cm-hmd-frontmatter`) and dependencies (`.forge-deps-line`, `.forge-deps-section`) on this single class.
- Other unrelated toggle commands (`forge-toggle-edges-panel`, `Toggle Python/English editing mode`) were independent and not affected.

So the migration is: split the one shared class into two granular classes, add two new commands, repurpose the existing command for "both".

## §2 — What shipped (v0.2.139)

### §2.1 — CSS updates

Added rules so `.forge-fm-expanded` shows only frontmatter, `.forge-deps-expanded` shows only dependencies. Legacy `.forge-expanded` rule preserved (still shows both — third-party CSS keying off it keeps working). Both granular rules are paired with the legacy rule in the same selectors so all three classes have the same effect for each section.

### §2.2 — `expanded-state-core.ts` extended to granular shape

`ExpandedState` is now `{frontmatter: boolean, dependencies: boolean, expanded: boolean}`. The `expanded` field is COMPUTED on write/read = `frontmatter && dependencies`.

Backward-compat read: when storage contains the legacy v0.2.138 shape `{expanded: true}`, the new reader maps it to `{frontmatter: true, dependencies: true, expanded: true}` so users who upgraded from v0.2.138 don't lose their toggled state.

New helpers:
- `toggleFrontmatter(storage, path)` — flips only frontmatter; dependencies preserved.
- `toggleDependencies(storage, path)` — flips only dependencies; frontmatter preserved.

Existing `toggleExpanded(storage, path)` — rewritten per v0339 §2.2 OR-of-current-states semantic: if either section is hidden, show both; if both are visible, hide both.

### §2.3 — `main.ts` integration

- `applyExpandedStateToView(containerEl, state)` private helper — sets `.forge-fm-expanded` / `.forge-deps-expanded` / `.forge-expanded` based on a full `ExpandedState`.
- `tagSnippetViews` uses `applyExpandedStateToView` on snippet leaves; removes all three classes on non-snippet leaves.
- `toggleFrontmatterVisibility` rewired to use `togglePersistedBoth`.
- New `toggleFrontmatterOnly` + `toggleDependenciesOnly` methods.
- Three command-palette registrations:
  - `forge-toggle-frontmatter` — `"Toggle frontmatter + dependencies visibility (active snippet)"` (unchanged id; behavior now OR-of-current-states per v0339)
  - `forge-toggle-frontmatter-only` — `"Toggle frontmatter only (active snippet)"`
  - `forge-toggle-dependencies-only` — `"Toggle dependencies only (active snippet)"`

### §2.4 — Tests: 11 new (751 total)

- Granular write → granular read (frontmatter true, deps false → expanded false because not both).
- Both granular fields true → `expanded` shorthand reflects AND.
- Legacy `{expanded: true}` read → maps both granular to true (back-compat).
- Legacy `{expanded: false}` read → maps both granular to false.
- `toggleFrontmatter` from `{fm: false, deps: true}` → `{fm: true, deps: true}` (deps unchanged).
- `toggleDependencies` from `{fm: true, deps: true}` → `{fm: true, deps: false}` (fm unchanged).
- `toggleExpanded` from frontmatter-only-visible → both shown (OR semantic).
- `toggleExpanded` from both-visible → both hidden.
- `toggleExpanded` from dependencies-only-visible → both shown.
- `toggleExpanded` from both-hidden → both shown.

All previous v0.2.138 tests pass unchanged (legacy `{expanded: bool}` storage shape backward-compat).

## §3 — Per-protocol HARD RULE compliance

- ✓ §78: investigation enumerated existing commands + CSS pairing before code.
- ✓ §57–74: 11 new failing-first tests.
- ✓ §86–118: pure-core extended in place; granular helpers join the same module.
- ✓ §76: driver-flagged carry-forward from v0.2.122.
- ✓ §347: release.sh bumped 0.2.138 → 0.2.139.
- ✓ §321: feedback before move.
- ✓ v0.2.120 console.error HARD RULE: no new catches.
- ✓ v0.2.134 §5 inlined-version preflight: passed.
- ✓ Back-compat with v0.2.138: tested + verified — legacy storage reads still work.

## §4 — User-side smoke (deferred to driver)

Per §4 of prompt:
1. Open `simulation.md` → both sections collapsed (default).
2. Cmd-P "Forge: Toggle frontmatter only" → frontmatter shows; dependencies still hidden.
3. Cmd-P "Forge: Toggle dependencies only" → dependencies shows; both visible.
4. Cmd-P "Forge: Toggle frontmatter + dependencies" → both hide (OR semantic: was-both-visible → hide both).
5. Cmd-P "Forge: Toggle frontmatter + dependencies" → both show (was-both-hidden → show both).
6. Cmd-P "Forge: Toggle frontmatter only" → frontmatter hides; dependencies remains visible.
7. Switch to `hello_world.md` → its state independent (default collapsed).
8. Switch back to `simulation.md` → state preserved (frontmatter hidden, dependencies visible).

## §5 — Open follow-ups + carry-forward

QoL backlog after this drain (per prompt §6):
- v0.2.131 §4 #2 status-bar persistent indicator (defer until cohort signal).
- CDN resilience bundle (publish-readiness pile).
- Cohort staleness signal (publish-readiness pile).
- Orphan-key cleanup pass for v0.2.138 storage (small follow-up if bloat is observed).

Closed in this drain:
- ~~v0.2.122 granular toggle commands~~ → THIS DRAIN.

## §6 — Architectural framing

V1 QoL polish, final piece. The v0.2.137 + v0.2.138 + v0.2.139 triple closes the chip-authoring + view-state polish arc:
- v0.2.137: selection-based chip insertion (placeholder replace).
- v0.2.138: per-snippet expanded-state persistence (localStorage backend).
- v0.2.139: granular per-section toggles.

V2: if cross-device sync becomes a need, swap localStorage for vault-local config; the granular `{frontmatter, dependencies}` shape carries over.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §7 — Hand-off

v0.2.139 shipped. v0337/v0338/v0339 triple drained in sequence. Queue empty.
