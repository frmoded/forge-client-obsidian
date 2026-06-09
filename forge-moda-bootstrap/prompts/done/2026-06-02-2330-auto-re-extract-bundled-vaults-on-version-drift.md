# Auto re-extract bundled vaults when the bundled version differs from the extracted version

## Scope

Eliminate the recurring "delete `~/<vault>/forge-music/` + Cmd-Q + reopen" smoke step that has bitten every bundled-vault release since v0.2.15 (10+ drains and counting). On plugin load, when the bundled vault's `forge.toml` version differs from the version on disk in the extracted target dir, automatically back up the extracted dir to `forge-music.bak.{old-version}/` and re-extract from the bundle. Apply the same logic to `forge-moda` for parity.

Bundled vaults are canonical-authored content for V1 closed-beta — students consume them, don't edit them. The backup is cheap insurance against the corner case of a user who copied a bundled snippet to tweak in-place.

What this prompt does NOT do:
- Watch `forge.toml` at runtime — only fires at plugin load. A vault-edit watcher is over-scope.
- Implement an overlay / merge layer for user edits to bundled snippets — that's v1.1 territory.
- Touch the `ensureForgeTomlStub` welcome-flow code path — purely the bundled-extraction gate.
- Add UI surface for "manage bundled vault versions" — silent under the hood.

## Why

The recurring user pain is concrete: every drain that bundles updated vault content (which is most drains in the music week) requires the user to manually `rm -rf ~/<vault>/forge-music/` + Cmd-Q + reopen Obsidian. The current `ensureBundledForgeMusic` (and `-Moda`) helpers check `adapter.exists(targetDir)` and bail if the directory exists — they ignore version drift entirely. About 30-60 seconds of dead time per release; bitten 10+ times in the v0.2.x arc.

This is the #32 item from the v0.2.15-era TaskList, the oldest pending follow-up across multiple forge-music drains. Forge-music has flagged it in §Follow-ups four drains in a row.

## Files to modify

- **`src/welcome.ts`** — the load-bearing changes live in `ensureBundledForgeModa` (line 131-153) and `ensureBundledForgeMusic` (line 160-191). Replace the `adapter.exists(targetDir)` skip with a version-comparison branch.
- **Extract a pure-core helper** `src/bundled-vault-version-core.ts` — per the eleventh pure-core extraction in the v0.2.x arc. Helper: `compareBundledVaultVersion({ bundled, extracted }) → 'match' | 'drift' | 'no-extracted' | 'no-bundled'`. Tests live in `src/bundled-vault-version-core.test.ts`.
- **`src/welcome.ts`** new helper `async function reExtractBundledVault(adapter, sourceDir, targetDir, oldVersion)`: rename target to `{targetDir}.bak.{oldVersion}` (atomic on POSIX, best-effort otherwise — log warn on collision), then copyDirRecursive from source. If a backup with the same name already exists, append a numeric suffix (`forge-music.bak.0.3.5.2` if `.bak.0.3.5` already exists) so multiple drift events don't clobber each other.
- **Bump `manifest.json`** version from `{CURRENT} → {NEXT_PATCH}` per the late-binding placeholder convention. INSTALL.md version pin gets the same update.

## Implementation notes

### Pure-core helper shape

```typescript
// src/bundled-vault-version-core.ts

/** Parse the `version = "..."` line out of a forge.toml body.
 *  Returns null if absent or malformed. Tolerant of whitespace,
 *  quoted-or-bare values (single or double quotes).
 *  Multi-line / array values not supported (forge.toml versions are
 *  always single-line semver). */
export function parseForgeTomlVersion(tomlBody: string): string | null { ... }

export type BundledVaultVersionStatus =
  | { kind: 'match'; version: string }
  | { kind: 'drift'; bundled: string; extracted: string }
  | { kind: 'no-extracted' }      // first install — just extract
  | { kind: 'no-bundled' }        // bundled forge.toml missing/unreadable — bail
  | { kind: 'unparseable'; reason: string };  // either side malformed — log + skip

/** Pure-core decision: given the bundled and extracted forge.toml
 *  bodies (or null if a side is absent), what should the extractor
 *  do? */
export function compareBundledVaultVersion(
  bundledTomlBody: string | null,
  extractedTomlBody: string | null,
): BundledVaultVersionStatus { ... }
```

Tests in `src/bundled-vault-version-core.test.ts`: ~8 cases — match (same version both sides), drift (different versions), no-extracted (null extracted), no-bundled (null bundled), unparseable bundled, unparseable extracted, comment-line `# version = ...` correctly skipped, multi-line array `domains` doesn't confuse the parser.

### Wiring into welcome.ts

Replace the bail at `welcome.ts:177` with:

```typescript
const bundledTomlPath = `${sourceDir}/forge.toml`;
const extractedTomlPath = `${targetDir}/forge.toml`;
const bundledBody = await adapter.exists(bundledTomlPath)
  ? await adapter.read(bundledTomlPath)
  : null;
const extractedBody = await adapter.exists(targetDir) && await adapter.exists(extractedTomlPath)
  ? await adapter.read(extractedTomlPath)
  : null;

const status = compareBundledVaultVersion(bundledBody, extractedBody);

if (status.kind === 'match') {
  console.log(`Forge: ${targetDir} already at version ${status.version}; skipping`);
  return;
}
if (status.kind === 'no-bundled') {
  console.warn(`Forge: bundled ${targetDir} forge.toml missing; skipping`);
  return;
}
if (status.kind === 'unparseable') {
  console.warn(`Forge: cannot compare ${targetDir} versions (${status.reason}); skipping to avoid data loss`);
  return;
}
if (status.kind === 'drift') {
  console.log(`Forge: ${targetDir} drift detected (extracted ${status.extracted} → bundled ${status.bundled}); backing up + re-extracting`);
  await renameWithBackup(adapter, targetDir, status.extracted);
}
// status.kind === 'no-extracted' falls through to the copy below.

await copyDirRecursive(adapter, sourceDir, targetDir);
console.log(`Forge: extracted ${targetDir} into vault`);
```

Apply the same shape to `ensureBundledForgeModa` (line 131). The forge-moda path bumps less often than forge-music, but version drift is the same shape; share the logic.

### renameWithBackup

```typescript
async function renameWithBackup(adapter, targetDir, oldVersion): Promise<void> {
  let backupName = `${targetDir}.bak.${oldVersion}`;
  let counter = 0;
  while (await adapter.exists(backupName)) {
    counter += 1;
    backupName = `${targetDir}.bak.${oldVersion}.${counter}`;
  }
  // Obsidian's adapter doesn't have a recursive rename, but it has rename()
  // for individual files. For directories, the path-based rename works on
  // mobile-but-not-desktop... safest is .rename() on the dir itself, fall
  // back to copy-then-delete if rename throws.
  try {
    await adapter.rename(targetDir, backupName);
  } catch (e) {
    console.warn(`Forge: rename ${targetDir} → ${backupName} failed; using copy fallback`, e);
    await copyDirRecursive(adapter, targetDir, backupName);
    await adapter.rmdir(targetDir, true);  // recursive delete
  }
}
```

If `adapter.rmdir` doesn't accept the recursive flag in current Obsidian API, fall back to a recursive-file-delete loop. Investigate as needed.

## Tests

### Auto-verifiable by CC

- **`npm test`** in `forge-client-obsidian` — expect `X/X` with ~8 new cases in `bundled-vault-version-core.test.ts`. Report pass count as `X/X in Y ms`.
- **Engine bundle drift preflight** at release-zip time should still be clean.
- **Clean-vault smoke** for the new path:
  1. Build release zip.
  2. Set up `~/test-vaults/auto-extract-smoke-1/.obsidian/plugins/forge-client-obsidian/`, unzip the release into it.
  3. Drop a vault `forge.toml` declaring `domains = ["music"]`.
  4. Boot a headless Pyodide via the `_PYTHON_BLOCK_BEGIN/END` markers (or a CC-side simulation) and assert: extraction happens, `~/test-vaults/auto-extract-smoke-1/forge-music/forge.toml` matches bundled version.
  5. Tear down the test vault.
  6. Modify the bundled `forge.toml` to a different version (`assets/vaults/forge-music/forge.toml`); rebuild zip; re-unzip into a fresh sandbox vault that already has the OLD extracted forge-music.
  7. Boot again; assert: backup dir created (`forge-music.bak.<old>`), fresh forge-music re-extracted, new version present.

This is doable in a node test script — CC writes one (`scripts/smoke-bundled-vault-re-extract.mjs`) that uses Node's fs + the production helpers. Include this script's output in §1.4 of the feedback.

### Deferred to user (Obsidian-context)

1. `VAULT=~/forge-vaults/test1 bash ~/projects/forge-client-obsidian/scripts/install-latest.sh` → expect `Installed forge-client-obsidian v{NEXT_PATCH}`.
2. Boot Obsidian; confirm `~/forge-vaults/test1/forge-music/forge.toml` matches the bundled version (no manual `rm -rf` needed).
3. Modify bundled forge-music (simulate by editing `assets/vaults/forge-music/forge.toml` to bump version), rebuild plugin, reinstall.
4. Reopen Obsidian; confirm `~/forge-vaults/test1/forge-music/` was re-extracted with new content AND a `~/forge-vaults/test1/forge-music.bak.<old-version>/` backup exists.
5. (Optional negative case): manually add a personal file to `~/forge-vaults/test1/forge-music/my-test.md`, trigger a version drift, confirm `my-test.md` is preserved inside the backup dir (proves the backup-don't-clobber semantics).

## Out of scope

- Watching `forge.toml` at runtime to react to vault-side `domains` changes between plugin loads. Plugin reload is the trigger boundary; matches v0.2.15's stated convention (welcome.ts:898 comment).
- An overlay merge layer for "preserve user edits to bundled snippets without backup-rename." v1.1+ work.
- UI for "manage bundled vault versions / undo backup."
- Changing the gate logic (`vaultDeclaresMusic`) — that's correct as-is.

## Report when done

Standard §0-§2 feedback structure:
- §0: manifest.json before/after, commit SHAs, push, tag, GH release URL, SHA round-trip.
- §1.1: the pure-core extraction (`bundled-vault-version-core.ts` + test cases).
- §1.2: pre-fix verbatim test output (drift-detection test fails because the new helper doesn't exist yet — write the failing test first per TDD).
- §1.3: the fix itself (`welcome.ts` re-wire diffs + `renameWithBackup` helper).
- §1.4: post-fix verbatim test output + clean-vault smoke script output.
- §1.5: full `npm test` suite tail.
- §2: anything surprising; flag the `adapter.rmdir` / `adapter.rename` behavior discoveries explicitly.

## Don'ts

- **Don't silently overwrite the extracted dir without backup.** The backup-then-copy pattern is load-bearing for the "user copied a snippet to tweak" corner case. Even though V1 closed-beta is consumer-only, the cheap insurance matters.
- **Don't change `forge.toml` parsing for `domains` (`vaultDeclaresMusic`)** — that helper is separately tested and correct. Add a NEW helper for version parsing.
- **Don't bump versions concretely in this prompt** — use `{CURRENT} → {NEXT_PATCH}` per the late-binding placeholder convention. CC reads `manifest.json` at drain start and substitutes.
- **Don't tag a release if the new node smoke script fails** — that's a hard preflight gate. Failed smoke → ship the code, ship the test, don't ship the release. User does manual smoke first, then re-tags.
