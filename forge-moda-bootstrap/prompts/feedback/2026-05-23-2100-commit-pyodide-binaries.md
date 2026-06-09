---
timestamp: 2026-05-23T23:27:32Z
session_id: unknown
prompt_modified: 2026-05-23T21:00Z
status: success
---

# Pyodide binaries committed — BRAT distribution unblocked

## TL;DR

Single commit, `.gitignore` updated, 9 Pyodide binary files added,
pushed. BRAT install now yields a fully functional plugin with no
post-install terminal steps. ~14.6 MB added to repo; `.git`
directory grew from ~?? MB to **12 MB** total post-commit (most
of which is now the Pyodide binaries' packed objects).

## 1. `.gitignore` diff

**Before:**
```
# Pyodide binary assets — populated by `npm run setup-assets`. Kept
# out of git history (large + externally sourced). Release builds for
# BRAT bundle these into the distribution zip from the local working
# copy. Engine + vault content under assets/engine/ + assets/vaults/
# ARE committed — they're plugin-owned text content.
#
# Pyodide WASM/JS/stdlib + numpy/pyyaml/micropip wheels all live in
# assets/pyodide/ together (matches Pyodide's "full" distribution
# layout; loadPackage resolves wheel URLs relative to indexURL).
assets/pyodide/
# The combined manifest depends on which wheels are present after
# setup-assets runs; regenerated on every build.
assets/manifest.json
```

**After:**
```
# Pyodide binary assets (assets/pyodide/) ARE committed for BRAT
# distribution — Tamar's closed-beta audience can't run terminal
# commands post-install. `npm run setup-assets` is still useful for
# re-populating after Pyodide version upgrades. ~14.6 MB in repo.
#
# The combined asset manifest regenerates on every `npm run build`
# (paths depend on which wheels are present); stays gitignored.
assets/manifest.json
```

Note: the prior `assets/wheels/` exclusion was already removed in
commit `9eeeec9` (when wheels moved into `assets/pyodide/`).

## 2. `git status` before commit

```
M  .gitignore
A  assets/pyodide/micropip-0.11.1-py3-none-any.whl
A  assets/pyodide/numpy-2.2.5-cp313-cp313-pyemscripten_2025_0_wasm32.whl
A  assets/pyodide/package.json
A  assets/pyodide/pyodide-lock.json
A  assets/pyodide/pyodide.asm.js
A  assets/pyodide/pyodide.asm.wasm
A  assets/pyodide/pyodide.mjs
A  assets/pyodide/python_stdlib.zip
A  assets/pyodide/pyyaml-6.0.2-cp313-cp313-pyemscripten_2025_0_wasm32.whl
```

Exactly 10 paths staged: 1 modified config + 9 new binaries. Nothing else.

## 3. Commit SHA

`forge-client-obsidian` → **`9252017`** on `main`, pushed.

## 4. File list in commit

```
9252017 Commit Pyodide binaries for BRAT distribution
 10 files changed, 152 insertions(+), 11 deletions(-)
 create mode 100644 assets/pyodide/micropip-0.11.1-py3-none-any.whl
 create mode 100644 assets/pyodide/numpy-2.2.5-cp313-cp313-pyemscripten_2025_0_wasm32.whl
 create mode 100644 assets/pyodide/package.json
 create mode 100644 assets/pyodide/pyodide-lock.json
 create mode 100644 assets/pyodide/pyodide.asm.js
 create mode 100755 assets/pyodide/pyodide.asm.wasm
 create mode 100644 assets/pyodide/pyodide.mjs
 create mode 100644 assets/pyodide/python_stdlib.zip
 create mode 100644 assets/pyodide/pyyaml-6.0.2-cp313-cp313-pyemscripten_2025_0_wasm32.whl
```

Verification:
- `git ls-tree -r HEAD --name-only | grep -E "assets/(pyodide|wheels)/" | wc -l` → **9** ✓
- `du -sh .git` → **12 MB** ✓ (was ~3-4 MB pre-commit per typical plugin repo size)

## 5. Repo size impact

- **Working tree**: assets/pyodide/ is 14.63 MB (unchanged — files were already there, just newly tracked).
- **`.git` directory**: **12 MB** post-commit. Approximate delta from pre-commit (~3 MB) is ~9 MB — git's pack-compression on Pyodide's WASM and the JS bundle. The numpy wheel + python_stdlib.zip are already zip-compressed and don't shrink further; the WASM compresses a bit.
- **Single-clone size for a new BRAT user**: ~26 MB (working tree + .git history). Acceptable for closed beta. Future clones won't grow until the next Pyodide version upgrade (each upgrade adds ~14 MB to .git history because the entire wheel set changes).

## Deviations

**None.** Followed the prompt verbatim. The `assets/wheels/` cleanup mentioned in the prompt's "Before" gitignore was already done in a prior commit; only `assets/pyodide/` needed removing.

## Manual smoke (deferred to user)

The full BRAT-on-clean-machine verification:

1. Install BRAT in a fresh Obsidian vault.
2. Add the plugin via BRAT pointing at `frmoded/forge-client-obsidian`.
3. Enable plugin. Reload Obsidian.
4. **Without running `npm` or any terminal commands**, open the moda simulator.
5. Click "Run simulation". Confirm Pyodide loads (no `assets/pyodide/...
   net::ERR_FILE_NOT_FOUND` errors) and the simulation runs.

If the smoke passes, BRAT-distribution is unblocked for V1 closed
beta. If Pyodide fails to load, dev console will show which asset
is missing — paste the URL.

---

---
timestamp: 2026-05-24T22:43:24Z
status: smoke-finding
prompt: 2026-05-23-2100-commit-pyodide-binaries.md
---

# POST-COMMIT SMOKE: BRAT doesn't copy `assets/` — distribution path needs a decision

## TL;DR

The smoke for prompt 2100 surfaced a hard BRAT limitation that
invalidates the prompt's core premise. **BRAT only copies
`main.js`, `manifest.json`, and `styles.css` — it does NOT copy
arbitrary subdirectories like `assets/`.** Committing the
binaries to the repo (which 2100 accomplished) is necessary but
not sufficient for BRAT-install users to get a working plugin.

The user's test1-vault smoke confirmed: BRAT-installed plugin
directory had `main.js` + `manifest.json` but no `assets/` at all.
Pyodide-dependent paths fail, the moda simulator iframe is blank.
A direct `cp -R ~/projects/forge-client-obsidian/assets ...` into
the BRAT install directory unblocked the smoke for the moment.

**This finding is for the core planning layer to decide on the
real distribution path before V1 closed beta ships.** Manual
copy is not viable for Tamar's seminar audience.

## Discovery shape

User followed the manual smoke checklist:

1. `cp -R ~/projects/forge-client-obsidian/assets ...` → unblocked, simulator now works in test1.

The fail-fast diagnostic was step 1 (Check 1 from the prior
message): `ls .../assets/` returned "No such file or directory".
BRAT had cloned the plugin but only copied the standard plugin
contract files.

## Why BRAT works this way

BRAT (Beta Reviewer's Auto-update Tool, by TfTHacker) is designed
around Obsidian's plugin contract: `main.js` (entry), `manifest.json`
(metadata), `styles.css` (optional CSS). It fetches those three
files individually from a GitHub repo's branch HEAD (or a release's
attached assets). It does NOT git-clone, it does NOT walk
subdirectories, it does NOT extract zips.

This works fine for plugins whose entire surface is bundled into
`main.js` via esbuild. It does not work for plugins that need
sibling asset directories (Pyodide WASM, wheels, bundled vault
content) — which is most plugins that ship anything non-JS.

## Three distribution options

### Option A — GitHub Releases workflow

Per Obsidian's published plugin convention: create a GitHub release
tagged with the plugin version. Attach files individually as
release assets (not as a tarball — Obsidian's release-mode install
downloads named files):

```
forge-client-obsidian v0.2.0
├── main.js                    (bundled JS, ~13 MB)
├── manifest.json
├── styles.css                  (if exists)
└── assets-<bundle>.zip         (or individual files — see below)
```

**BRAT release-mode** (`Add Beta Plugin with frozen version`)
fetches files from a tagged release. Standard Obsidian plugin
distribution works this way.

**Catch:** I don't know off the top of my head whether BRAT
release-mode supports fetching a subdirectory as multiple files
or just the standard 3-file contract. Likely the latter, in which
case we'd need to either:
- Inline `assets/` as a base64-encoded blob in `main.js` (defeats
  the binary-distribution goal; main.js becomes ~30 MB and slow to
  parse)
- Ship a zip and have the plugin extract it on first run (requires
  the plugin's main.js to write to its own install directory,
  which Obsidian's filesystem permissions may or may not allow)

Worth researching before committing to A.

### Option B — Manual zip + drop install

Ship a release zip on GitHub Releases:

```
forge-client-obsidian-v0.2.0.zip
├── main.js
├── manifest.json
└── assets/
    ├── engine/
    ├── iframe/
    ├── pyodide/
    └── vaults/
```

Tamar's students download the zip, unzip into
`<vault>/.obsidian/plugins/forge-client-obsidian/`, enable in
Obsidian Settings → Community plugins.

**Pros:**
- Simple, no BRAT, no terminal.
- 3 steps: download, unzip, enable.
- Distribution model is fully under our control — no dependence
  on BRAT's behavior.

**Cons:**
- No auto-update path. Each new version, students re-download
  and re-unzip.
- Slightly more friction than BRAT for tech-comfortable users.

**Build setup:** ~30 lines of script. A `scripts/build-release-zip.mjs`
that bundles `main.js + manifest.json + assets/` into a single
zip with a version suffix. Optionally wired into a GitHub Actions
workflow that runs on tag push.

### Option C — Hybrid: BRAT for the JS, manual for assets

Ship `main.js + manifest.json` via BRAT as before. Ship `assets/`
as a separate one-time download. Students install plugin via BRAT,
then download + unzip `assets-bundle.zip` into the BRAT-installed
plugin directory.

**Pros:**
- Plugin code updates via BRAT auto-update.
- Assets only re-downloaded when they actually change (Pyodide
  version upgrade, new bundled vault library).

**Cons:**
- Two-step install. More confusing than B for non-devs.
- Asset updates need careful coordination with plugin updates
  (manifest in `assets/` ↔ code in `main.js`).

## Trade-offs summary

| Option | Setup friction | Update friction | Implementation cost |
|---|---|---|---|
| **A — Releases workflow** | Low (if BRAT release-mode supports it) | Auto via BRAT | Medium — needs research + maybe inline-or-extract dance |
| **B — Manual zip + drop** | Low (3 steps for student) | Manual re-download per release | Low — ~30 lines of build script |
| **C — Hybrid** | Medium (two-step install) | BRAT for JS, manual for assets | Low-medium — both build paths |

## Recommendation framing (not a recommendation — for planning agent to decide)

For V1 closed-beta-2-weeks-out with non-developer audience:

- **B** is the cheapest to ship and easiest to explain. Tamar
  distributes a zip in her seminar slide, students drop-and-enable.
- **A** is the "right" long-term answer if BRAT release-mode
  supports the asset directory shape — but we'd need to verify
  before committing engineering time.
- **C** is awkward and brings the worst of both; only worth it if
  the auto-update of code matters more than install simplicity
  AND assets rarely change.

If the planning agent's call is **B**, the implementation prompt
is sub-1-hour: build the zip script + draft the 3-step user
instructions. If the call is **A**, first step is a quick spike
to verify BRAT release-mode's actual behavior with `assets/`.

## What 2100 still got right

Committing the binaries to the repo (the actual delivery of 2100)
is still useful — whether the distribution path is A, B, or C, the
binaries need to exist somewhere accessible. Now that they're in
git, the build/release scripts can pull them from the working
tree at zip-time.

If the long-term path is **A with a release-zip** (or **B**), the
binaries don't even strictly need to live in git history — they
could be regenerated via `npm run setup-assets` during the release
build. But that's a future cleanup; today's commit doesn't block
any of the three options.

## State of the smoke

- **test1 vault**: working post-`cp -R`. Pyodide loads, moda
  simulator runs, Forge-click on setup.md returns via Pyodide
  (uvicorn still running per the `Server heartbeat detected` log,
  but irrelevant to the compute path now).
- **The forge.toml ENOENT error** on plugin load is non-fatal — the
  plugin falls through to "register all commands" since no domain
  filtering is declared. Worth a future cleanup to suppress the
  console error when forge.toml is absent (V0 vaults have no
  forge.toml by design).
- **User vault walk + bundled-lib mount** worked in test1 once the
  cp landed. No regression from prompt 2000's shadow fix.

## One observation

The asset-distribution problem is **upstream** of the V1 architecture
decision. Every plugin that ships non-JS resources (themes, sample
data, native binaries, model weights) hits this. Worth a brief
note in any future plugin-distribution documentation: BRAT alone
covers only the standard-plugin-contract files; anything outside
that needs separate distribution thinking.

If the planning layer picks **B**, the build-release-zip script
could become a reusable Forge-plugin convention for any future
plugin in this ecosystem (forge-vault-x, hypothetical chips-only
plugin, etc.) that needs non-JS assets.
