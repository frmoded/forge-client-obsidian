# Chip palette schema v2 — adopt auto-discovery + signature-sourcing + `_chips.md` overrides

## Scope

Migrate the chip palette code path from v1 (vault-explicit only) to schema v2 (auto-discovery + signature-sourcing + `_chips.md` overrides + per-snippet `chip: false` opt-out). The full schema is specified in `~/projects/forge/docs/specs/chips-schema.md` (committed 2026-06-04). Constitution **S7** (the `_*.md` infrastructure-file exclusion) and **B7.1** (canonical E-- call syntax) are the cross-references.

Adoption work:
1. Extend `src/chips-core.ts` with auto-derivation logic for action + data snippets.
2. Extend `src/chips.ts` with v2 file-loader (parse `overrides[]`, `groups[]`, `hide[]`, `schema_version` check).
3. Add pure-core tests for: auto-derivation rules, merge logic, conflict resolution, error cases.
4. Migrate `forge-moda/_meta/_chips.md` from v1 → v2 form (and the bundle mirror).
5. (Forge-music's lane, deferred): forge-music vault doesn't have a `_chips.md` today; when forge-music drafts one post-adoption, that's their drain.

What this prompt does NOT do:
- Touch forge-music vault content. forge-music drives their `_chips.md` separately when ready.
- Change the chip palette UI rendering itself (ChipsView). The view consumes the same `ChipPaletteGroup[]` data structure; only its sourcing changes.
- Rewrite B5/B6/B7 (deferred to Stage-1+Stage-2 E-- migration drain).
- Touch the Forge ribbon icon / Cmd-P chip commands — only the data-sourcing path under them.

## Why

Per constitution Mission (V2a v7), composability is one of the four load-bearing snippet properties. Schema v2 lowers the cost-to-compose: every snippet is auto-chip-able (lower floor), curators can refine palettes via `_chips.md` (higher ceiling), and chips produce B7.1-canonical insertions (composability stays explicit). User explicitly named "Papert first, speed second" as the decision lens (`cowork-forge-protocol.md` Role separation). Schema v2 is a clear Papert win.

The current v1 `_chips.md` files (e.g., `forge-moda/_meta/_chips.md`) are hand-authored vault-explicit-only — every chip requires manual authoring, and the insertion text uses pre-B7.1 prose form (`Call [[X]].` rather than `Do [[X]]().`). v2 fixes both.

## Files to modify

- **`~/projects/forge-client-obsidian/src/chips-core.ts`** — pure-core helpers. Add: `humanizeSnippetId(id)`, `autoDeriveChip(snippet, libraryName)` for action snippets, `autoDeriveDataChip(snippet, libraryName)` for data snippets, `mergeChipsWithOverrides(autoChips, overrides, groups, hide)`. Tests in `chips-core.test.ts` (extend existing).
- **`~/projects/forge-client-obsidian/src/chips.ts`** — v2 file loader. Parse YAML body with `overrides:` / `groups:` / `hide:` / `schema_version: 2` top-level fields. Reject `schema_version != 2` with a console warning. Plumb the auto-derived list (from registry-walking) into `mergeChipsWithOverrides`.
- **`~/projects/forge-client-obsidian/src/chips-core.test.ts`** — new test cases (see TDD section).
- **`~/projects/forge-moda/_meta/_chips.md`** — migrate to v2 form. Rewrite each v1 `chips[]` entry into an `overrides[]` entry; rewrite insertion text to canonical B7.1 (`Call [[X]].` → `Do [[X]]().`). Add `schema_version: 2` to frontmatter. Drop `refs` field. Add a `groups[]` block to preserve the existing "Setup" / "Click" / etc. group ordering and labels.
- **`~/projects/forge-client-obsidian/assets/vaults/forge-moda/_meta/_chips.md`** — bundle mirror, byte-equal to the source-of-truth above. Engine-bundle-drift preflight catches drift.
- **`~/projects/forge-client-obsidian/manifest.json`** — `{CURRENT} → {NEXT_PATCH}` per the late-binding placeholder convention.
- **`~/projects/forge-client-obsidian/INSTALL.md`** — version pin update.

## Files to read first (for accuracy)

- `~/projects/forge/docs/specs/chips-schema.md` — the v2 spec. CC reads this first; the prompt's implementation notes below are a summary, the spec is canonical.
- `~/projects/forge/docs/specs/constitution.md` — S7 (infrastructure-file exclusion) and B7.1 (canonical call syntax). Cross-references the spec uses.
- Current `src/chips-core.ts` and `src/chips.ts` — to know what exists. v0.2.47 most recently restructured this; the v2 work builds on top.
- Current `forge-moda/_meta/_chips.md` — to know what's getting migrated.

## Implementation notes

### Auto-derivation rules (chips-core.ts)

For each candidate snippet found via registry walk:

```typescript
function deriveChip(snippet: SnippetMeta, libraryName: string): Chip | null {
  // S7: skip _*.md basenames
  if (basename(snippet.path).startsWith('_')) return null;
  // Per-snippet opt-out
  if (snippet.frontmatter.chip === false) return null;
  // Snapshots never become chips (S6)
  if (snippet.frontmatter.type === 'snapshot') return null;

  const label = humanizeSnippetId(snippet.id);
  const group = parentSubdirOrDefault(snippet.path);  // e.g. "blues", "Other"

  if (snippet.frontmatter.type === 'action') {
    // B7.1 signature-derived insertion
    const inputs = snippet.frontmatter.inputs ?? [];
    const argList = inputs.map(name => `<${name}>`).join(', ');
    const insertion = `Do [[${snippet.id}]](${argList}).`;
    return { target: snippet.id, label, group, insertion };
  }

  if (snippet.frontmatter.type === 'data') {
    // Data snippets: no-arg call, receive-into-binding default
    const insertion = `Set <name> to [[${snippet.id}]]().`;
    return { target: snippet.id, label, group, insertion };
  }

  return null; // unknown type
}
```

Naming helper:

```typescript
function humanizeSnippetId(id: string): string {
  // last path segment, snake-case → words, capitalize first letter
  const basename = id.split('/').pop() ?? id;
  const words = basename.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
```

### Merge logic (chips-core.ts)

```typescript
function mergeChipsWithOverrides(
  autoChips: Chip[],
  overrides: ChipOverride[],
  groups: ChipGroup[],
  hide: string[],
): ChipPaletteGroup[] {
  // 1. Apply overrides: replace specified fields, preserve unspecified
  // 2. Apply hide[]: drop chips whose target is in the hide list
  // 3. Apply per-snippet `chip: false` already happened in auto-derivation
  // 4. Conflict resolution: if a snippet had `chip: false` AND has an override
  //    entry, frontmatter wins — the override is silently dropped (warn).
  //    Note: by step 3, frontmatter-excluded chips are already not in
  //    autoChips, so overrides targeting them have no match; that's the
  //    natural "missing target" warning case.
  // 5. Apply groups[] for group order + display labels
  // 6. Sort within each group by order field (specified) then label (default)
}
```

### v2 file loader (chips.ts)

```typescript
async function loadChipsForActiveVault(host: ChipsHost): Promise<ChipsManifest> {
  // Walk active library subdirs
  // For each library subdir:
  //   - autoChips = walk action+data snippets, derive via deriveChip
  //   - load _meta/_chips.md if present; check schema_version == 2
  //     - if absent: skip the override step; autoChips is the final list
  //     - if schema_version wrong: console.warn, skip the file
  //     - if malformed YAML: console.warn, skip the file
  //   - merged = mergeChipsWithOverrides(autoChips, overrides, groups, hide)
  //   - accumulate into manifest
}
```

### `forge-moda/_meta/_chips.md` migration

Current v1:

```yaml
chips:
  - label: "Create water particles"
    insertion: "Call [[create_water_particles]]."
    group: "Setup"
    refs: [create_water_particles]
  # ... 15 more entries
```

Target v2 (frontmatter gains `schema_version: 2`; body restructured):

```yaml
overrides:
  - target: create_water_particles
    label: "Create water particles"
    group: "Setup"
    insertion: "Do [[create_water_particles]]()."
  # ... rewrite each v1 entry: target = v1 target inferred from refs[] (or
  # derived from snippet name in label); insertion rewritten to B7.1; refs dropped

groups:
  - id: Setup
    order: 1
    label: "Setup chain"
  - id: Click
    order: 2
    label: "Click chain"
  # ... + the other 3 groups from v1
```

The rewrite is mechanical for entries where v1 `refs: [snippet_id]` cleanly maps to a single target. For v1 entries where the label doesn't map to a recognizable snippet (or refs are multi-target), CC pauses and asks — those are likely v1-era "macro chips" that don't fit v2's single-target shape.

## Tests

### Auto-verifiable by CC — TDD discipline

**Step 1 — Write the failing tests first.** Cases in `chips-core.test.ts`:

1. `humanizeSnippetId('create_water_particles')` → `'Create water particles'`.
2. `humanizeSnippetId('forge-music/blues/song')` → `'Song'` (last path segment).
3. `deriveChip` for an action snippet with inputs `[name]` → insertion `'Do [[greet]](<name>).'`.
4. `deriveChip` for an action snippet with no inputs → insertion `'Do [[banner]]().'`.
5. `deriveChip` for an action snippet with `chip: false` in frontmatter → returns `null`.
6. `deriveChip` for a basename starting with `_` (e.g., `_chips`) → returns `null` (S7).
7. `deriveChip` for a data snippet → insertion `'Set <name> to [[water_color]]().'`.
8. `deriveChip` for a snapshot (`type: snapshot`) → returns `null`.
9. `mergeChipsWithOverrides` — override replaces specified fields, preserves unspecified.
10. `mergeChipsWithOverrides` — `hide[]` removes matching targets.
11. `mergeChipsWithOverrides` — override targeting non-existent snippet logs warning, dropped.
12. `mergeChipsWithOverrides` — group `order` + `label` applied.
13. `mergeChipsWithOverrides` — within group, sort by `order` field, then alphabetical by label.
14. `mergeChipsWithOverrides` — frontmatter `chip: false` snippet has no auto-chip; override targeting it falls under case 11 (missing-target warning).
15. Idempotent rider — merge twice with same inputs → byte-identical output (no-op-stays-no-op).

**Step 2 — Implement.** Per the spec.

**Step 3 — Re-run, full suite green.** Capture verbatim test output.

**Step 4 — Migrate forge-moda `_chips.md`.** Confirm post-migration that all 16 chips still appear in the palette with correct labels, groups, and B7.1-canonical insertions.

### User-side smoke (CC writes the §3 checklist per protocol)

Per cc-prompt-queue.md quality rules. Exercises:

- Install v0.X.X via `install-latest.sh`.
- Open a vault with `domains = ["moda"]` (or whatever cohort default).
- Open an action snippet; right-click → chip toolbar button appears (v0.2.46 still works).
- Open the chip palette via Cmd-P → "Forge: Open chips palette" (or whatever the current command is).
- Verify auto-discovered chips appear for every action AND data snippet in active libraries (NEW behavior).
- Verify chip insertion text uses B7.1 form (`Do [[X]]().` / `Set <name> to [[Y]]().`).
- Verify `_chips.md` overrides take effect (forge-moda's curated Setup/Click groupings still work).
- Negative case: create a snippet with `chip: false` in frontmatter, refresh palette, confirm the chip does NOT appear.
- Negative case: a malformed `_chips.md` (intentionally broken YAML) → palette falls through to pure auto-discovery, console shows the warning.
- Group ordering check: forge-moda's groups appear in declared order (Setup, Click, Step, Render, Helpers — whatever the v1 had).

## Out of scope

- forge-music `_chips.md` — forge-music drives their own when they choose.
- B5/B6/B7 atomic rewrite — Stage-1+Stage-2 territory.
- Snippet `chip:` frontmatter UI editor — authors edit YAML by hand; no UI needed for V1.
- Chip palette UI changes (filtering, search, drag-to-favorite) — separate prompt if/when needed.

## Don'ts

- **Don't drop the v0.2.47 chip-source-discovery fix.** v2's auto-derivation builds on the on-disk discovery path; don't accidentally regress to domain-based discovery.
- **Don't change `CHIPS_VIEW_TYPE`** ('forge-chips') — workspace-leaf identifier; renaming would orphan user layouts.
- **Don't change chip insertion behavior when clicked** — the chip's `insertion` field still gets pasted into the editor; only the SOURCE of that text changes.
- **Don't auto-migrate v1 `_chips.md` files at load time.** v1 → v2 is a one-time author/curator decision; auto-migration would silently overwrite hand-curated content. If CC encounters a v1-shape file (missing `schema_version`), fall through to pure auto-discovery and log a "v1 schema detected — consider migrating" warning.
- **Don't bump versions concretely** — use `{CURRENT} → {NEXT_PATCH}`.
- **Don't batch feedback at end of multi-phase drain.** Per cc-prompt-queue.md HARD RULE.

## Report when done

Standard §0–§3 per cc-prompt-queue.md:

- **§0** — manifest before/after, commit SHA, push, tag, release URL, SHA round-trip, line counts of changed files.
- **§1.1** — TDD test cases (the 15 above + any extras CC adds).
- **§1.2** — pre-fix test output (cases fail since helpers don't exist).
- **§1.3** — fix landed: cited line-number diffs in chips-core.ts + chips.ts + forge-moda/_meta/_chips.md.
- **§1.4** — post-fix verbatim test output.
- **§1.5** — full `npm test` suite.
- **§2** — surprises during the migration: any v1 entries that didn't map cleanly to v2 single-target overrides; any edge cases in the auto-derivation logic. Specifically flag if forge-moda's existing chips contained any patterns the schema doesn't cover (multi-target "macro chips," for instance).
- **§3** — user-side smoke checklist per the quality bar.
