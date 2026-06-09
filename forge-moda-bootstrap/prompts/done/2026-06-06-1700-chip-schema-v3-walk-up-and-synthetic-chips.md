# Chip schema v3 — per-chapter `_chips.md` walk-up + synthetic chips

> **CC pre-drain reminder (HARD RULE per cc-prompt-queue.md):** before reading this prompt, re-read `~/projects/forge-moda-bootstrap/cc-prompt-queue.md` end-to-end. Then re-read `~/projects/forge/docs/specs/chips-schema.md` (now includes v3 spec at the bottom) and `~/projects/forge/docs/specs/constitution.md` for B7.1, B7.2, S7 context.

## Scope

Implement the v3 chip schema additions (authorized 2026-06-06, scribed at `~/projects/forge/docs/specs/chips-schema.md`):

- **v3.1**: per-chapter `_chips.md` walk-up. When computing the chip palette for an active file, walk UP from the file's directory. Each level's `_chips.md` contributes to the palette config; higher specificity wins for `overrides[]`/`groups[]`; `hide[]` is union; `synthetic_chips[]` combine with same-label-higher-specificity-wins. Auto-discovery scope narrows to the active file's subdirectory when that subdir has its own `_chips.md`.

- **v3.2**: synthetic chips. New `synthetic_chips[]` section in `_chips.md` declares chips with `label` + `insertion` (no backing snippet file). Plugin renders them in the palette; clicking inserts the declared text. Combined with v0.2.59 B7.2 wikilink suppression for clean UX when insertions contain builtin references.

What this prompt does NOT do:
- Author forge-tutorial vault content (forge-doc's lane — unblocked by this drain).
- Migrate forge-moda's existing v2 `_chips.md` (it works unchanged under v3 backward-compat).
- Touch B7.1, B7.2, or chip-discovery code for non-walk-up paths.
- Pre-populate any synthetic chips in bundled vaults.
- Change v2 file semantics (must remain unchanged for back-compat).

## Why

Per Mission V2a v9 + V2a v8 + V2a v7: composability + low-floor properties. forge-doc's Tier 1 tutorial pedagogy (K&R-style chapter sequence — chapter 1 teaches `print`, chapter 2 adds `Set`, etc.) cannot work without per-chapter palette pacing AND language constructs in the palette. Both are v3 deliverables.

Until v3 ships, forge-doc holds. Mission's speed-second criterion: small prompt unblocks a downstream cowork who's been waiting; ship promptly.

## Phase shape — investigation-before-design rider

**Phase 1 — investigation**:

1. Read current `~/projects/forge-client-obsidian/src/chips-core.ts` end to end. Cite the existing `CHIPS_RELATIVE_PATHS` constant + the auto-discovery scope. Identify where walk-up logic belongs.
2. Read `~/projects/forge-client-obsidian/src/chips.ts`. Identify the entry point for per-active-file palette computation. Is there one already, or is the palette currently computed once and shared across files? (If shared, the change is larger — the palette becomes file-context-aware.)
3. Read `~/projects/forge-client-obsidian/src/chips-view.ts`. Identify how `ChipsView` triggers re-computation when active file changes (`file-open` event).
4. Read `~/projects/forge-music/percussion_lab/_chips.md` if present (it may not be) — and `~/projects/forge-moda/_meta/_chips.md` — to confirm what a real v2 file looks like.
5. Confirm v3 schema (per `chips-schema.md` v3 sections) is implementable with cited line locations.

**Phase 2 — implementation** (TDD discipline):

Two pure-core extractions, one glue path:

- **NEW pure-core: `src/chips-walk-up-core.ts`** — extracts the walk-up logic. Given active file path + library root path, returns the ordered list of `_chips.md` paths to consult (most-specific first). Pure function; testable without Obsidian.
- **NEW pure-core: `src/synthetic-chips-core.ts`** — parses the `synthetic_chips[]` section + integrates them into the chip palette list. Same pattern as auto-derived chip parsing. Tests in sibling `.test.ts`.
- **Glue in `src/chips.ts`**: per-active-file palette computation. Walk up via `chips-walk-up-core`, merge configs, accumulate synthetic chips per `synthetic-chips-core`, return the resolved chip list for the current file context.

Pure-core extractions #24 and #25.

## Files likely to touch

Phase 1: read-only.

Phase 2:
- **NEW `~/projects/forge-client-obsidian/src/chips-walk-up-core.ts`** + `.test.ts`.
- **NEW `~/projects/forge-client-obsidian/src/synthetic-chips-core.ts`** + `.test.ts`.
- **`~/projects/forge-client-obsidian/src/chips-core.ts`** — extend the v2 schema parser to recognize `schema_version: 3` and parse `synthetic_chips[]`. Walk-up logic stays in `chips-walk-up-core.ts`; this file handles the merge.
- **`~/projects/forge-client-obsidian/src/chips.ts`** — wire walk-up + synthetic chips into the per-active-file palette computation.
- **`~/projects/forge-client-obsidian/src/chips-view.ts`** — possibly add a `file-open` re-render trigger if it doesn't already exist (per Phase 1 §3).
- **`~/projects/forge-client-obsidian/manifest.json`** — `{CURRENT} → {NEXT_PATCH}` placeholder.
- **`~/projects/forge-client-obsidian/INSTALL.md`** — version pin update.

No constitution touch (chips-schema.md already amended).

## Tests — TDD discipline

### `chips-walk-up-core.test.ts` (extraction #24)

1. Walk from `<vault>/01-hello/hello.md` with library root `<vault>` → returns `[<vault>/01-hello/_chips.md, <vault>/_chips.md, <vault>/_meta/_chips.md]` (most specific first).
2. Walk from `<vault>/foo.md` (top-level snippet) → returns `[<vault>/_chips.md, <vault>/_meta/_chips.md]`.
3. Walk from a file at `<vault>/a/b/c/snippet.md` → returns 4-level list (a/b/c, a/b, a, vault).
4. Walk skips levels with no `_chips.md` (only files that EXIST are returned).
5. Walk respects library root boundary (never walks above the library root).
6. Empty `existingFiles` set → returns `[]`.
7. Idempotent.

### `synthetic-chips-core.test.ts` (extraction #25)

1. Parse a `synthetic_chips[]` with valid entries → returns the chip list.
2. Entry missing `label` → dropped with warning, rest of file processed.
3. Entry missing `insertion` → dropped with warning.
4. Multi-line `insertion` via `|` → preserved as-is.
5. `group` defaults to `"Synthetic"` when absent.
6. `order` defaults to declaration order.
7. Empty `synthetic_chips[]` → returns `[]`.
8. Same-label entries across walk levels: higher-specificity wins (merge rule).
9. `hide[]` applied to synthetic chip labels removes them from palette.

### `chips-core.test.ts` extensions

10. Parse `schema_version: 3` file with `synthetic_chips[]` → integrated correctly.
11. Parse `schema_version: 2` file (no `synthetic_chips[]`) → unchanged behavior (back-compat).
12. Parse `schema_version: 4` or unknown → warning + skip the file (forward-compat).

### `chips.ts` integration tests

13. Active file `<vault>/01-hello/hello.md` with chapter-1 `_chips.md` hiding `Set` → palette excludes `Set`, includes chapter-1 synthetic chips.
14. Active file in subdir A doesn't see synthetic chips from sibling subdir B.
15. Vault-level synthetic chip visible across all chapters (walk includes vault level).
16. Switching active file from chapter 1 → chapter 2 → palette re-computes per the new file's walk.

## User-side smoke (CC writes §3 per 6a/6b)

Per cc-prompt-queue.md 6a/6b. CC drafts a smoke that exercises v3 against a minimal scaffold:

1. Create a tutorial-vault-shape scaffold in `~/forge-vaults/<smoke>/` with `01-hello/_chips.md` (synthetic `print` only) + `_chips.md` at vault root (synthetic `Set`, `If`, `For each`, hidden by chapter 1's hide list).
2. Install v0.X.X plugin.
3. Open `01-hello/hello.md`. Chip palette should show only `print`.
4. Open `02-variables/greeting.md`. Chip palette should show `print` + `Set` (chapter 2's `_chips.md` unhides `Set`).
5. Click `print` chip. Editor inserts `Do [[print]]("<message>").`. `[[print]]` is suppressed per v0.2.59 B7.2 (no stray `print.md`).

Paste-able verification of file-system state for the smoke vault scaffold.

## Out of scope

- Authoring the actual forge-tutorial vault content (forge-doc's lane).
- Per-active-file palette context for non-tutorial vaults (back-compat: vaults without subdirectory `_chips.md` work as v2).
- A settings UI for "preferred chip context."
- E-- spec changes for builtin syntactic distinction (Option C from B7.2 brainstorm; v2 research).

## Don'ts

- Don't break v2 file semantics. Back-compat is guaranteed.
- Don't auto-walk above the library root.
- Don't fire `_chips.md` re-load on every editor event; cache palette config and invalidate on file-open + `_chips.md` write.
- Don't add new pure-core extractions for things that fit in existing helpers.
- Don't bump versions concretely — `{CURRENT} → {NEXT_PATCH}` placeholder.

## Report when done

Standard §0–§3 per cc-prompt-queue.md with two-phase structure.
