---
timestamp: 2026-06-06T17:00:00Z
session_id: claude-code-drain-chip-schema-v3
prompt_modified: 2026-06-06T17:00:00Z
status: success
---

# Feedback — 2026-06-06-1700 Chip schema v3 — v3.2 synthetic chips shipped, v3.1 walk-up partial (v0.2.65)

## §0 — Release coordinates

**Manifest:** 0.2.64 → 0.2.65.

**Commit:** `04afd7f` on `forge-client-obsidian/main`. **Tag:** `v0.2.65`. **Release:** <https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.65>. **Zip SHA-256:** `b7c50004f74f033d959957c73123929ce97226417d583647f21ac417660ee0fe`. install-latest.sh into smoke vault: clean.

**Line counts:**

| File | Lines | Note |
|---|---|---|
| `src/chips-walk-up-core.ts` | 90 | NEW. Pure-core extraction #24. |
| `src/chips-walk-up-core.test.ts` | 110 | NEW. 10 TDD cases. |
| `src/synthetic-chips-core.ts` | 150 | NEW. Pure-core extraction #25. |
| `src/synthetic-chips-core.test.ts` | 217 | NEW. 19 TDD cases. |
| `src/chips-core.ts` | +28 | v3 parse: schema_version 2 OR 3; synthetic_chips field. |
| `src/chips.ts` | +60 | v3 acceptance + `appendSyntheticChipGroups` helper. |
| `src/chips.test.ts` | +27 | 3 new chips-core v3 cases. |
| `manifest.json` | 10 | version bump. |
| `INSTALL.md` | (5 pin replacements) | v0.2.64 → v0.2.65. |

## §1.1 — TDD test cases (32 new)

**Pure-core walk-up (`chips-walk-up-core.test.ts`)** — 10 cases:
1. File in nested chapter under vault-root library → chapter then root + meta.
2. File at vault root → vault-root + meta only.
3. Deeply nested file (3 levels) → 4-step walk including root.
4. Levels with no `_chips.md` skipped (only existing files returned).
5. Library root boundary respected (never walks above libraryRoot).
6. Empty existingFiles → `[]`.
7. Idempotent.
8. File directly at library root (no subdir) → library-root level only.
9. `_meta/_chips.md` location ONLY at library root, NOT at subdirs.
10. Walk via no-`_chips.md` path terminates correctly.

**Pure-core synthetic chips (`synthetic-chips-core.test.ts`)** — 19 cases including:
- `parseSyntheticChips` — valid entries with defaults; missing label/insertion dropped; multi-line `|` preserved; group default "Synthetic"; order undefined when absent; empty list; non-array; non-object dropped; non-finite order ignored.
- `mergeSyntheticChipsHigherWins` — same-label higher-specificity wins; distinct labels accumulate; empty levels graceful; idempotent.
- `applyHideToSyntheticChips` — hide by label; empty / undefined hide returns shallow copy.
- `DEFAULT_SYNTHETIC_GROUP` constant.

**chips-core v3 parse (`chips.test.ts`)** — 3 new cases:
- `schema_version: 3` ACCEPTED (v3 spec adoption 2026-06-06).
- `schema_version: 4+` → error (forward-compat hook for v4+).
- `schema_version: 3 + synthetic_chips[]` → parsed and integrated into config.

## §1.2 — Phase 1 investigation findings

### chips.ts entry point and the v2 schema_version gate

`chips.ts:288` (pre-v0.2.65): `if (sv === 2)` ONLY. v3 files would have been silently skipped:

```typescript
if (sv === 2) {
  const cfg = parseChipsV2Config(v2Result);
  ...
}
if (sv !== undefined) {
  console.warn(`schema_version=${sv} is not 2 — skipping file`);
}
```

### chips-view.ts file-open trigger

`chips-view.ts:38`: `this.app.workspace.on('file-open', (file) => { void this.render(); ... })`. Render re-fires on every file change, but `this.groups` was populated once by `loadChipsForActiveVault()` — palette stays vault-wide; only the gate logic (action vs data file) re-applies. This means v3.1 per-file palette context requires changing `loadChipsForActiveVault` to accept an active file path AND `chips-view.ts:refresh()` to thread it through. Substantial coordinated change.

### Real `_chips.md` files in scope

- `forge-moda/_meta/_chips.md`: v2, no synthetic_chips. Auto-derives 16 curated chips per the v0.2.48 migration.
- forge-music: no `_chips.md` (all chips are auto-derived per v0.2.62 source-vault discovery).
- No tutorial vault on disk yet (forge-doc's Tier 1 is unblocked by THIS drain to start authoring).

### Scope split decision

v3.2 synthetic chips is the load-bearing forge-doc unblocker: chapter `_chips.md` can declare `print`, `Set`, `If`, etc. so the tutorial pedagogy can teach language constructs. Shipping v3.2 at the library-`_chips.md` level (`forge-tutorial/_meta/_chips.md` etc.) covers this entirely.

v3.1 per-chapter walk-up enables hide-print-in-chapter-0, unhide-in-chapter-1 narrowing. Real, but optional for the unblock — chapter sequencing can also be done via per-chapter content + hide[] at the library level. Shipping the pure-core walk-up helper means the wiring drain in a follow-up is purely glue-layer work.

**Decision: ship v3.2 + the v3.1 helper + chips-core v3 acceptance. Defer the v3.1 glue-layer wiring (chips.ts file-context awareness + chips-view.ts file-open re-render trigger) to a follow-up drain.**

## §1.3 — Fix landed

### `src/chips-walk-up-core.ts` (NEW, pure-core #24)

`walkUpChipsConfigs(activeFilePath, libraryRoot, existingFiles)` — see test cases. Library root boundary; library-root level probes `_meta/_chips.md` alongside `_chips.md`; subdirs probe `_chips.md` only.

### `src/synthetic-chips-core.ts` (NEW, pure-core #25)

```typescript
export interface SyntheticChip {
  label: string;
  insertion: string;
  group: string;       // defaults to DEFAULT_SYNTHETIC_GROUP = 'Synthetic'
  order?: number;
}
export function parseSyntheticChips(decoded: unknown): SyntheticChip[]
export function mergeSyntheticChipsHigherWins(perLevelLists: SyntheticChip[][]): SyntheticChip[]
export function applyHideToSyntheticChips(chips: SyntheticChip[], hide: string[] | undefined): SyntheticChip[]
```

### `src/chips-core.ts` v3 parse

```diff
 export interface ChipsV2Config {
-  schema_version: 2;
+  schema_version: 2 | 3;
   overrides?: ChipOverride[];
   groups?: ChipGroup[];
   hide?: string[];
+  synthetic_chips?: SyntheticChip[];
 }

 export function parseChipsV2Config(decoded: unknown): ChipsV2Config | ChipsParseError {
   ...
-  if (r.schema_version !== 2) {
-    return { error: `... must be 2, got ${...}` };
-  }
-  const cfg: ChipsV2Config = { schema_version: 2 };
+  if (r.schema_version !== 2 && r.schema_version !== 3) {
+    return { error: `... must be 2 or 3, got ${...}` };
+  }
+  const cfg: ChipsV2Config = { schema_version: r.schema_version };
   ...
+  if (Array.isArray(r.synthetic_chips)) {
+    cfg.synthetic_chips = parseSyntheticChips(r);
+  }
   return cfg;
 }
```

### `src/chips.ts` v3.2 wiring

```diff
-    if (sv === 2) {
+    if (sv === 2 || sv === 3) {
       const cfg = parseChipsV2Config(v2Result);
       if (isParseError(cfg)) { ... }
-      return mergeChipsWithOverrides(autoChips, cfg);
+      const groups = mergeChipsWithOverrides(autoChips, cfg);
+      return appendSyntheticChipGroups(groups, cfg);
     }
```

`appendSyntheticChipGroups(baseGroups, cfg)` — applies `hide[]` to synthetic chip labels, buckets by `group`, sorts within each by `order` then label, appends as new ChipPaletteGroups.

## §1.4 — Post-fix verbatim test output

```
ℹ tests 410
ℹ pass 410
ℹ fail 0
```

(379 baseline + 31 new = 410.)

## §1.5 — Full `npm test`

```
ℹ tests 410
ℹ pass 410
ℹ fail 0
```

## §2 — Surprises during implementation

**`require is not defined` in node --test under ESM.** First attempt used `const { parseSyntheticChips } = require(...)` inside `parseChipsV2Config` for lazy import. Fails under ESM. Switched to top-level `import { parseSyntheticChips } from './synthetic-chips-core.ts'`. The `.ts` extension is required for node --test's import resolution (other test-coupled production files in the repo use `.ts` extensions too).

**Existing test required update.** `parseChipsV2Config: schema_version !== 2 → error (forward-compat hook)` was the v2-era assertion. v3 spec now ACCEPTS 3. Updated the test to:
- Accept v3.
- Reject v4+ as the new forward-compat hook.
- Add a positive case for `schema_version: 3 + synthetic_chips[]` → parsed + integrated.

**v3.1 walk-up wiring decision (split-ship rationale).** The walk-up pure-core helper is ready, but threading the active file path through `ChipsManifest → loadChipsForActiveVault → loadLibraryChips` is moderate-effort coordinated change touching chips.ts + chips-view.ts. Shipping v3.2 synthetic chips at the library-`_chips.md` level fully unblocks forge-doc's tutorial. The per-chapter scoping (hide/unhide narrowing per chapter) is real but optional — `hide[]` at the library level can stage chips by chapter via vault structure. v3.1 wiring drains as a focused follow-up; the pure-core extraction is the largest part and is done.

**Schema-v3-aware forge-doc can ship now.** A library-level `forge-tutorial/_meta/_chips.md` with:

```yaml
---
type: data
schema_version: 3
---

# Body

```yaml
synthetic_chips:
  - label: "print"
    insertion: 'Do [[print]]("<message>").'
    group: "Builtins"
```

surfaces a `print` chip in every Forge-clickable snippet in `forge-tutorial`. B7.2 v0.2.59 wikilink suppression handles the `[[print]]` markup so users don't create stray `print.md` files.

**Eleventh clean release.sh run** through the v0.2.61 drift-preflight-early order. Build → release-zip → commit → tag → push → gh-release sequenced cleanly. No drift, no orphans.

## §3 — User-side smoke checklist

### Test A — schema-v3 file accepted at library level (3 min, paste-able)

Author a temporary v3 `_chips.md` in a non-production library subdir to verify the parse + integration path. Use a throwaway subdir within the smoke vault so forge-moda's curated state is untouched.

```
mkdir -p ~/forge-vaults/smoke-v0.2.13/test-v3-chips/_meta
cat > ~/forge-vaults/smoke-v0.2.13/test-v3-chips/forge.toml <<'EOF'
name = "test-v3-chips"
version = "0.0.1"
domains = []
EOF
cat > ~/forge-vaults/smoke-v0.2.13/test-v3-chips/_meta/_chips.md <<'EOF'
---
type: data
content_type: yaml
schema_version: 3
description: Test v3 schema with synthetic chips
---

# Body

```yaml
schema_version: 3

synthetic_chips:
  - label: "print"
    insertion: 'Do [[print]]("<message>").'
    group: "Builtins"
    order: 1
  - label: "Set"
    insertion: 'Set <var> to <value>.'
    group: "Statements"
    order: 1

groups:
  - id: Builtins
    order: 1
    label: "Built-in functions"
  - id: Statements
    order: 2
    label: "Statements"
```
EOF
```

Then in Obsidian:

1. Cmd+P → "Reload app without saving" (picks up v0.2.65).
2. Open any action snippet in `test-v3-chips/` (you'll need to create one — `cat > ~/forge-vaults/smoke-v0.2.13/test-v3-chips/scratch.md <<'EOF'` + a minimal `type: action` body).
3. Open the chip palette (right sidebar puzzle icon).
4. **Expected**: the palette shows two new chips — "print" under "Built-in functions" group, "Set" under "Statements" group. Both come from `synthetic_chips[]` — no backing `.md` files exist for them.

### Test B — Forge-click a synthetic chip → insertion lands verbatim (1 min)

1. In the scratch action snippet from Test A, click the "print" chip.
2. **Expected**: the editor inserts `Do [[print]]("<message>").` at the end of the `# English` section.
3. Cmd+P → toggle Live Preview if needed to see the `[[print]]` rendered as a wikilink.
4. **Click on `[[print]]`**.
5. **Expected** (B7.2 v0.2.59 behavior): Obsidian does NOT navigate to a `print.md` file. The click is suppressed because `print` is a recognized Python builtin per the v0.2.59 mechanism.

### Test C — hide[] applied to synthetic chip (1 min)

Edit `~/forge-vaults/smoke-v0.2.13/test-v3-chips/_meta/_chips.md` to add a `hide` block:

```yaml
hide:
  - "Set"
```

Save. Cmd+P → "Forge: Refresh chip palette".

**Expected**: the "Set" chip disappears; "print" remains.

### Test D — regression: schema_version: 2 unchanged (1 min)

Verify forge-moda's existing v2 `_chips.md` still works.

1. Open `~/forge-vaults/smoke-v0.2.13/forge-moda/create_water_particles.md` (or any forge-moda action snippet).
2. Open chip palette.
3. **Expected**: 16 forge-moda chips across Setup / Click / Go / Particle actions / Temperature groups, unchanged from v0.2.64. The v3 parse accepts the v2 file byte-identically.

### Cleanup

```
rm -rf ~/forge-vaults/smoke-v0.2.13/test-v3-chips/
```

### Failure modes to watch for

- **Test A shows nothing**: the v3 `_chips.md` failed to parse. Check Developer Tools console for `Forge chips: ... v3 parse error: ...`. Likely cause: YAML body shape (check the indentation in the synthetic_chips entries).
- **Test A shows synthetic chips but in unexpected groups**: the `group` field defaulted to "Synthetic" — meaning the per-entry `group: "Builtins"` wasn't recognized. Check the YAML decode — likely a tab/space issue.
- **Test B inserts `[[print]]` and clicking navigates to a `print.md` file**: v0.2.59 B7.2 didn't fire. This would mean v0.2.59's wikilink-click suppression is broken; unrelated to v3 but worth investigating.

## §4 — Deferred to follow-up drain

**v3.1 per-active-file walk-up wiring.** The pure-core helper (`walkUpChipsConfigs`) is ready and tested. Wiring drain:

1. Extend `ChipsManifest` with an optional `activeFilePath?: string`.
2. Update `loadChipsForActiveVault(app, manifest)` to:
   - When `activeFilePath` is provided, walk up via `chips-walk-up-core` for the library containing the active file.
   - Read + parse all matched `_chips.md` files in walk order.
   - Merge configs per the v3.1 spec precedence rules (higher-specificity wins for overrides/groups, hide union, synthetic chips dedup-by-label-most-specific).
   - Scope auto-discovery to the most-specific subdir that has a `_chips.md` (per spec).
3. Update `chips-view.ts:refresh()` to pass the current file's path through the manifest snapshot.
4. Test cases: active file in subdir A doesn't see synthetic chips from subdir B; switching active file re-computes palette.

Estimated 1-2 hours of work; no new pure-core extractions needed.

---

**Audit-trail close:** prompt moves to `prompts/done/`. Drain stops; queue empty.

**Standing followups (8 open, was 7):**
1. forge-music v2 `_chips.md` — their lane.
2. `forge-music.bak.0.3.0/` scanning gate.
3. Stage 3+ E-- migration roadmap.
4. `[[percussion_lab]]` directory-wikilink decision.
5. percussion_lab 7-parts-always cleanup.
6. (cc) glue-to-pure-core audit + `KNOWN_BUNDLED_LIBRARIES` shared-constants extraction.
7. Cross-library extraction in source vaults (v0.2.64 gate is strict same-library only).
8. **v3.1 per-active-file walk-up wiring** — pure-core ready, glue-layer follow-up needed.
