---
timestamp: 2026-05-24T23:40:43Z
session_id: unknown
prompt_modified: n/a — freestanding smoke-completion record (no paired prompt)
status: success
---

# V1 closed beta — clean-vault smoke passed, shippable

## TL;DR

End-to-end V1 acceptance test against a clean Obsidian vault
(`~/test-vaults/v1-smoke/`) passed on **v0.2.2**. Pyodide boots
from bundled assets, engine inits, moda simulator paints, **Run
simulation** redraws the canvas with three ink dispersions. No
terminal commands required by the student. No `localhost:8000`
fetches for the moda path. Sendable to Tamar's seminar.

The path from "release-zip script lands" to "clean-vault smoke
passes" required two patch fixes surfaced by live Obsidian smoke
that the prior development against bluh hadn't exposed.

## V1 release artifacts

| Release | What it shipped | What broke under clean-vault smoke |
|---|---|---|
| **v0.2.0** | First V1: Pyodide-hosted engine + release-zip build script + INSTALL.md | `SnippetResolutionError: Snippet 'setup' not found. Searched: authoring, forge (built-in).` — bundled forge-moda subdir was registered as a library but absent from the resolution order (which auto-detects from the user vault's forge.toml, which clean vaults don't have). |
| **v0.2.1** | Merge bundled libraries into resolution order regardless of user forge.toml. | New search order included forge-moda but library was STILL empty: `Searched: authoring, forge-moda, forge (built-in)` — same `Snippet 'setup' not found` error because library snippets weren't being registered. Diagnostic prints revealed: `forge.core.manifest` module missing from bundled engine → `_scan_library_vault` threw on the `read_manifest` import → caught silently → library skipped. |
| **v0.2.2** | Minimal `forge.core.manifest` shim in `assets/engine/forge/core/manifest.py` (read-only, stdlib-only — no `tomli_w`/`packaging`/`forge.installer` deps). | None. Clean smoke passes. |

## Commit chain (newest → oldest, V1 closed-beta range)

| SHA | Message |
|---|---|
| `53b6099` | V1 0.2.2: bundle minimal manifest.py shim for library vault scanning |
| `8d0c88c` | V1 fix: bundled-library resolution works without user forge.toml (0.2.1) |
| `5a0c472` | Bump version to 0.2.0 for V1 closed beta release |
| `454e73a` | V1 release zip: build script + INSTALL.md for Option B distribution |
| `9252017` | Commit Pyodide binaries for BRAT distribution |
| `4b32625` | V1: mount user vault into Pyodide MEMFS; A4 shadow resolution restored |

Plus three GitHub Releases:
- [`v0.2.0`](https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.0) — historical, broken under clean-vault smoke
- [`v0.2.1`](https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.1) — historical, still broken
- [`v0.2.2`](https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.2) — **shippable**

## Clean-vault smoke transcript (v0.2.2 final)

Console log on Step 3g (open moda simulator) — after the v0.2.2 release-zip was downloaded from GitHub, unzipped into `~/test-vaults/v1-smoke/.obsidian/plugins/`, enabled, Obsidian reloaded:

```
Forge: runFirstRunCheck starting
Forge: sentinel exists? true
Forge: Server heartbeat detected      ← noise from user's dev uvicorn; not required for V1
Forge: initializing Pyodide…
Forge: Pyodide loaded in 1033ms
Loading micropip, numpy, pyyaml
Loaded micropip, numpy, pyyaml
Forge: stock packages loaded in 1475ms
Forge: user vault mounted (0 files; edits require iframe reload).
Forge: bundle mounted in 1529ms
Forge: engine ready in 3546ms
moda sessionId: 2f097d33f1d14aa3b5d83b365fd340a5 particles: 500
```

User confirmation: **"5 pass"** — Step 3h (click Run simulation) produced the expected canvas redraw with three ink dispersions + Forge Output entry.

## Smoke verification split

**Auto-verified by CC:**
- `npm run build` exited 0; main.js produced (~13 MB).
- `npm test` → 42/42 plugin tests pass.
- `npm run release-zip` produced `dist/forge-client-obsidian-v0.2.2.zip`, 11.20 MB.
- Zip preflight verified all 7 required files present.
- Zip contents include `forge-client-obsidian/main.js` + `forge-client-obsidian/assets/{engine,iframe,pyodide,vaults}/` (68 entries total under a single top-level directory).
- `gh release create v0.2.2 …` succeeded; release downloadable via `curl -L`; SHA-256 of downloaded asset matches local build exactly (`11c19541cc304d4b20cd008e9f092fd5deb88ceaa2b27f05fd3301fb5081c88e`).
- v1-smoke vault setup via terminal: directory created, zip downloaded, unzipped, manifest.json shows `version: 0.2.2`.
- All 4 expected subdirs present under `assets/` in the installed plugin.

**Deferred to user (Obsidian-context):**
- Open vault in Obsidian (vault picker GUI).
- Enable plugin in Settings → Community plugins (toggle GUI).
- Reload Obsidian (Cmd-P GUI action).
- Open dev tools + Console tab (GUI).
- Open moda simulator via command palette (GUI).
- Visual check: canvas paints 500 particles + Run simulation button visible.
- Click Run simulation; observe canvas redraw with three ink dispersions.

User executed every deferred step and confirmed "5 pass" — all GUI-side checks succeeded.

## What to send Tamar's seminar

- **Release page:** https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.2
- **Install guide:** https://github.com/frmoded/forge-client-obsidian/blob/main/INSTALL.md
- **3 steps:** download zip → unzip into `<vault>/.obsidian/plugins/` → enable in Settings.

No terminal. No git. No npm. No Python. No uvicorn.

## Smoke-driven discoveries (worth knowing for the next dev↔ship cycle)

The bluh-development smoke and the clean-vault-from-release smoke surface different failures because they exercise different paths:

1. **Bluh has a `forge.toml`.** Its `_auto_set_resolution_order` reads dependencies declared there. Library subdirs land in the order automatically. V1 work against bluh never hit the no-forge.toml case.
2. **Bluh's plugin install was symlink-syncs from `~/projects/forge-client-obsidian/`** (same inode via hardlinks for main.js). Engine bundle changes propagated instantly. The release-zip path involves an actual zip + unzip cycle that revealed the missing `manifest.py` (which a hardlink would've silently included).

Both bugs were silent during bluh-driven development AND silent under the spike's Node Pyodide tests (Node had access to the full forge package via the spike's pip install, masking the missing-module issue). They only surfaced when the engine ran with ONLY the bundled subset, against a vault without forge.toml.

**Lesson for future Phase 3 work:** always include a clean-vault smoke step in any V1+ change that touches bundle composition, before tagging a release. The bundle is the unit of distribution; bundle-completeness needs explicit verification.

## Followups (not blocking V1 ship)

1. **`forge.toml` ENOENT noise on plugin load** when the user vault has no forge.toml. Non-fatal (plugin falls through to "register all commands"), but the red error in Console is alarming. Cleanup: gate the read attempt on `app.vault.adapter.exists("forge.toml")`.

2. **Phase 3 — music21 + forge-music in plugin.** Per the music21 spike, +5.83 MB stripped wheel + ~0.4 MB closure → estimated v0.3.0 zip at ~17 MB. Touches `_BUNDLED_LIBRARIES_V1` in pyodide-host.ts AND the JS-side `BUNDLED_LIBRARY_NAMES`; both need `"forge-music"` added.

3. **Mid-session hot-reload.** Currently MEMFS user-vault is a session-start snapshot — students must reload the iframe after editing a snippet. A watch-and-remount path is the V1.1 polish.

4. **`/generate` HTTP teardown.** Once the transpile service ships, the plugin's last `localhost:8000` dependency (the `/generate` LLM call) can be cut.

5. **INSTALL.md release link.** Currently points at `/releases` (always latest); could pin to `v0.2.2` for the closed-beta cohort if you want explicit version control over what they install.

## One observation

The 5 V1-ship discoveries this session — Obsidian's CSP for `node:url`, getResourcePath cache-buster, wheel layout, serialize_result envelope, deferred-view safety (Phase 2) — and now the order-merge + manifest.py shim (V1 Phase 1 → 0.2.2 clean-vault smoke) — are all **interface mismatches between the spike environment and the real distribution environment**, not architectural failures. The spikes proved Pyodide works; what they couldn't prove is "Pyodide works **embedded** in Obsidian's plugin process, with **only the bundled subset** of the engine, served from **`app://` URLs**, against **vaults with no forge.toml**."

V1 closed beta would be a useful artifact to write up as a postmortem: "what spikes verify vs. what only ship verifies." The pattern across both phases (Phase 2's 5 bugs + this V1 distribution's 2 bugs) is the same: bridge-the-environment friction that's invisible until you actually cross the bridge.
