---
timestamp: 2026-06-06T10:00:00Z
session_id: claude-code-drain-path-a-chips
prompt_modified: 2026-06-06T10:00:00Z
status: success
---

# Feedback — 2026-06-06-1000 Path A chip discovery: source-vault detection (v0.2.62)

## §0 — Release coordinates

**Manifest:** 0.2.61 → 0.2.62.

**Commits:**
- forge-client-obsidian `312d994` — work commit.
- forge-client-obsidian (release commit by SKIP_BUMP path) — tag points here.

**Tag:** `v0.2.62` pushed.
**GH release:** <https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.62>
**Zip SHA-256:** `7ffd4ce654f0947648cdc6ca3064aa10a9889f0977f4d985c17a4914a45f5475`
**install-latest.sh** into smoke vault: clean.

**Line counts:**

| File | Lines | Note |
|---|---|---|
| `src/source-vault-core.ts` | 73 | NEW. Pure-core extraction #23. |
| `src/source-vault-core.test.ts` | 113 | NEW. 13 TDD cases. |
| `src/chips.ts` | +76 | `detectSourceVault` + `loadSourceVaultChips` + `KNOWN_BUNDLED_LIBRARIES` + dedupe gate. |
| `manifest.json` | 10 | version bump. |
| `INSTALL.md` | (5 pin replacements) | v0.2.61 → v0.2.62. |

## §1.1 — TDD test cases (13 new)

`source-vault-core.test.ts`:
1. null body → null.
2. empty body → null.
3. forge-music forge.toml → "forge-music".
4. forge-moda forge.toml → "forge-moda".
5. user vault with custom `name = "my-cohort-vault"` → null.
6. forge.toml without `name` field → null.
7. KNOWN list controls recognition (empty + unrelated set → null).
8. Idempotent.
9. Single-quoted name accepted.
10. Trailing comment after value tolerated.
11. Commented-out name line ignored, active name wins.
12. Malformed `name =` line → null (no false positive).
13. Whitespace around `=` tolerated.

## §1.2 — Phase 1 investigation findings

### Filter logic that excludes vault-root subdirs

`src/chips.ts:294-298` (`buildSnippetInventory`):

```typescript
const prefix = `${libDir}/`;
for (const file of app.vault.getMarkdownFiles()) {
  if (!file.path.startsWith(prefix)) continue;
  ...
}
```

For Path A on forge-music (`~/projects/forge-music/`), `libDir` would need to be `"percussion"` (or similar) for `percussion/murmuration.md` to pass the prefix filter. But `libDir` comes from `manifest.libraryDirNames`, which comes from `main.ts:libraryDirNames()` (lines 1164-1175):

```typescript
private libraryDirNames(): Set<string> {
  const out = new Set<string>();
  const root = this.app.vault.getRoot();
  for (const child of root.children) {
    if (!(child instanceof TFolder)) continue;
    if (child.name.startsWith('.')) continue;
    if (this.app.vault.getAbstractFileByPath(`${child.name}/forge.toml`)) {
      out.add(child.name);
    }
  }
  return out;
}
```

This enumerates only top-level folders that **contain** their own `forge.toml`. The vault root itself is never in the set. For Path A (`forge-music/` as vault):

- vault root has `forge.toml` ✓
- subdirs: `percussion/`, `percussion_lab/`, `blues/` — none have their own `forge.toml` ✗
- `libraryDirNames()` returns the EMPTY set (modulo any accidentally-nested library extractions like `forge-moda/` from auto-extract, which DO have their own forge.toml inside).

So `loadLibraryChips` runs for the nested `forge-moda/` (16 curated chips per its v2 `_chips.md`) and any other nested library. `loadPersonalChips` runs for vault-root top-level `.md` files (welcome.md, greet.md, etc.). The vault-root subdirs `percussion/`, `percussion_lab/`, `blues/` get silently dropped from discovery.

### The 4 visible chips in the brief's reproduction

Per the architecture, the 4 chips most likely came from:

- v0.2.54 Personal group: `welcome.md` + `greet.md` extracted to vault root → 2 chips (assuming no other top-level .md files).
- v0.2.54 Personal group also picks up `Welcome.md` (legacy v0.2.13-era file) if extracted.
- Some chips from accidentally-nested `forge-moda/` if extraction had occurred — but the brief says "4 chips" so the nested extraction probably wasn't yet present in the user's repro, or the user counted just the surfaced top-level items.

Either way, the diagnosis is unambiguous: `percussion/`, `percussion_lab/`, `blues/` subdirs are not enumerated as library subdirs because they lack their own `forge.toml`, so their contents are filtered out by `buildSnippetInventory`'s prefix check. The chips for `solitary`, `companions`, `gathering`, `swarming`, `peak`, `dispersing`, `threading`, `resting` (8 percussion_lab snippets) + `murmuration`, `loom`, `phase_cell`, `phase_shifter`, `drums_shuffle` (5 percussion snippets) + blues content all silently fall off the discovery path.

### Forge-music + forge-moda forge.toml shape (confirms the detection mechanism)

```
~/projects/forge-music/forge.toml:
  name = "forge-music"
  version = "0.3.9"
  domains = ["music"]

~/projects/forge-moda/forge.toml:
  name = "forge-moda"
  version = "0.4.17"
  domains = ["moda"]
```

Both have `name = "<library>"` matching the bundled-library identity. Detection mechanism is the `name` field; the comparison set is `{forge-moda, forge-music}` (the same set welcome.ts knows how to extract).

### Decision: Option A

Per the prompt's §Phase1.4 recommendation. Cleanest semantic alignment: the source vault IS the library; vault-root subdirs ARE the library's content. Walk them under the matched library identity, skip already-discovered library subdirs (the accidental nests caught by `libraryDirNames`), skip dot-prefixed dirs (`.obsidian/`, `.forge/`).

## §1.3 — Phase 2 fix (cited diffs)

### `src/source-vault-core.ts` (NEW)

73 lines including docstrings. `isSourceVault(rootTomlBody: string | null, knownLibraries: Set<string>): string | null` parses the toml body line-by-line, finds `name = "..."`, returns the value when it's in `knownLibraries`. Tolerant of single/double quotes, whitespace, trailing comments, commented-out lines. Malformed `name =` lines bail with null (no false positives).

### `src/chips.ts`

Import + constant:

```typescript
import { isSourceVault } from './source-vault-core';

const KNOWN_BUNDLED_LIBRARIES = new Set(['forge-moda', 'forge-music']);
```

`loadChipsForActiveVault` gets a new step after the per-library loop:

```typescript
const sourceVaultName = await detectSourceVault(app);
if (sourceVaultName !== null) {
  const sourceGroups = await loadSourceVaultChips(
    app, sourceVaultName, new Set(manifest.libraryDirNames));
  collected.push(...sourceGroups);
}
```

And the v0.2.54 Personal-group call is gated to skip in source-vault mode (avoids double-counting vault-root files):

```typescript
if (sourceVaultName === null) {
  const personalGroups = await loadPersonalChips(
    app, new Set(manifest.libraryDirNames));
  collected.push(...personalGroups);
}
```

Two new private helpers:

- `detectSourceVault(app)` — reads `forge.toml` via `app.vault.adapter` (silent null on missing/unreadable), calls `isSourceVault`.
- `loadSourceVaultChips(app, libraryName, excludeTopDirs)` — walks every markdown file in the vault, skips dot-prefixed top dirs + any top dir in `excludeTopDirs` (already covered by `loadLibraryChips`), then proceeds with the standard frontmatter read → SnippetMetaForChips → autoDeriveChips → mergeChipsWithOverrides shape.

## §1.4 — Post-fix verbatim test output + smoke

**`npm test` excerpt** (all 13 new + 355 baseline pass):

```
✔ isSourceVault: null body → null (no forge.toml present)
✔ isSourceVault: empty body → null
✔ isSourceVault: forge-music forge.toml → "forge-music"
✔ isSourceVault: forge-moda forge.toml → "forge-moda"
✔ isSourceVault: user vault with `name = "my-cohort-vault"` → null
✔ isSourceVault: forge.toml without name field → null
✔ isSourceVault: KNOWN list controls recognition (unrecognized name → null)
✔ isSourceVault: idempotent (same input → same result)
✔ isSourceVault: single-quoted name accepted (TOML tolerant)
✔ isSourceVault: trailing comment after value tolerated
✔ isSourceVault: commented-out name line ignored, active name wins
✔ isSourceVault: malformed `name = ` line → null (no false positive)
✔ isSourceVault: whitespace around = tolerated
ℹ tests 368
ℹ pass 368
ℹ fail 0
```

## §1.5 — Full `npm test`

```
ℹ tests 368
ℹ pass 368
ℹ fail 0
```

## §2 — Surprises during implementation

**Personal-group dedupe was a clean small gate.** In source-vault mode the v0.2.54 Personal group would re-discover the same vault-root files that the source-vault walk surfaces. Easiest fix: just skip Personal when `sourceVaultName !== null`. The vault-root files become chips under the library's parentDir (or under "(library)" for direct vault-root files), which is the right grouping semantic anyway.

**The "library name" parameter to `loadSourceVaultChips` ended up unused.** The vault root files take their `parentDir` from their on-disk path; the library name doesn't appear in derived chips' IDs or groups. I left the parameter in place (and added a `void libraryName;` reference to silence linters) because brief (e)'s prompt explicitly says the same `isSourceVault` helper will be reused — keeping a consistent signature there makes the next drain's wiring straightforward.

**No nested-discovery concern.** Source-vault mode walks `app.vault.getMarkdownFiles()` and excludes any file whose top-level dir is in `excludeTopDirs` (the `libraryDirNames` set). So an accidentally-nested `forge-moda/` (which has its own forge.toml) is already handled by `loadLibraryChips` and doesn't double-count.

**Ninth clean release.sh run.** The drift-preflight-early reorder from v0.2.61 had zero impact on this drain (no drift to test against), but the run sequenced cleanly: bump → build (with drift preflight inside) → commit → tag → push → gh release.

**No constitution touch.** The behavior is an extension of existing chip-discovery semantics — adding a code path for the source-vault case while preserving all existing behavior for non-source vaults. The spec's auto-derivation rules apply unchanged.

## §3 — User-side smoke checklist

### Pre-conditions

- v0.2.62 plugin installed (verified via install-latest.sh during this drain).
- `~/projects/forge-music/forge.toml` at `name = "forge-music"`, version 0.3.9.
- `~/projects/forge-music/percussion_lab/` exists with 8 section snippets + README (per v0.3.9).

### Test A — verify Path A vault shape (30 sec, paste-able)

```
ls ~/projects/forge-music/percussion_lab/
```

Expected output:

```
README.md
companions.md
dispersing.md
gathering.md
peak.md
resting.md
solitary.md
swarming.md
threading.md
```

```
cat ~/projects/forge-music/forge.toml
```

Expected: includes `name = "forge-music"` and `domains = ["music"]`.

```
ls ~/projects/forge-music/percussion/
```

Expected output (forge-music v0.3.9 + cosmetic):

```
loom.md
murmuration.md
phase_cell.md
phase_shifter.md
```

Pass: 13 action snippets across 3 vault-root subdirs.

### Test B — open forge-music as vault, count chips (3 min)

**Important**: this opens the source repo as a vault. Pre-existing pollution from earlier sessions (welcome.md, nested forge-moda/, nested forge-music/, .obsidian/, .forge/) may be present. Those don't block this smoke; brief (e) will fix the pollution path.

1. In Obsidian, open vault: choose `~/projects/forge-music/` (vault picker → Open folder as vault).
2. Cmd+P → "Reload app without saving" (picks up v0.2.62).
3. Open the chip palette (sidebar puzzle icon, or Cmd+P → "Forge: Open chips palette").
4. **Expected**: the palette now shows all 13 action snippets across `percussion/`, `percussion_lab/`, `blues/` subdirs.

   In Developer Tools console (Cmd+Opt+I) you should see (per v0.2.62 chips.ts dispatch):

   - No explicit log line from `detectSourceVault` itself — it's a quiet helper. The visible signal is the chip count in the palette.
   - If you want a visible log, the existing chip-discovery logs from previous versions still fire if any errors occur.

5. Specifically scroll through the palette and verify these chips appear:
   - **percussion_lab group**: Solitary, Companions, Gathering, Swarming, Peak, Dispersing, Threading, Resting.
   - **percussion group**: Loom, Murmuration, Phase cell, Phase shifter.
   - **blues group**: whatever forge-music blues content has (per `ls ~/projects/forge-music/blues/`).

Pass: 8 + 4 + N chips visible, each in their proper group.

### Test C — regression check, normal user vault (1 min)

1. Open Obsidian on `~/forge-vaults/smoke-v0.2.13/` (or any non-source user vault).
2. Cmd+P → "Reload app without saving".
3. Open chip palette.
4. **Expected**: behavior unchanged from v0.2.61 — forge-moda's 16 curated chips + Personal group with any vault-root snippets (test_optout.md if still present).

In Terminal:

```
cat ~/forge-vaults/smoke-v0.2.13/forge.toml 2>&1 | head -3
```

Expected: either `name = "smoke-v0.2.13"` (user-vault style) or no `name` field at all. Confirms the smoke vault is NOT detected as a source vault.

Pass: forge-moda chips + Personal group present, no spurious additions.

### Test D — regression: forge-moda chips still curated (30 sec)

In the smoke vault palette from Test C, verify:

- Setup / Click / Go / Particle actions / Temperature groups still appear with the curated v2 `_chips.md` overrides (16 chips total in moda groups).
- B7.1-canonical insertions intact (will be revisited in brief (d) prompt for vault-root subdirs, but normal user vault behavior is unchanged here).

Pass: v0.2.54 chip schema v2 + v0.2.48 forge-moda migration behavior preserved.

### Failure modes to watch for

- **Test B shows only 2-4 chips**: source-vault detection failed. Check forge.toml contents:

  ```
  grep '^name' ~/projects/forge-music/forge.toml
  ```

  Expected: `name = "forge-music"` exactly. If absent or different value, `isSourceVault` returns null and Path A is treated as a normal user vault.

- **Test B shows duplicate chips** (same snippet in multiple groups): Personal-group dedupe gate failed. Check console logs for any chip-related errors.

- **Test C shows MORE chips than before**: source-vault detection fired on the smoke vault by mistake (smoke vault's forge.toml has `name = "forge-music"` somehow?). Verify `cat ~/forge-vaults/smoke-v0.2.13/forge.toml` and the matched name doesn't appear.

### End-state cleanup

- None required for this drain.
- Forge-music source vault pollution (welcome.md, nested forge-moda/, etc.) is **out of scope** here — brief (e)'s separate prompt addresses the auto-extract pollution. If you want a clean working tree in `~/projects/forge-music/` post-smoke, manually delete the extracted artifacts:

  ```
  cd ~/projects/forge-music && rm -rf forge-moda forge-music welcome.md greet.md
  ```

  (Leaves `.forge/` and `.obsidian/` — those are dot-prefixed and ignored by git anyway, and `.forge/` is useful for any in-source-vault snapshots you've made.)

---

**Audit-trail close:** prompt moves to `prompts/done/`. Drain continues if queue non-empty.
