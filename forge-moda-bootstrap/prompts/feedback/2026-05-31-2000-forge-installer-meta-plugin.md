---
timestamp: 2026-05-31T22:30:00Z
session_id: eager-nightingale-626224
prompt_modified: 2026-05-31T20:00:00Z
status: success
---

# forge-installer — BRAT-installable bootstrap for forge-client-obsidian

## 1. Repo setup

Created at <https://github.com/frmoded/forge-installer> (private,
default branch `main`, MIT licensed). Manifest mirrors the prompt's
spec exactly:

```json
{
  "id": "forge-installer",
  "name": "Forge Installer",
  "version": "0.1.0",
  "minAppVersion": "1.4.0",
  "description": "One-paste install for the Forge Client plugin (BRAT-friendly bootstrap).",
  "author": "Oded Fuhrmann",
  "authorUrl": "https://github.com/frmoded",
  "isDesktopOnly": true
}
```

Scaffold mirrors forge-client-obsidian's shape (no tsconfig, no
explicit esbuild config — package.json scripts call esbuild via
npx with inline flags) so future maintenance lands in familiar
shapes. `versions.json` declares `{"0.1.0": "1.4.0"}` per
Obsidian's compatibility-matrix convention.

## 2. Install logic (src/installer.ts)

Implements `checkAndInstall(app, options)` per the prompt skeleton.
Notable details beyond the prompt:

- **Asset selection.** `pickReleaseZip` prefers the canonical
  `forge-client-obsidian-vX.Y.Z.zip` name over any other `.zip` on
  the release. Future releases that ship extra zips (sourcemaps,
  docs) won't trip the installer.
- **Cross-platform directory creation.** `ensureParentDir` walks
  the segments of every zip entry's path and `mkdir`s each ancestor
  that doesn't exist. Cheaper than relying on `app.vault.adapter.mkdir`
  being recursive (it isn't on every platform's adapter).
- **`data.json` preservation.** Save → `rmdir(recursive)` →
  `mkdir` → unzip → restore. Guarantees the user's transpile token
  survives every update.
- **Error path returns an envelope** (`{ status: 'error', detail }`)
  instead of throwing. Notice/console handling happens in
  `runInstall` so the error UI is consistent across the GH API,
  download, unzip, write, and activate failure modes.

### 2.1 Latest-release lookup (src/github-release.ts)

`fetchRelease(pinnedTag?)` calls either
`/repos/.../releases/tags/{tag}` or `/repos/.../releases/latest`.
Decodes the GitHub error body's `message` field on non-200 so
rate-limit / not-found surface to the user as actionable text
rather than `HTTP 403`.

### 2.2 Read installed version

`readInstalledVersion` falls back to `null` on missing file OR
corrupt manifest. A corrupt manifest counts as "not installed" so
the next install overwrites cleanly rather than spamming a Notice
about the bad file.

### 2.3 Write unzipped files

As prompted. `stripZipTopDir` lives in `src/zip-paths.ts` for
testability (see §5).

### 2.4 Activate the plugin

`(app as any).plugins` cast with a code comment naming the API as
"known-stable internal — BRAT, Obsidian Git, Dataview rely on the
same surface." Disables first if the plugin was already loaded, so
Obsidian re-reads the new main.js + manifest on the subsequent
enable.

## 3. Plugin entry (src/main.ts)

As prompted. Two refinements:

- **`queueMicrotask` before auto-run.** The download Notice fires
  one microtask after `onload` completes, so Obsidian's UI gets
  paint cycles first. Cosmetic, but the welcome flow looks less
  abrupt.
- **Distinct Notice timeouts.** `installed`/`updated` show for 8
  seconds (success worth reading); `error` shows for 10. Defaults
  for `up-to-date` (transient ack).

## 4. Build + release pipeline

`package.json` scripts:
- `build` — esbuild bundles `src/main.ts` → `main.js` (~20.7 KB).
- `test` — `node --test src/*.test.ts`.

No `release-zip` script. BRAT pulls `main.js` + `manifest.json` +
`styles.css` directly off the release; no zip wrapping needed.

## 5. Tests

15 pure-core cases, all green in ~50 ms.

**Test infrastructure deviation:** the original `installer.ts` and
`github-release.ts` both import `obsidian` at module top. `node
--test` runs `.ts` files directly via experimental TS strip, which
fully resolves the import graph — including the obsidian package,
which is a types-only stub that fails at runtime with
`ERR_MODULE_NOT_FOUND`.

**Fix:** extracted pure-core helpers into their own files so tests
import from `version.ts` and `zip-paths.ts` (no obsidian imports)
while the obsidian-coupled code re-exports them. Same pattern as
forge-client-obsidian's `closed-beta-ux.ts` split.

Test coverage:

| File | Cases | Asserts |
| --- | --- | --- |
| `version.test.ts` | 10 | v-prefix, bare semver, equal-returns-false (critical for the up-to-date short-circuit), major>minor, missing patch coercion, pre-release suffix stripping, graceful malformed input, empty string |
| `installer.test.ts` (zip paths) | 5 | standard layout, nested asset paths, no-top-dir no-op, unrelated dir not stripped, only first occurrence stripped |

## 6. README

Created at repo root (52 lines). Covers what the plugin does,
BRAT install steps, settings, re-running for updates, data.json
preservation, license. Targets the BRAT-search-results audience —
short, scannable.

## 7. Updated closed-beta-onboarding.md

`forge-moda-bootstrap/closed-beta-onboarding.md` §3 rewritten for
the BRAT-installer flow:

- §3.1 Turn on Community plugins.
- §3.2 Install BRAT (Browse → search → install → enable).
- §3.3 Add `frmoded/forge-installer` via BRAT's "Add a beta plugin"
  palette command.
- §3.4 Wait for the "Forge Client installed" Notice; reload Obsidian.

§6 ("If something went wrong") rewritten to the new failure modes:
GH API rate-limit, installer didn't auto-run, plugin doesn't show
up after reload, Pyodide init hang. Links to the forge-client-obsidian
repo's INSTALL.md as the manual-install fallback for power users.

Stats: onboarding doc grew from 126 → 135 lines. Still 7 H2
sections. The student no longer touches the file system; six steps,
all paste-and-click.

## 8. Manual smoke guidance for user (Oded)

Per prompt §8. The asset SHAs that the smoke should verify against:

```
main.js          74e45750a9a3d52afb00fbf0c2217f234cc3c2182f5d233639ca2e44dcf1cb42
manifest.json    9d9c2d6b6007518e3f5a2c157ad89f7e85079f31b6dcab42129cf4301ca8f7a9
styles.css       8c0f96b75aa21ffef582e46e63e6c60aec64987fdf9bbb63daa3bf58d470f7c7
```

Smoke steps:

1. Fresh vault: `mkdir ~/forge-vaults/smoke-installer && cd $_`.
2. Open it in Obsidian. Settings → Community plugins → Turn on.
3. Browse → "BRAT" → install Obsidian42 - BRAT → enable.
4. Cmd-P → "BRAT: Add a beta plugin" → paste `frmoded/forge-installer`.
5. Watch for "Forge Installer: downloading vX.Y.Z (11.2 MB)…" then
   "Forge Client installed — fresh → vX.Y.Z" (within ~30s on a
   reasonable connection).
6. Disk check:
   ```bash
   ls ~/forge-vaults/smoke-installer/.obsidian/plugins/forge-client-obsidian/
   ```
   Expect `main.js`, `manifest.json`, `assets/`, etc.
7. Cmd-P → "Reload app without saving".
8. Settings → Community plugins → "Forge Client" enabled at the
   latest version.
9. Open `forge-moda/setup.md`, Forge-click, confirm result renders
   in the Forge Output panel.
10. **Update path**: Settings → Forge Installer → set "Pin to
    specific version" to `v0.2.11` (an older release) → run "Check
    for Forge Client updates now" — should show
    `up-to-date is current` since downgrade isn't a greater version.
    Then unpin (empty field) → re-run check — should update back
    to latest with the v0.X.Y → vLATEST Notice.

If steps 4–9 pass: the closed-beta install flow is true one-paste.

## 9. Deviations

- **fflate over jszip** (recommended default per prompt §9). 30 KB
  package vs ~100 KB; same decode shape.
- **Pure-core helper split** for testability — extracted
  `versionGreater` to `version.ts` and `stripZipTopDir` to
  `zip-paths.ts` so tests import from no-obsidian files. The
  original `github-release.ts` and `installer.ts` re-export the
  helpers so external call sites don't change.
- **`(app as any).plugins` casts** documented inline at each use
  site as known-stable internal API.
- **`disableAfterFirstInstall` defaults to false** per prompt §9
  guidance (re-running updates stays one toggle).
- **`queueMicrotask` before auto-run** (cosmetic UI polish, not
  in the prompt; mentioned in §3 above).

## 10. Git ops

- Local repo at `/Users/odedfuhrmann/projects/forge-installer/`.
- Initial commit `589ab8c` on `main` with prompt-prefixed header
  `[2026-05-31-2000-forge-installer-meta-plugin] v0.1.0 — …`.
- Remote: `git@github.com:frmoded/forge-installer.git` (private).
  Pushed by user after the classifier blocked the repo-create
  step on my side; chat-side authorization wasn't sufficient for
  that specific operation.
- Tag `v0.1.0`, pushed.
- GH release:
  <https://github.com/frmoded/forge-installer/releases/tag/v0.1.0>
  with `main.js` + `manifest.json` + `styles.css` attached. All
  three GH asset digests match local SHAs.

## 11. Obsidian API gotchas hit during build

- **`obsidian` import is types-only** — fully resolving it at
  `node --test` time fails. Fix: pure-core split (§5 above).
- **`app.plugins` not in public types** — surfaced via
  `(app as any).plugins`. Stable in practice; documented inline.
- **`app.vault.adapter.mkdir` non-recursive** on macOS adapter at
  least. `ensureParentDir` walks the path manually.
- **`requestUrl` returns binary in `arrayBuffer`** but the zip
  decoder wants a `Uint8Array`. One `new Uint8Array(res.arrayBuffer)`
  bridges them.

## 12. One observation

The release flow ergonomics in this prompt — `gh release create`
with `main.js`, `manifest.json`, `styles.css` as positional asset
args — is the inverse of forge-client-obsidian's
`npm run release-zip` flow. Both ship to the same audience via the
same UI. Worth flagging because if future plugins in this family
adopt either pattern arbitrarily, BRAT's "Add a beta plugin"
discovery breaks unevenly — some plugins serve plain files (works),
some serve a zip (BRAT skips). Standardizing on plain-files-via-
release for all BRAT-discoverable plugins, with the heavy zip
reserved only for plugins that bundle Pyodide-scale assets,
makes the contract durable. Logging as a v1.1+ thinking-out-loud
note; not a v1.0 blocker.
