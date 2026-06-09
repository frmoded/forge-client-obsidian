---
timestamp: 2026-06-08T20:00:00Z
session_id: drain-2026-06-08-2000
status: pending
---

# v0.2.82 — AUTHORING subdir collision detect-and-warn + .bak directory UI cue

## §0 — Context

Two independent polish items bundled by thematic coherence (both are cohort-onboarding UX defenses). User authorized 2026-06-08 from polish backlog discussion:
- **Item A** (polish #7): AUTHORING-vault subdir collision — basename-keyed entries silently shadow same-basename files in different subdirs.
- **Item B** (polish #10): `.bak.*` directory UI cue — v0.2.78's filter removed `.bak.*` directories from snippet discovery, but Obsidian's file tree still surfaces them, causing cohort onboarding confusion.

Version naming: v0.2.82 assumed (one above the last shipped v0.2.81). If v0.2.80 (facet-mutex) ships before this drain, increment accordingly.

## §1 — Goal

### §1.1 — Item A: collision detect-and-warn

When the SnippetRegistry indexes a vault and encounters a duplicate basename within the AUTHORING vault (same-basename files in different subdirs), the SECOND insert should:
1. Log a `console.warn` clearly identifying the collision: paths of both files + which one was kept (per the existing "first-match-wins" semantics).
2. Optionally fire a `new Notice(...)` once per session per collision pair (deduped) to make the issue user-visible.
3. NOT change resolution semantics — first match still wins (matching existing A4 walking contract). Collisions are surfaced, not resolved.

The warning fires at indexing time, not at resolution time. Per-vault, not cross-vault (cross-vault uses path qualification per v0.2.78 `find_qualified_by_bare`).

### §1.2 — Item B: .bak.* UI cue

When the user has `.bak.*` directories in their vault (created by v0.2.38 auto-re-extract), Obsidian's file tree currently shows them as normal directories. Two complementary user-facing cues:
1. **Visual de-emphasis**: CSS rule that subdues/strikethroughs `.bak.<version>/` directories and their contents in the Obsidian file explorer.
2. **Notice on first open**: when user opens any file under a `.bak.*` directory, fire a one-shot Notice explaining: "This file is a backup of an older library version (`.bak.<version>/`). The live version is at `<base-path>/`. Backups are read-only by convention; running Forge on them is supported but not recommended."

Both cues clarify the situation without auto-deleting user content.

## §2 — Investigation phase (per §78)

### §2.1 — Item A: collision detection site

Locate the SnippetRegistry insertion point. Likely in `forge/core/snippet_registry.py`:`_scan_library_vault` or similar (for AUTHORING vault: the `scan` method's authoring traversal branch).

Verify where `_vaults["<vault>"]["<basename>"] = entry` happens. Add detection BEFORE that assignment: if the key already exists, log + (optionally) signal up to the plugin side for a Notice.

Cross-language: warning needs to reach the user. Either:
- (a) Engine logs `console.warn` via JS bridge (matches v0.2.81 pattern for `_forge_facet_form_warning_set`).
- (b) Engine returns a warnings list in the scan result; plugin surfaces them.

(a) is simpler. Use it. Session-dedup: a module-scoped Python set of "<vault>:<basename>" pairs, so repeated indexing in the same session only warns once per collision pair.

### §2.2 — Item B: Obsidian file-tree styling API

Investigate whether Obsidian exposes a way to style file-tree entries from a plugin:
- Likely path: register a CSS class via `document.body.classList.add(...)` + ship CSS in `styles.css` that targets `.nav-file-title[data-path*=".bak."]` or equivalent.
- Inspect Obsidian's file tree DOM (e.g. `.nav-file-title-content`) to confirm `data-path` is available.

If file-tree styling isn't reachable, fallback: ship only the Notice (1.2 part 2). Visual de-emphasis is the nice-to-have; Notice is the load-bearing.

### §2.3 — Item B: Notice trigger

Hook on `vault.on('open')` or `workspace.on('file-open')` to detect when user opens a file under a `.bak.*` directory. Use the existing `_BAK_DIR_PATTERN` regex from v0.2.78 to match the path.

Session-dedup: only fire ONCE per `<vault>/<bak-dir>` per session. Use a module-scoped Set.

### §2.4 — Item A: NOT plugin-side

Item A's detection lives engine-side (snippet registry scan). The plugin-side hook is just the JS-console-warn bridge. Don't restructure the registry layer for this.

### §2.5 — Test fixture for Item A

Reproduce the collision: create a test vault with `notes/chorus.md` AND `songs/chorus.md`. Assert the second scan logs the warning + only one survives in the registry (first-match-wins per A4).

### §2.6 — Test fixture for Item B

Mock vault with `forge-tutorial/` AND `forge-tutorial.bak.0.1.0/`. Open file under `.bak.*`. Assert Notice fires once. Open another file under `.bak.*`. Assert Notice does NOT fire again (dedup).

## §3 — Implementation phases

### §3.1 — Phase 1: Item A engine-side

`forge/core/snippet_registry.py`:
- Module-scoped `_collision_warning_set: Set[Tuple[str, str]] = set()`.
- In `scan` authoring traversal: before `_vaults[name][basename] = entry`, check if `basename in _vaults[name]`. If yes + `(name, basename) not in _collision_warning_set`:
  - Construct warning message: "Forge: snippet collision in '<vault>'/'<basename>'. Indexed: '<first-path>'. Shadowed: '<second-path>'. First-match wins. Rename one to disambiguate."
  - Log via `js.console.warn(message)` (Pyodide bridge).
  - Add `(name, basename)` to `_collision_warning_set`.
- Test in `forge/tests/core/test_snippet_registry_collision.py`:
  - 1: Single basename → no warning.
  - 2: Collision in authoring vault → warning fires, first-match wins.
  - 3: Repeat scan same session → warning fires ONLY once per pair.
  - 4: Collision in library vault (sub-path keys, different shape) → does NOT fire (libraries use sub-path keys).
  - 5: Multiple collisions in same vault → each fires once.

### §3.2 — Phase 2: Item B styling

`styles.css`:
```css
.nav-file-title[data-path*=".bak."] {
  opacity: 0.55;
  text-decoration: line-through;
}
.nav-folder-title[data-path*=".bak."] {
  opacity: 0.55;
}
.nav-folder-title[data-path*=".bak."]::after {
  content: " (backup)";
  font-size: 0.8em;
  opacity: 0.7;
}
```

(Exact selectors depend on §2.2 DOM investigation.)

### §3.3 — Phase 3: Item B Notice

In `main.ts`:
- Module-scoped `_seenBakDirsThisSession = new Set<string>()`.
- `workspace.on('file-open', file => ...)`:
  - If file.path matches `_BAK_DIR_PATTERN`:
    - Extract the `<vault>/<bak-dir>` key.
    - If not in `_seenBakDirsThisSession`:
      - `new Notice("Forge: '<bak-dir>' is a backup of an older library version. The live version is at '<base-path>/'. Backups are read-only by convention.", 8000)`.
      - Add to seen set.

Test in `src/main-bak-notice.test.ts`:
- 1: Open file outside `.bak.*` → no Notice.
- 2: Open file under `.bak.*` → Notice fires.
- 3: Open second file under same `.bak.*` → Notice does NOT fire.
- 4: Open file under DIFFERENT `.bak.*` → Notice fires (separate dedup key).

### §3.4 — Phase 4: integration verification

- Plugin loads with no Console errors.
- Item A: engine smoke shows warnings in DevTools.
- Item B: opening a backup file shows the Notice.

## §4 — Tests required summary

- Item A: 5 engine tests.
- Item B: 4 plugin tests + visual verification of CSS rules.
- Existing test suites must remain passing.

## §5 — User-side smoke checklist

```
# Step 1 — install v0.2.82.

# Step 2 — Item A reproduction:
# Create collision in your test vault:
mkdir -p ~/forge-vaults/bluh/notes ~/forge-vaults/bluh/songs
echo "# English\n\nFirst chorus." > ~/forge-vaults/bluh/notes/chorus.md
echo "# English\n\nSecond chorus." > ~/forge-vaults/bluh/songs/chorus.md
# Cmd-R Obsidian; open DevTools console.
# Expected: Console shows ONE warning about the collision.

# Click [[chorus]] wikilink (or open one of the files). Forge-click 🔥.
# Verify: snippet resolves to the first-indexed one (deterministic per A4).

# Cmd-R again. Expected: warning fires ONCE more (new session = re-warning).

# Step 3 — Item B reproduction:
# If you have a .bak.* directory in your vault (e.g. from v0.2.79 install):
ls -d ~/forge-vaults/bluh/forge-tutorial.bak.* 2>/dev/null
# If none exist, create one:
cp -r ~/forge-vaults/bluh/forge-tutorial ~/forge-vaults/bluh/forge-tutorial.bak.0.1.0
# Cmd-R Obsidian.
# In file tree, observe: forge-tutorial.bak.0.1.0/ should appear visually
# de-emphasized (struck-through / lower opacity / "(backup)" suffix).
# Click on any file inside forge-tutorial.bak.0.1.0/.
# Expected: Notice fires ONCE explaining the backup. Click another file
# under the same .bak dir; Notice does NOT fire again.

# Step 4 — cleanup:
rm ~/forge-vaults/bluh/notes/chorus.md ~/forge-vaults/bluh/songs/chorus.md
rmdir ~/forge-vaults/bluh/notes ~/forge-vaults/bluh/songs
# Leave the .bak.* directory (the v0.2.78 filter handles it).
```

## §6 — Open follow-ups expected

1. **Per-vault `find_qualified_by_bare` for Item A**: current first-match-wins matches A4. A future drain could prompt for disambiguation when user wikilinks to ambiguous basename. Out of scope for v0.2.82.
2. **Auto-purge .bak.* directories**: deferred per v0.2.78 follow-up #1 discussion. If cohort accumulates many .bak directories, future drain considers auto-purge after N days.
3. **CSS selector stability**: if Obsidian changes its file-tree DOM structure, the styling rules in (§3.2) break silently. Manual visual check during cohort smoke catches it.

## §7 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §2.1 (registry insertion site), §2.2 (Obsidian DOM API), §2.5 + §2.6 (test fixtures) discharged before impl.
- ✓ §57–74 (TDD): test cases written first for both items.
- ✓ §86–118 (pure-core convention): Item A detection is pure (collision check is a deterministic function of registry state); Item B Notice trigger is integration-layer (Obsidian event hooks).
- ✓ §76 (don't ship speculative fix): both items have concrete user-facing justification.
- ✓ §347 (version-bump sanity check): manifest pre-bump verified at v0.2.81 (assuming v0.2.80 hasn't shipped yet); explicit version arg.
- ✓ §321 (feedback file before move): standard.

## §8 — Architectural framing

Both items are V1 polish, NOT V2 work. They target the current AUTHORING-vault + bundled-library architecture. V2's snippet identity may change (per `~/projects/forge/docs/v2-direction.md`) — when V2 lands, Item A's collision semantics may not apply (if `source` field replaces basename-keying); Item B's .bak handling will still be relevant.

If V2 substantially changes snippet identity, Item A becomes throw-away. Item A's cost is small (~50 LOC + 5 tests); acceptable.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §9 — Hand-off

Item A and Item B are independent — can be implemented in either order or in parallel. Suggested order: Item A first (engine-side, smaller scope), then Item B (plugin-side + CSS + investigation). Both should land in the same release.
