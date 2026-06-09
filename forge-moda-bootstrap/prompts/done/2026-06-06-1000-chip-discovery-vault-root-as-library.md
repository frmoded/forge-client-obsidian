# Chip discovery — handle vault-root-as-library (Path A) for source-repo workflow

> **CC pre-drain reminder (HARD RULE per cc-prompt-queue.md):** before reading this prompt, re-read `~/projects/forge-moda-bootstrap/cc-prompt-queue.md` end-to-end. Re-read constitution V2a v9 for A4.1 (V2a v8), B7.1, B7.2, S7.

## Scope

Per forge-music's Brief (c): when forge-music's source repo (`~/projects/forge-music/`) is opened directly as an Obsidian vault (Path A), the chip palette discovers only **4 chips** instead of the expected 13+ action snippets across `percussion/` + `percussion_lab/` + `blues/`. Cause: chip discovery walks library subdirectories (per v0.2.47's `libraryDirNames`), expecting `<vault>/<library>/<content>/`. Path A has `<vault>/<content>/` — the vault root IS the library, no intermediate library subdir.

Fix: chip discovery detects when the vault root IS a library (vault `forge.toml`'s `name` matches an installed domain) and treats vault-root subdirs as library content for discovery purposes.

What this prompt does NOT do:
- Touch chip insertion templating (separate brief (d), separate prompt).
- Touch auto-extract Path A pollution (separate brief (e), separate prompt). Both share the "source vault detection" concept but operate in different code paths.
- Change the v0.2.54 top-level-snippet auto-discovery for non-source vaults — top-level snippets in user vaults still get the "Personal" group.

## Why

Per Mission's composability + low-floor properties: forge-music cowork develops directly in their source repo (Path A is their primary workflow). When chips don't surface for percussion_lab/ snippets, the composability affordance is broken in their primary workflow. Plus this is the same architectural shape that affects anyone doing source-repo development on a library.

## Phase shape — investigation-before-design rider

**Phase 1 — investigation**:

1. Read `~/projects/forge-client-obsidian/src/chips.ts` `buildSnippetInventory` and `loadVaultRootV1Chips`. Cite the exact filter logic that scopes discovery to library subdirs.
2. Read `~/projects/forge-client-obsidian/src/main.ts:libraryDirNames`. Confirm what it returns and how (does it require `forge.toml` in the subdir? Does it just enumerate known bundled library names?).
3. Open `~/projects/forge-music/forge.toml` and read its content. Confirm `name = "forge-music"` (or whatever the field is) AND `domains = ["music"]`. The latter triggers `ensureBundledForgeMusic` which is the symptom path for brief (e); the former is the detection mechanism for brief (c).
4. Investigate brief (c)'s "the 4 visible chips" — which directories contributed them? This narrows the scope of what's missing.
5. Decide Option A or Option B based on findings:
   - **Option A**: when `<vault>/forge.toml`'s `name` matches an installed library, treat vault root as a virtual library subdir. Chip discovery walks vault-root subdirs (`percussion/`, `percussion_lab/`, `blues/`) as content of that library. Cleanest semantic; preserves the library/content distinction.
   - **Option B**: chip discovery walks ALL action snippets in the vault regardless of library structure when the vault is a source repo. Broader change; may surface unintended snippets.

My recommendation: A — the semantic alignment with libraries-as-discovery-roots is correct; B opens edge cases.

**Phase 2 — fix per Phase 1 findings.**

Phase 1 commits as its own commit before Phase 2 starts.

## Files likely to touch

Phase 1: read-only investigation; no code changes.

Phase 2:
- **`~/projects/forge-client-obsidian/src/source-vault-core.ts`** — NEW pure-core helper. `isSourceVault(rootTomlBody)` returns the bundled-library name if the vault root IS a library, otherwise null. Pure-core extraction #23. Tests in sibling `.test.ts`. (This helper will be reused by brief (e) — the same detection logic.)
- **`~/projects/forge-client-obsidian/src/chips.ts`** — extend `buildSnippetInventory` to consult `isSourceVault`. When vault is a source vault, walk vault-root subdirs as the library's content.
- **`~/projects/forge-client-obsidian/src/main.ts:libraryDirNames`** — possibly extended to return `[name]` (the vault's own name) when vault is a source vault. Or chips.ts handles the case directly without changing libraryDirNames. Phase 1 chooses.
- **`~/projects/forge-client-obsidian/manifest.json`** — `{CURRENT} → {NEXT_PATCH}` placeholder.
- **`~/projects/forge-client-obsidian/INSTALL.md`** — version pin update.

(No constitution touch — the behavior is an extension of existing chip-discovery semantics, not a new invariant.)

## Tests — TDD discipline

### Phase 2 — pure-core test cases for `source-vault-core.ts`

1. `isSourceVault(null)` → `null` (no forge.toml).
2. `isSourceVault("")` → `null` (empty).
3. `isSourceVault('name = "forge-music"\ndomains = ["music"]')` → `"forge-music"`.
4. `isSourceVault('name = "forge-moda"\ndomains = ["moda"]')` → `"forge-moda"`.
5. `isSourceVault('name = "my-cohort-vault"\ndomains = ["moda"]')` → `null` (name doesn't match any bundled library).
6. `isSourceVault('domains = ["music"]')` → `null` (no name field).
7. `isSourceVault` accepts a list of known bundled libraries (`["forge-music", "forge-moda"]` etc.) — recognized names are returned, unrecognized return null.
8. Idempotent.

### Chip-discovery integration tests

Extend existing `chips.test.ts` or sibling:

9. Chip discovery in a normal user vault (vault root NOT a library) walks `<vault>/forge-moda/` subdirs as before. Regression test.
10. Chip discovery in a source vault (vault root IS forge-music) walks `<vault>/percussion/`, `<vault>/percussion_lab/`, `<vault>/blues/` as the library's content. The 13+ action snippets surface.
11. Chip discovery in a source vault still respects per-snippet `chip: false` and S7 `_*.md` exclusions.

## User-side smoke (CC writes §3 per 6a/6b)

Per cc-prompt-queue.md 6a/6b. Paste-able commands + UI prose.

Smoke for Path A (the brief's reproduction):

1. Install v0.X.X plugin via install-latest.sh OR via the appropriate BRAT path into a freshly-opened `~/projects/forge-music/` vault.
2. Open the chip palette (sidebar / command palette).
3. Verify the chip palette shows ALL 13+ action snippets across percussion/, percussion_lab/, blues/. Specifically:
   - `solitary`, `companions`, `gathering`, `swarming`, `peak`, `dispersing`, `threading`, `resting` (8 in percussion_lab/)
   - `drums_shuffle`, `murmuration`, `loom`, `phase_cell`, `phase_shifter` (in percussion/ — actual count depends on which are action snippets vs helpers)
   - Plus blues content
4. Negative case: open a normal cohort vault (forge-vaults/test1 with `domains = ["music"]` but `name = "test1"`) and confirm chip palette behavior is unchanged from v0.2.54 (top-level + library-subdir discovery).

Paste-able file checks: `ls ~/projects/forge-music/percussion_lab/` should show 9 entries (8 snippets + 1 README).

## Out of scope

- Auto-extract guards (brief (e)'s separate prompt).
- Chip insertion templating (brief (d)'s separate prompt).
- New discovery options for "discover-anywhere" mode (premature).

## Don'ts

- Don't touch chip insertion logic.
- Don't touch auto-extract logic.
- Don't change `libraryDirNames` semantics for normal user vaults (regression risk).
- Don't bump versions concretely — placeholder.

## Report when done

Standard §0–§3 per cc-prompt-queue.md with two-phase structure. §1.2 documents the Phase 1 findings (specifically: list the 4 chips that did surface in the brief's reproduction; cite the filter logic that excluded the rest).
