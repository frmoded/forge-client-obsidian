---
timestamp: 2026-05-23T16:58:40Z
session_id: unknown
prompt_modified: 2026-05-23T10:00Z
status: success
---

# V1 Phase 2 iframe-load fix + smoke checklist

## TL;DR

Diagnosis: **Bluh's plugin dir had stale orphan files from the
old split-asset build.** `index.html` was the 777-byte shell that
referenced `index-Kqz8IqaR.js` + `index-cDX_Ois8.css` — those
hashed filenames Obsidian kept requesting were sitting in
`assets/iframe/assets/` from the pre-singlefile build.

Fix: wiped `bluh/.obsidian/plugins/forge-client-obsidian/assets/
iframe/` and re-copied the fresh single-file `index.html`
(209 KB) from `~/projects/forge-client-obsidian/assets/iframe/`.
Also committed two pending changes: the iframe's vite-plugin-
singlefile config to `forge-moda-client`, and the rebuilt single-
file `index.html` to `forge-client-obsidian`.

Bluh's plugin tree is now in clean state. Ready for the user's
V1 acceptance smoke.

## 1. What was actually broken

| State | `~/projects/forge-client-obsidian/assets/iframe/` (source) | `~/forge-vaults/bluh/.obsidian/plugins/forge-client-obsidian/assets/iframe/` (installed) |
|---|---|---|
| index.html size | 209 KB (single-file inline) | **777 bytes (split-asset shell)** ⚠️ |
| `assets/` subdir | absent | **present, with stale `index-Kqz8IqaR.js` + `index-cDX_Ois8.css`** ⚠️ |
| `<script>` tag | `<script type="module" crossorigin>var e=...` (inline body) | `<script type="module" crossorigin src=...>` (external ref) |

The source HAD the singlefile build (rebuilt locally), but bluh
still had the **pre-singlefile copy** from the earlier `cp` round.
Obsidian's WebView correctly requested the referenced hashed
filenames — they existed in bluh's stale `assets/iframe/assets/`
but were the OLD asset bundle, missing the postMessage adapter
logic. Hence the `ERR_BLOCKED_BY_CLIENT` / stale-iframe symptoms.

The diff also surfaced: **`main.js` is hardlinked across
`projects/` ↔ `bluh/`** (same inode 2036359, link count 4 — covers
4 plugin installs including foo/dry-run-vault). Plugin code
edits propagate automatically. **`manifest.json` and styles.css
are NOT hardlinked** (separate inodes), and **`assets/iframe/*`
was NOT hardlinked** either — every iframe rebuild needs an
explicit re-copy to bluh. That's the missing automation that bit
us.

## 2. What CC fixed

### Commits

| Repo | SHA | What |
|---|---|---|
| `forge-moda-client` | **`63c66f2`** | `vite-plugin-singlefile` in `vite.config.ts`. Build now produces a single inlined `index.html` (~210 KB). No more nested `iframe/assets/` subdir. |
| `forge-client-obsidian` | **`da08c4e`** | Rebuilt iframe bundle: dropped the stale `iframe/assets/index-Kqz8IqaR.js` + `index-cDX_Ois8.css`, replaced `index.html` with the 209 KB single-file build. |

### Disk-level fix on bluh

Wiped + re-copied `bluh/.obsidian/plugins/forge-client-obsidian/
assets/iframe/` from the source. Post-fix state verified:
- `index.html` is now 209,043 bytes (matches projects/).
- `assets/` subdirectory is absent (no orphans).
- Inline `<script type="module" crossorigin>var e=...` — no external refs.

Also re-synced `assets/{engine,vaults,manifest.json,pyodide,
wheels}` to make sure nothing else lagged.

No code changes beyond the two commits above.

## 3. Smoke checklist (V1 acceptance)

**Goal:** open the moda simulator in Bluh with NO local servers
running — Pyodide should do everything.

The order below assumes you start from a quiet state. Each step
has its working directory, the exact command, and an Expect:
line. If a step's Expect doesn't match, copy-paste what you see
and which step number you're on; CC takes it from there.

---

### Step 1 — Stop uvicorn (if running)

```bash
pkill -f 'uvicorn.*forge.api'
```

**Expect:** silent exit (already stopped) or one line listing
the killed PID. No error.

### Step 2 — Stop Vite dev server (if running)

```bash
pkill -f 'vite.*forge-moda-web'
```

**Expect:** silent (already stopped) or one line per killed PID.

### Step 3 — Fully quit Obsidian

In Obsidian's menu bar: **Obsidian → Quit Obsidian** (or `Cmd-Q`).

**Important:** NOT `Cmd-P → Reload app without saving`.
`Reload app` keeps Electron's WebView cache warm; the iframe
will still serve from cache and old assets will keep being
requested. You need a full process exit.

**Expect:** Obsidian fully gone from the dock and the menu bar.
Verify with `ps aux | grep -i obsidian | grep -v grep` — should
return nothing.

### Step 4 — Verify the plugin's installed state on disk

```bash
ls -la ~/forge-vaults/bluh/.obsidian/plugins/forge-client-obsidian/assets/iframe/
```

**Expect:** exactly three entries: `index.html` (209043 bytes),
`favicon.svg`, `icons.svg`. **NO `assets/` subdir.** If you see
`assets/`, something re-introduced the orphan — paste the output.

```bash
head -c 500 ~/forge-vaults/bluh/.obsidian/plugins/forge-client-obsidian/assets/iframe/index.html | grep -c 'crossorigin>'
```

**Expect:** `1` (the singlefile build's inline `<script type=
"module" crossorigin>var e=...`). If you see `0`, bluh still
has the split-asset build.

### Step 5 — Reopen Obsidian

Launch Obsidian normally. Open the Bluh vault.

**Expect:** Obsidian loads. No errors banner on startup. If you
see "Plugin failed to load: forge-client-obsidian", paste the
console error (`Cmd-Option-I` → Console tab).

### Step 6 — Open the moda simulator

Command palette (`Cmd-P`) → type "moda" → select **Forge: Open
MoDa simulation** (or whatever the existing command is named for
the moda view).

**Expect:** a new pane opens with the simulator iframe.

### Step 7 — Verify the iframe loaded cleanly

`Cmd-Option-I` to open Obsidian's dev tools → Console tab.

**Expect (positive signals):**
- `Forge: initializing Pyodide…`
- `Forge: Pyodide loaded: <NNN>ms` (typically 800-2000 ms first
  time)
- `Forge: stock packages loaded: <NNN>ms`
- `Forge: bundle mounted: <NNN>ms`
- `Forge: engine ready: <NNN>ms`

**Expect (no errors):**
- **NO** `localhost:8000` or `localhost:5173` references
  anywhere.
- **NO** `ERR_BLOCKED_BY_CLIENT` errors.
- **NO** `index-*.js` or `index-*.css` 404s (those are the
  stale split-asset filenames).

If you see anything in red on the Console tab, screenshot or
paste it. The Network tab also shows blocked requests.

### Step 8 — Verify simState renders

Inside the simulator iframe (the rendered pane):

**Expect:** the canvas shows ~500 light-blue water particles
scattered in the chamber. The "Run / Pause / Step" transport
buttons are visible in the header. The "Run simulation" featured
button appears next to them.

If the canvas is blank or shows only `[loading scenario · 0
ticks]`, the iframe's `moda-init` engine-request didn't get a
response. Check the Console for `engine-request` warnings.

### Step 9 — Run the featured simulation

Click the **"Run simulation"** button (in the iframe header,
between the title and the zoom +/- group).

**Expect:**
- Button label flips to "Running…" and disables.
- Dev tools Network tab: NO HTTP traffic to localhost:* during
  the run.
- After ~8-15 seconds (Pyodide is slower than native CPython
  for the 300-tick bounded run), the canvas redraws with:
  - The water population (now diffused from the click effects).
  - **Three distinct ink dispersions** at the scheduled click
    points (chamber center early-tick, upper-left mid-run,
    lower-right late). Ink particles are larger (4.0 radius)
    and near-black; water is smaller (2.5 radius) and pale blue.
- Button label flips back to "Run simulation".
- Forge Output panel (the right-leaf one) shows the
  `simulation` result entry — either the raw JSON shape (if no
  music renderer applied) or a render of the moda_sim_state.

If anything fails:
- Screenshot the canvas.
- Paste the Console output between clicking the button and the
  error.
- Note which step (Pyodide load? engine-request flight?
  canvas redraw?).

### Step 10 — (Optional but useful) Live tick check

Click anywhere on the canvas (not on a button). The iframe's
`handleCanvasClick` posts a `moda-click` engine-request with
the click coordinates.

**Expect:** an ink dispersion appears near the click location
within ~1 second.

If the toolbar's Run button is still on "Running" mode, the
auto-loop is also firing `moda-compute` engine-requests at the
slider's speed. Particles drift continuously.

---

## 4. What to paste if it still fails

For each failed step, the smallest-useful debug payload:

| Failure | Paste this |
|---|---|
| Step 4 `ls` shows `assets/` subdir | `find ~/forge-vaults/bluh/.obsidian/plugins/forge-client-obsidian/assets/iframe -type f` |
| Step 4 `grep -c` returns 0 | `head -c 500 ~/forge-vaults/bluh/.obsidian/plugins/forge-client-obsidian/assets/iframe/index.html` |
| Step 7 sees `ERR_BLOCKED_BY_CLIENT` | Screenshot of Dev tools Network tab + Console tab |
| Step 7 sees `localhost:8000` 404 | The exact URL that failed (Network tab) — means a non-bundled snippet path hit HTTP fallback |
| Step 7 sees `Pyodide host not initialized` | Console messages from plugin startup (filter "Forge:") |
| Step 8 canvas stays blank | Search Console for "engine-request" or "moda-init" |
| Step 9 button click → no response | Console output during the 10 sec after the click; specifically look for `Pyodide loaded` lines that should fire on first compute |
| Step 9 takes >60 seconds | Acceptable for V1 (Pyodide cold-start + 300-tick run); flag if next run is also that slow |

## 5. Architectural caveats still standing

These are NOT blockers for the smoke; they're known regressions
from prior Phase 1/2 feedback that haven't been addressed yet:

- **User-vault shadowing.** Snippets in the bundled forge-moda
  library (29 known basenames) always resolve via Pyodide. A
  user-authored shadow of `setup` at bluh's vault root is
  IGNORED — Pyodide picks the bundled one. (Phase 0800 §10b.)
- **`_BUNDLED_MODA_SNIPPETS` is hardcoded** in `server.ts`.
  When forge-moda's bundled version bumps, that list needs
  updating. (Phase 0800 observation.)
- **`/generate` still requires uvicorn.** The transpile-service
  α-prompt addresses this; for V1, users who want to regenerate
  snippets need uvicorn running (V1 is consume-only).
- **/freeze, /sync_dependencies, /canonicalize, /connect** still
  HTTP-bound. Not in the smoke checklist's happy path.

## 6. Deviations

**None** from the prompt's scope. Disk cleanup + two commits +
smoke checklist.

## 7. One observation

The hardlink situation deserves a tiny follow-up: bluh's
`main.js` IS hardlinked to projects/ (`cp` reports "identical
(not copied)" because of the same-inode rule on APFS clones).
But bluh's `assets/iframe/*` is NOT — every iframe rebuild
needs an explicit `cp` to bluh. That mismatch is exactly what
caused this bug.

The right fix is either:
- (a) `npm run setup-assets` (or a sibling `sync-bluh` script)
  that re-copies iframe + manifest + styles to bluh's plugin
  dir after every iframe build.
- (b) Hardlink the iframe dir at install time, so any rebuild
  propagates automatically.

(a) is simpler. Worth a 10-line follow-up before V1 ships.
Until then, **the user (or any developer) must remember to
manually re-copy `assets/iframe/` to bluh after each
`npx vite build`**.
