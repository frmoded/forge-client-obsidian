---
timestamp: 2026-05-24T23:08:17Z
session_id: unknown
prompt_modified: 2026-05-23T22:00Z
status: success
---

# V1 release zip — Option B build script + INSTALL.md shipped

## TL;DR

`scripts/build-release-zip.mjs` packages the entire plugin
(`main.js + manifest.json + styles.css + assets/`) into a versioned
zip at `dist/forge-client-obsidian-v<version>.zip`. **11.20 MB,
68 files, 0.8s build time.** INSTALL.md gives non-developers a
3-step download → unzip → enable path. `archiver` v8 added as dev
dep. Single commit pushed.

## 1. `build-release-zip.mjs` outline

Flow:

1. Read `manifest.json` for the version (never bumped here).
2. **Preflight** — verify each REQUIRED_FILES entry exists; fail
   fast with a per-file hint when something's missing
   (`Run npm run build first`, `Run cd ../forge-moda-client/
   forge-moda-web && npx vite build first`, etc.). Each ✓/✗
   prints to the console for visibility.
3. Ensure `dist/` exists; delete any prior zip for this version
   so the build is reproducible.
4. Use `ZipArchive` (archiver v8 class API) at zlib level 9.
   Top-level dir inside the zip is `forge-client-obsidian/` so
   unzipping into `.obsidian/plugins/` produces the correct
   layout automatically.
   - `archive.file()` for main.js, manifest.json, styles.css (the
     last is optional — only included if present).
   - `archive.directory(ROOT/assets, "forge-client-obsidian/assets")`
     for the full assets tree.
5. Read the produced zip; print path, size (MB, 2 decimals),
   SHA-256, and build time.
6. Print a "next step" pointer at GitHub Releases for the manual
   upload step.

## 2. `package.json` diff

```diff
   "scripts": {
     "build": "...",
     "dev": "npm run build -- --watch",
     "test": "node --test src/*.test.ts",
     "build-manifest": "node scripts/build-manifest.mjs",
-    "setup-assets": "node scripts/setup-assets.mjs"
+    "setup-assets": "node scripts/setup-assets.mjs",
+    "release-zip": "node scripts/build-release-zip.mjs"
   },
```

Plus `"archiver": "^8.0.0"` added to `devDependencies`. The
v8 line wasn't in the prompt's plan — v7 was assumed — but the
script accommodates v8's class-based API via `ZipArchive`.

## 3. `.gitignore` diff

```diff
 assets/manifest.json
+
+# Release zips for V1 distribution; produced by `npm run release-zip`.
+# Upload to GitHub Releases manually per V1 closed-beta workflow.
+dist/
```

Verified: `dist/forge-client-obsidian-v0.1.4.zip` was correctly
unstaged from git status during the commit.

## 4. INSTALL.md (summary)

Single-screen, plain-English install doc at the repo root. Four
sections:

- **Three-step install** — download the zip, find the vault
  plugin directory (Settings → About → Open vault folder →
  `.obsidian/plugins/`), unzip in, enable in Settings → Community
  plugins.
- **Verifying it works** — Cmd-P → Forge: Open MoDa simulation
  → click Run simulation, wait for Pyodide init, watch ink
  dispersions appear over the water population.
- **Troubleshooting** — covers the three most likely failure
  modes: plugin doesn't appear in settings (wrong unzip
  location), simulator panel blank (`assets/` missing), Pyodide
  hangs (paste dev console).
- **Updating** — same 3 steps; download + unzip overwrites the
  existing folder.

Brief "what this plugin does (V1 closed beta)" footer at the
bottom describes moda. No screenshots, no marketing — just a
working install path.

## 5. Build smoke output

```
=== forge-client-obsidian release zip ===

Plugin version: 0.1.4

Preflight:
  ✓ main.js
  ✓ manifest.json
  ✓ assets/iframe/index.html
  ✓ assets/pyodide/pyodide.asm.wasm
  ✓ assets/pyodide/python_stdlib.zip
  ✓ assets/engine/forge/core/executor.py
  ✓ assets/vaults/forge-moda/forge.toml

Building forge-client-obsidian-v0.1.4.zip…

=== Release zip ready ===
  path:    /Users/odedfuhrmann/projects/forge-client-obsidian/dist/forge-client-obsidian-v0.1.4.zip
  size:    11.20 MB
  SHA-256: d9c70752327132be72ecef00496f94e67e099882e6c657235b8d08698fe974c2
  build:   0.8s

Next step: upload forge-client-obsidian-v0.1.4.zip to a new GitHub Release at
  https://github.com/frmoded/forge-client-obsidian/releases/new
Then update INSTALL.md's download link if the URL pattern changed.
```

## 6. Zip contents (first 20 + structure check)

```
Archive:  dist/forge-client-obsidian-v0.1.4.zip
  Length      Date    Time    Name
 13304426  05-23-2026 20:27   forge-client-obsidian/main.js
      258  05-23-2026 06:39   forge-client-obsidian/manifest.json
    15515  05-23-2026 06:39   forge-client-obsidian/styles.css
        0  05-23-2026 05:28   forge-client-obsidian/assets/engine/
        0  05-23-2026 05:28   forge-client-obsidian/assets/engine/forge/
       38  05-23-2026 05:28   forge-client-obsidian/assets/engine/forge/__init__.py
     2558  05-23-2026 05:28   forge-client-obsidian/assets/engine/forge/core/dependencies.py
      619  05-23-2026 05:28   forge-client-obsidian/assets/engine/forge/core/exceptions.py
    19467  05-23-2026 05:28   forge-client-obsidian/assets/engine/forge/core/executor.py
     1342  05-23-2026 05:28   forge-client-obsidian/assets/engine/forge/core/graph_resolver.py
     ...
Total entries: 68 files
Top-level dir: forge-client-obsidian (single)  ✓
```

The single-top-level-dir check passes — no risk of double-nested
unzip producing
`.obsidian/plugins/forge-client-obsidian/forge-client-obsidian/main.js`.

## 7. Commit SHA

`forge-client-obsidian` → **`454e73a`** on `main`, pushed.

## 8. Deviations

**Two minor, both forced by archiver v8.**

1. **`archiver` v8 API change.** The prompt suggested
   `archiver("zip", opts)` per the v7 idiom; v8 is class-based:
   `import { ZipArchive } from "archiver"` then
   `new ZipArchive({zlib:{level:9}})`. Switched to v8's shape.
2. **CJS interop.** v8 is CJS-only with no ESM `default` export.
   Plain `import archiver from "archiver"` fails. Brought in via
   `createRequire(import.meta.url)`. Documented inline.

Both deviations are forced by the dep's current state — not a
judgment call. v7 would've matched the prompt verbatim; v8 has
better TypeScript types and active maintenance.

## 9. One observation

**The zip is 11.20 MB compressed vs 14.92 MB on disk.** zlib
level 9 isn't doing much for the already-compressed Pyodide
wheels (each is itself a zip) and python_stdlib.zip — the
compression wins are mostly on main.js (13.3 MB uncompressed →
some fraction of that compressed) and the engine .py files
(plain text, highly compressible). 11.20 MB is comfortably
under the 25 MB GitHub Releases per-file limit for free accounts
— plenty of headroom for future bundle growth (Phase 3's
corpus-stripped music21 wheel + forge-music vault adds ~6 MB,
estimated landing zip at ~17 MB).

Build time is 0.8s; the rate-limiting step is reading the WASM
binary (8 MB) from disk and streaming it into the zip output.
Subsequent runs (e.g., re-packaging after a code change) hit
the OS file cache and would be slightly faster.

A small followup worth tracking: the build script's REQUIRED_FILES
list has 7 entries. If the bundled vault grows to include
forge-music in Phase 3, three more REQUIRED_FILES entries land
(forge-music's forge.toml + music21 wheel + music21 stripped
wheel verification). The preflight pattern scales fine, but the
list is a manual-update spot worth noting in any future Phase 3
prompt.

## Manual smoke (deferred to user)

After this lands, the full clean-machine verification cycle:

1. `cd ~/projects/forge-client-obsidian && npm run release-zip` —
   confirms the zip builds locally. Check `dist/forge-client-obsidian-v0.1.4.zip` exists, ~11.20 MB.
2. Upload that zip manually to a new GitHub Release at
   `https://github.com/frmoded/forge-client-obsidian/releases/new`.
   Tag `v0.1.4`, attach the zip, publish.
3. **Clean-vault smoke (the real test):** on a fresh Obsidian
   vault (or a different laptop), follow INSTALL.md verbatim —
   download the zip from the GitHub release, unzip into
   `.obsidian/plugins/`, enable in Community plugins, reload,
   open moda simulator, click Run simulation. If you see the
   three ink dispersions: V1 closed beta is shippable.

If step 3 fails, paste the failing step's symptom + dev console
output. The plugin's own code is the same that worked in bluh; if
the clean-vault smoke fails, it's almost certainly a packaging
issue (wrong file omitted, wrong directory structure) catchable
by `unzip -l` inspection.
