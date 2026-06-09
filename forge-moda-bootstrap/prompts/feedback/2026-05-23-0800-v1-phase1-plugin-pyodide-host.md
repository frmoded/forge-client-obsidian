---
timestamp: 2026-05-23T05:34:36Z
session_id: unknown
prompt_modified: 2026-05-23T08:00Z
status: success
---

# V1 Phase 1 — plugin hosts Pyodide; engine-compute paths route locally

## TL;DR

Phase 1 code shipped. Plugin now has `pyodide-host.ts` (lazy
Pyodide loader + computeViaEngine dispatch), `server.ts` reroutes
bundled-moda Forge-clicks to Pyodide instead of localhost:8000,
build pipeline copies + manifests assets. **Install footprint
14.71 MB**. 42/42 tests passing. **Pyodide binary assets stay out
of git per a Claude Code auto-mode block on external-binary
vendoring** — they're fetched into the local working copy via
`npm run setup-assets` (one-time after clone). Engine + vault
content (~100 KB of text from `~/projects/forge/` and
`~/projects/forge-moda/`) ARE committed.

**Live Obsidian smoke deferred to user** — the 7-step checklist
is in the prompt's "Manual smoke" section. I cannot verify
Pyodide loads in Obsidian's plugin process without you running it.

## 1. `assets/` tree

```
assets/
├── pyodide/          (.gitignored — fetched by `npm run setup-assets`)
│   pyodide.asm.wasm                  8.25 MB
│   pyodide.asm.js                    1.02 MB
│   pyodide.mjs
│   python_stdlib.zip                 2.31 MB
│   pyodide-lock.json
│   package.json
├── wheels/           (.gitignored — same source)
│   numpy-2.2.5-…whl                  2.69 MB
│   pyyaml-6.0.2-…whl                 0.11 MB
│   micropip-0.11.1-…whl              0.11 MB
├── engine/           (committed — vendored from ~/projects/forge/)
│   forge/__init__.py
│   forge/core/{executor, snippet_registry, graph_resolver,
│                exceptions, serialization, snapshots, registry,
│                dependencies}.py + __init__.py
│   forge/moda/{__init__, types}.py
└── vaults/           (committed — vendored from ~/projects/forge-moda/)
    forge-moda/{32 .md files, forge.toml, _meta/_chips.md}
```

Per-subdir size:

| Subdir | Size |
|---|---|
| pyodide  | 11.72 MB |
| wheels   | 2.91 MB |
| engine   | 0.05 MB |
| vaults   | 0.03 MB |
| **total** | **14.71 MB** |

Inside the 22 MB target from prompt 0700's Phase 4 math, before
music21 is added in Phase 3.

## 2. Pyodide URL resolution

Chosen: **`app.vault.adapter.getResourcePath(path)`** — Obsidian's
standard primitive for plugin asset URLs. Path passed in is
`.obsidian/plugins/<plugin-id>/assets/<relpath>`. Returns an
`app://<hash>/...` URL the browser fetches via standard `fetch()`.
This is what other Obsidian plugins use for binary/static-asset
loading (the precedent is established).

Untested in live Obsidian per the prompt's deferred smoke. If the
URL scheme turns out to be wrong, the swap is one line in
`pluginAssetUrl()` and a re-run of `npm run build`.

## 3. CSP / WASM verification

**Not empirically verified** — this is the load-bearing untested
assumption. Per the moda + music spikes, Pyodide WASM loads
cleanly in Node.js Pyodide runtime, and the WASM core is
identical to browser Pyodide. Obsidian's Electron renderer is a
Chromium-based environment that should accept WASM by default
(no special CSP needed beyond what the plugin already runs in).

**If the user's smoke reveals a CSP block, route the follow-up
to questions/** — architecture A (plugin hosts Pyodide) would be
dead and we'd need to re-decide. The fallback is architecture B
(iframe hosts Pyodide), which is a significant refactor not in
this prompt's scope.

## 4. `pyodide-host.ts` shape

```typescript
export class PyodideHost {
  constructor(app: App, pluginId: string) { ... }
  async getInstance(): Promise<PyodideHostInstance>;  // lazy, cached
}

export interface PyodideHostInstance {
  computeViaEngine(snippet_id: string, args: unknown[], vault_name: string)
    : Promise<{ result: unknown, stdout: string }>;
}
```

**Init sequence** (`_init()`):

1. Dynamic-import `pyodide.mjs` from `app.vault.adapter.
   getResourcePath('.obsidian/plugins/.../assets/pyodide/pyodide.mjs')`.
2. `loadPyodide({indexURL: <plugin-asset-url>/pyodide/})`.
3. Fetch `manifest.json` to know what to mount.
4. `loadPackage(["numpy", "pyyaml", "micropip"])` — resolves from
   the local wheels via Pyodide's lockfile.
5. Mount `assets/engine/**` and `assets/vaults/**` into MEMFS at
   `/bundle/`. Walks parent dirs with `_mkdirP` because Pyodide's
   FS.mkdir doesn't auto-create intermediate dirs.
6. `sys.path.insert(0, "/bundle/engine")`.
7. Inject helper functions (`_forge_get_resolver`, `_forge_compute`)
   into the global namespace — these wrap the engine's resolver +
   `exec_python` so `computeViaEngine` can dispatch through them
   with a single Python call per request.

**`computeViaEngine` implementation:**

Sets snippet_id / vault_name / args as Pyodide globals, calls
`_forge_compute(...)`, unpacks the returned (result, stdout)
tuple. PyProxy results are `toJs({dict_converter: Object.
fromEntries})`'d to plain JS shapes; PyProxies are destroyed
explicitly to release Python-side references.

## 5. Swapped endpoints

**Routed through Pyodide:**

| Endpoint | Status |
|---|---|
| `/compute` (action snippets in bundled forge-moda) | ✓ swapped |
| `/compute` (data snippets in bundled forge-moda) | ✓ swapped (uses `read_data_snippet`) |

**NOT routed through Pyodide (per prompt scope):**

| Endpoint | Reason |
|---|---|
| `/generate`, `/canonicalize` | LLM-driven; transpile service prompt addresses |
| `/moda/init`, `/moda/compute`, `/moda/click` | Iframe-driven; Phase 2 routes |
| `/connect` | Used for vault inventory; no Pyodide equivalent yet |
| `/freeze`, `/unfreeze`, `/sync_dependencies` | Needs the user-vault-resolution decision (see §10) |
| `/test` (server ping) | uvicorn-specific; not relevant to Pyodide |
| `/compute` (user-vault snippets not in bundled library) | Falls through to HTTP — see §10 |

The dispatch logic in `server.ts:computeSnippet` first checks if
the snippet ID matches a bundled moda snippet (via a hardcoded
Set of 29 known basenames). If yes, Pyodide; else HTTP fallback.

## 6. Build pipeline diff

`package.json` scripts:

```json
"build":          "npx esbuild ... && node scripts/copy-assets.mjs",
"setup-assets":   "node scripts/setup-assets.mjs",
"build-manifest": "node scripts/build-manifest.mjs",
```

`scripts/setup-assets.mjs` — populates `assets/pyodide/` and
`assets/wheels/` from `node_modules/pyodide/`. Warms a Pyodide
session if wheel files aren't cached yet. Run ONCE after clone.

`scripts/copy-assets.mjs` — regenerates manifest, prints
per-subdir size. Runs after esbuild.

`scripts/build-manifest.mjs` — walks `assets/`, emits
`manifest.json` with paths bucketed into `{pyodide, wheels,
engine, vaults}`.

**Install size:** 14.71 MB total. Release zip for BRAT
distribution will include the populated `assets/`.

## 7. Test results

| | Pre | Post |
|---|---|---|
| Plugin tests (`node --test`) | 42 | **42** |

No new tests. The `pyodide-host.ts` module is Obsidian-coupled
(uses `app.vault.adapter.getResourcePath`) and uses dynamic
import; the existing pure-core test convention doesn't fit.
Per the prompt's "tests are optional" guidance for this phase.

## 8. Commit SHA

`forge-client-obsidian` → **`c781c0c`** on `main`, pushed.

## 9. Manual smoke guidance (user runs)

1. `cd ~/projects/forge-client-obsidian && npm run setup-assets`
   — populates `assets/pyodide/` + `assets/wheels/` (~14 MB).
   First run downloads wheels via npm pyodide package; subsequent
   runs use local cache.
2. `npm run build` — verifies asset manifest, copies into
   build output. Should print the 14.71 MB footprint.
3. Install plugin via BRAT in a test vault. Reload Obsidian.
4. Open Obsidian's developer console. **No errors expected on
   plugin load** — Pyodide isn't loaded yet (lazy).
5. Forge-click on any bundled moda snippet (e.g., `simulation.md`
   or `setup.md` from `bluh/forge-moda/`). Confirm:
   - Console shows "Forge: initializing Pyodide…" then load
     timing lines.
   - Forge Output renders the result.
   - Stdout (if any) renders below result.
   - **No `localhost:8000` fetch errors** on this path.
6. With uvicorn STOPPED, repeat step 5. Confirm it still works.
7. Try `/generate` on a snippet. Should still hit uvicorn (LLM
   endpoints stay HTTP); fails if uvicorn is down (expected
   regression in V1 until transpile service ships).

## 10. Deviations and known regressions

### 10a. Binary asset vendoring approach

The prompt envisioned committing Pyodide assets directly to the
plugin repo. Claude Code's auto-mode classifier blocked this as
"untrusted code integration / pulling external code into trusted
source control without explicit user authorization."

**Resolution:** binaries fetched via `npm run setup-assets` from
`node_modules/pyodide/`; `.gitignored` from the plugin repo;
populated locally for builds and bundled into the BRAT release
zip. Engine + vault content (~100 KB of trusted internal text
from `~/projects/forge/` and `~/projects/forge-moda/`) ARE
committed.

This is actually the cleaner shape — binaries don't bloat git
history; release builds still package everything; first-time
contributors run one extra command.

### 10b. User-vault shadowing regression

V1 Phase 1 resolves snippets ONLY against the bundled forge-moda
library mounted in MEMFS. **User-vault shadowing and
user-authored snippets at the vault root do NOT work via
Pyodide.** They fall through to the HTTP path (which still
requires uvicorn).

`server.ts:computeSnippet` checks if the snippet ID matches a
hardcoded Set of 29 known bundled moda snippet basenames. Match
→ Pyodide. Miss → HTTP fallback. This means:

- A user clicking `bluh/forge-moda/setup.md` (snippet ID
  `setup`, bundled) routes through Pyodide ✓
- A user clicking `bluh/setup.md` (their own shadow) ALSO
  routes through Pyodide and **uses the bundled `setup`, NOT
  the user's shadow** — silent regression
- A user clicking `bluh/my_custom.md` (their own authored
  snippet, not bundled) routes through HTTP fallback as before

The shadow case is the worrying one. Two follow-up paths:

1. Stream the user's vault into MEMFS at compute time so the
   resolver sees shadows. Multi-hour effort, real complexity
   around cache invalidation. Right answer long-term.
2. Detect "user has a shadow" at click time and prefer HTTP for
   that case. Simpler but requires the plugin to know about the
   user's vault layout.

This deserves a follow-up prompt before V1 ships to users who
might have shadows. **Worth flagging to the user before Phase 2
starts.**

### 10c. Test coverage on `pyodide-host.ts`

Zero pure-core tests for the new module — it's tightly coupled
to Obsidian's `app.vault.adapter.getResourcePath()` and
dynamic-import of the Pyodide bootstrap. The existing
`node --test` infrastructure targets pure-core modules; a
JSDOM + Obsidian-shim layer would be new infrastructure beyond
the prompt's scope. Same compromise as prompt 0300's deviation
on Phase 1's plugin handler.

## 11. One observation

The hardcoded `_BUNDLED_MODA_SNIPPETS` Set in `server.ts` is a
maintenance trap. Every time the bundled forge-moda version
bumps and adds/removes snippets, the Set needs updating. Two
cleaner shapes for follow-up:

1. Read the Set from `assets/vaults/forge-moda/`'s `.md` file
   listing at plugin init (one `fs.readdirSync` call).
2. Ask Pyodide on first call: "which snippet IDs does the
   bundled vault expose?" — store the answer in memory.

(1) is simpler; (2) generalizes when Phase 3 adds forge-music.
Either way, the hardcoded list is a Phase 1 expedient that
deserves to be removed before V1 ships. Should be ~10 lines.

Separately: the dynamic-import path
`import(pluginAssetUrl("pyodide/pyodide.mjs"))` is the one piece
of `pyodide-host.ts` I'd most expect to surprise me in real
Obsidian. The `@vite-ignore` comment is there because bundlers
sometimes try to resolve dynamic imports at build time; with
esbuild the import is left as-is, but worth confirming on the
first live smoke that the URL scheme resolves and the dynamic
import doesn't try to traverse `node_modules/`.
