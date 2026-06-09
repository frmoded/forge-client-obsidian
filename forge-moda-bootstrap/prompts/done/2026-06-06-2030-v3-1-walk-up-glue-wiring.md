# v3.1 walk-up wiring — thread `activeFilePath` through chip palette glue

> **CC pre-drain reminder (HARD RULE per cc-prompt-queue.md):** before reading this prompt, re-read `~/projects/forge-moda-bootstrap/cc-prompt-queue.md` end-to-end. Re-read `~/projects/forge/docs/specs/chips-schema.md` (v3 sections at the bottom) and the v0.2.65 feedback at `~/projects/forge-moda-bootstrap/prompts/feedback/2026-06-06-1700-chip-schema-v3-walk-up-and-synthetic-chips.md` (especially §2 follow-up #8 + the pure-core helper that's already built).

## Scope

Per the v0.2.65 split-ship: pure-core `chips-walk-up-core.ts` (extraction #24) ships in v0.2.65 with 10 TDD cases. The glue layer — threading `activeFilePath` from the chip palette UI through `ChipsManifest → loadChipsForActiveVault → loadLibraryChips` + adding a `file-open` listener to `ChipsView` so the palette re-renders when the user switches files — is this follow-up drain.

Behavior after this drain: opening `forge-tutorial/01-hello/hello.md` consults `forge-tutorial/01-hello/_chips.md` first, then `forge-tutorial/_chips.md`, then the library `_meta/_chips.md`. Higher-specificity `overrides[]`/`groups[]` win; `hide[]` unions; same-label `synthetic_chips[]` higher-specificity wins. Auto-discovery scope narrows to the active file's subdirectory when that subdir has its own `_chips.md`.

What this prompt does NOT do:
- Touch the pure-core walk-up helper (already shipped + tested).
- Change the v3 schema spec (already amended).
- Author forge-tutorial vault content (forge-doc's lane).
- Change v2-file back-compat semantics.

## Why

Per Mission's composability + low-floor properties: per-chapter `_chips.md` lets forge-doc curate the visible vocabulary per chapter cleanly. Today (v0.2.65) the same pedagogy works via library-level `_chips.md` + `hide[]` plus vault structure — but the per-chapter form is the cleaner authoring pattern when the chapter sequence is the load-bearing structure (which it is, per the K&R-style tutorial in `forge-doc-briefing.md`).

Per Mission's speed-second criterion: small focused drain; the heavy work (pure-core helper + tests) is already done. Glue ships in ~50 lines + 5-6 integration tests.

## Files likely to touch

- **`~/projects/forge-client-obsidian/src/chips.ts`** — thread `activeFilePath` through `loadChipsForActiveVault → loadLibraryChips`. When `activeFilePath` provided, use `walkUpChipsConfigs` from `chips-walk-up-core` to enumerate the levels; merge configs per the spec (higher-specificity-wins for overrides/groups; union for hide; same-label-higher-specificity for synthetic_chips).
- **`~/projects/forge-client-obsidian/src/chips-view.ts`** — register a `file-open` event listener that re-computes the palette using the new active file's path. Re-render on switch.
- **`~/projects/forge-client-obsidian/src/chips.test.ts`** — 5-6 integration tests covering walk-up scenarios end-to-end.
- **`~/projects/forge-client-obsidian/manifest.json`** — `{CURRENT} → {NEXT_PATCH}` placeholder.
- **`~/projects/forge-client-obsidian/INSTALL.md`** — version pin update.

## Implementation notes

### chips.ts threading

```typescript
// Before (v0.2.65): library-level _chips.md only.
async function loadLibraryChips(library, allFiles, manifestProvider) {
  const libraryRoot = library.path;
  const libraryConfig = await loadChipsConfigAtPath(libraryRoot, '_meta/_chips.md');
  // ... auto-derive from all files in library; merge with libraryConfig ...
}

// After: thread activeFilePath; walk up from there.
async function loadLibraryChips(library, allFiles, manifestProvider, activeFilePath?) {
  const libraryRoot = library.path;
  if (activeFilePath && activeFilePath.startsWith(libraryRoot)) {
    const walkPaths = walkUpChipsConfigs(activeFilePath, libraryRoot, existsSet);
    const configs = await Promise.all(walkPaths.map(p => loadChipsConfigAtPath(libraryRoot, p)));
    const mergedConfig = mergeChipsConfigs(configs); // most-specific FIRST → wins
    // ... auto-derive from active-file's subdirectory; merge with mergedConfig ...
  } else {
    // back-compat: library-level only as before.
  }
}
```

CC names the exact functions/APIs based on Phase 1 read of chips.ts. The shape above is illustrative.

### chips-view.ts file-open listener

```typescript
// Before: palette computed once at load.
// After: re-compute on file-open.
this.registerEvent(
  this.app.workspace.on('file-open', (file) => {
    if (file) {
      void this.refresh(file.path);
    }
  }),
);
```

Idempotent for files where the walk doesn't yield different chips — CC verifies via tests.

### Auto-discovery scope narrowing

When `activeFilePath` is provided AND a subdirectory-level `_chips.md` exists, auto-discovery narrows to that subdirectory's snippets (not the whole library). Library-level `_chips.md` STILL contributes its overrides/groups/hide/synthetic_chips to the merged config; just the auto-derived snippet enumeration scopes down.

When no subdirectory `_chips.md` exists, auto-discovery uses the whole library (v0.2.65 behavior).

### Cache invalidation

`loadChipsForActiveVault` may be called repeatedly as the user switches files. Per-file-path caching is fine. Invalidate on `vault.on('modify')` for any `_chips.md` per the existing pattern (v0.2.49 fresh-frontmatter-read).

## Tests — TDD discipline

### `chips.test.ts` integration cases (5-6 new)

1. **Active file in chapter subdir with chapter `_chips.md`**: walk includes chapter + library; auto-discovery narrows to chapter's snippets.
2. **Active file at library root (no chapter)**: walk yields only library level; auto-discovery uses whole library.
3. **Active file in chapter A; siblings in chapter B don't surface**: scope narrowing test.
4. **Higher-specificity `overrides[]` wins**: library-level overrides `solitary` with one label; chapter-level overrides same target with different label; chapter wins.
5. **`hide[]` union**: library hides `print`; chapter hides `Set`. Result: both hidden.
6. **Same-label `synthetic_chips[]`**: library declares `print` with insertion A; chapter declares `print` with insertion B. Chapter wins.

### `chips-view.test.ts` (or sibling) for re-render

7. Switching active file from chapter 1 to chapter 2 triggers re-computation. Palette reflects chapter 2's chips after switch.
8. Active file outside any library (e.g., notes/) → palette computed without walk-up (back-compat).

## User-side smoke (CC writes §3 per 6a/6b)

Tests the walk-up end-to-end via a small scaffolded tutorial vault:

1. Pre-conditions: install v0.X.X. Create scaffolded vault at `~/forge-vaults/walk-up-smoke/` with:
   - `forge-tutorial/` library subdir with `_meta/_chips.md` declaring synthetic `print`, `Set`, `If`.
   - `forge-tutorial/01-hello/_chips.md` hiding `Set` and `If`.
   - `forge-tutorial/01-hello/hello.md` action snippet.
   - `forge-tutorial/02-variables/_chips.md` hiding only `If` (unhides `Set`).
   - `forge-tutorial/02-variables/greeting.md`.
2. Open hello.md → chip palette shows only `print` synthetic.
3. Switch to greeting.md → chip palette shows `print` + `Set`.
4. Switch back to hello.md → palette shows only `print` again.
5. Click `print` chip → inserts `Do [[print]]("<message>").`; `[[print]]` suppressed per v0.2.59 B7.2 (no stray print.md created).

Paste-able commands for scaffolding the vault + verifying file system state.

## Out of scope

- Authoring real forge-tutorial vault content (forge-doc's lane).
- Per-active-file palette for non-library-rooted files (notes outside any library).
- Configuration option for "always use whole-library auto-discovery" (premature).
- Walk-up beyond library root (already constrained in pure-core).

## Don'ts

- Don't change `chips-walk-up-core.ts` (already shipped + tested).
- Don't break v2 back-compat (library-level `_chips.md` should still work unchanged).
- Don't add file-open re-render hot-loops (debounce if rapid file-switching causes perf issues).
- Don't bump versions concretely — placeholder.

## Report when done

Standard §0–§3 per cc-prompt-queue.md. §1.2 documents how `activeFilePath` flows from `ChipsView` → `loadChipsForActiveVault` → `loadLibraryChips`. §1.3 cites line-number diffs. §3 covers the scaffolded-vault smoke per 6a/6b.
