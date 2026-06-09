---
timestamp: 2026-05-23T06:39:46Z
session_id: unknown
prompt_modified: 2026-05-23T09:00Z
status: success
---

# V1 Phase 2 — iframe routes through plugin Pyodide via postMessage

## TL;DR

Shipped. Iframe adapter swapped from HTTP to postMessage; plugin
dispatches via the Phase 1 Pyodide host. Iframe loads from the
plugin's bundled `assets/iframe/` (built by `npx vite build`,
228 KB) instead of `localhost:5173`. Dev-mode toggle preserved
via a settings checkbox. **All tests green** — 42/42 plugin,
7/7 iframe (up from 4/4). V1 acceptance smoke (uvicorn AND Vite
dev server both stopped → moda simulator works) deferred to user.

## 1. postMessage protocol shape

```typescript
EngineRequest  = { type: "engine-request",  request_id: string, op, args[], vault_name? }
EngineResponse = { type: "engine-response", request_id: string, ok: boolean, result?, error? }
```

Per-op args contract (documented inline in `wire.ts`):

| op | args | result |
|---|---|---|
| `moda-init` | `[]` | `InitResponse` (sessionId, state, config, stdout) |
| `moda-compute` | `[dt, temperature]` | `ComputeResponse` (state, stdout) |
| `moda-click` | `[x, y]` | `ClickResponse` (ack, stdout) |
| `compute` | `[snippet_id]` (+ `vault_name`) | `GenericComputeResponse` |

UUID via `crypto.randomUUID()` — modern browsers + Obsidian's
Electron renderer support it natively.

## 2. `moda-view.ts` handler diff

Existing listener handled `iframe-ready`, `featured-snippet`,
`compute-result`. Added an `engine-request` branch:

```typescript
if (data.type === 'engine-request' && data.request_id && data.op) {
  void this.handleEngineRequest(data.request_id, data.op, data.args, data.vault_name);
}
```

New `handleEngineRequest(requestId, op, args, vault_name)` method:

- Looks up the Pyodide host singleton via `getPyodideHost()`.
- Switches by op to call `host.modaInit()` / `modaCompute(...)` /
  `modaClick(...)` / `computeViaEngine(...)`.
- For `op === "compute"`, shapes the response to match the
  existing `GenericComputeResponse` (`{type:"action", result,
  stdout}`) so the iframe consumer doesn't change.
- Posts `engine-response {request_id, ok, result?, error?}` back
  to `iframeEl.contentWindow`.

The `e.source !== iframeEl.contentWindow` filter (hoisted in
prompt 0300) still gates the listener at the top — all three
branches share it.

## 3. State management

**State lives in Pyodide Python globals between calls.** When
`modaInit` runs, it stores `_forge_moda_state = setup("medium")`
in Python globals. `modaCompute(dt, temperature)` reads
`_forge_moda_state`, calls `go(state, dt, temperature)`, writes
back. Same for `modaClick`. **Only the wire-shape SimState
(per-row `{id, type, x, y, mass}` dicts) crosses the JS↔Python
boundary** — never the ParticleState dataclass with its numpy
arrays. That mirrors `forge.api.moda._serialize_particles` and
keeps the live 30Hz loop cheap.

**Session ID:** `_forge_moda_session_id = uuid.uuid4().hex`,
generated on `modaInit`. The iframe receives it in the init
response and stores it; subsequent `compute`/`click` calls
include it on the wire but the plugin ignores it (one iframe per
plugin session per V1's assumption). Documented in adapter
inline comments (`void sessionId;`).

If the iframe reloads (user navigates away + back), it sends a
fresh `moda-init` → plugin resets to fresh state. Same shape as
the prior /moda/init behavior.

## 4. Iframe adapter diff

**Before** (HTTP):

```typescript
init(): Promise<InitResponse> {
  return this.post<InitResponse>("/init", {});  // POST http://localhost:8000/moda/init
}
```

**After** (postMessage):

```typescript
async init(): Promise<InitResponse> {
  return (await this.postEngineRequest("moda-init", [])) as InitResponse;
}
```

`postEngineRequest(op, args, vault_name?)` generates a UUID,
stashes `{resolve, reject}` in a `pendingRequests` Map, posts the
engine-request to `window.parent`, returns a promise. A
constructor-installed listener on `message` looks up the matching
request_id in `pendingRequests` and resolves/rejects.

`dispose()` method clears pending promises + removes the listener
— used in tests; production iframes keep the adapter for the
lifetime of the React tree.

**No localhost references** in the built iframe bundle (grep
confirmed: 0 occurrences of `localhost:8000` or `localhost:5173`
in `assets/iframe/assets/index-*.js`).

The class kept its `LocalHttpAdapter` name (the prompt suggested
optional rename to `LocalEngineAdapter`; deferred to keep the
diff scoped).

## 5. Iframe build output

**Vite config:**

```typescript
base: './',
build: {
  outDir: '../../forge-client-obsidian/assets/iframe',
  emptyOutDir: true,
},
```

`base: './'` is critical — makes the bundle's internal asset
references work under Obsidian's `app://` URL scheme.

**Build invocation:**

```bash
cd forge-moda-client/forge-moda-web && npx vite build
# → 228 KB bundle (index.html + 200 KB JS + 8 KB CSS + favicons)
#   lands at ../../forge-client-obsidian/assets/iframe/
```

**Decision: committed the iframe bundle to the plugin repo.**
228 KB is small enough that the alternative (gitignore + a
multi-repo `npm run build-iframe` step) isn't worth the
coordination cost. Hashed filenames (`index-Kqz8IqaR.js`) churn
on each rebuild but each diff is one file rename.

## 6. Plugin iframe-source

```typescript
private iframeSrc(): string {
  if (this.deps.getSettings().useDevIframe) return 'http://localhost:5173';
  return this.app.vault.adapter.getResourcePath(
    `.obsidian/plugins/${this.deps.pluginId}/assets/iframe/index.html`,
  );
}
```

Settings toggle `useDevIframe` (boolean, default false) — UI
exposed in `ForgeSettingTab`. Default is production (bundled
iframe); developers flip on for `npm run dev` iteration.

`ModaViewDeps {getSettings, pluginId}` injected through the
ItemView factory in `main.ts`. Avoids a circular import on the
full plugin instance.

## 7. Build pipeline summary

To produce a complete plugin distribution:

```bash
# One-time per clone:
cd forge-client-obsidian
npm install
npm run setup-assets       # populates assets/pyodide/ + wheels/ (~14 MB)

# Per release / on changes:
cd ../forge-moda-client/forge-moda-web
npx vite build             # → ../../forge-client-obsidian/assets/iframe/

cd ../../forge-client-obsidian
npm run build              # esbuild + asset-manifest refresh

# Distribute via BRAT from the populated repo.
```

Total install footprint: **14.94 MB** (14.71 MB from Phase 1 +
0.23 MB iframe bundle).

## 8. Test results

| Suite | Pre | Post |
|---|---|---|
| Plugin (`node --test`) | 42 | **42** |
| Iframe (vitest) | 4 | **7** (+3) |
| Engine (forge pytest) | 406 | unchanged |

**New iframe tests:**
1. `LocalHttpAdapter.init()` posts engine-request, resolves on
   matching engine-response.
2. `engine-response {ok: false}` → promise rejects with error message.
3. Concurrent calls correlate by request_id with arbitrary
   response order (responds to the SECOND first; both resolve
   correctly).

**Existing Simulator tests rewritten** to use a
`withFakeEnginePlugin` helper that stands in for the plugin's
engine-request handler in jsdom (where `window.parent === window`).
The harness listens for engine-request and posts back a
canned engine-response based on the op.

No new plugin tests on the engine-request handler — same
Obsidian-coupling limitation as prompt 0300's plugin handler.
Flagged.

## 9. Commit SHAs

| Repo | SHA | What |
|---|---|---|
| `forge-moda-client` | **`b1f4025`** | adapter postMessage refactor + vite config + 3 new vitest cases |
| `forge-client-obsidian` | **`5564d56`** | engine-request handler, moda fast-path in pyodide-host, iframe-source switch, useDevIframe setting, vendored iframe bundle |

## 10. Manual smoke (V1 acceptance — user runs)

1. `cd forge-moda-client/forge-moda-web && npx vite build` —
   verify the bundle lands at
   `forge-client-obsidian/assets/iframe/`.
2. `cd ../../forge-client-obsidian && npm run setup-assets`
   (if not done yet). Then `npm run build`.
3. BRAT install (or `cp -R` plugin → test vault's `.obsidian/
   plugins/`). Reload Obsidian.
4. **Stop uvicorn. Stop the Vite dev server.** Both must be down.
5. Open the moda simulator (`Forge: Open MoDa simulation`).
6. Expect:
   - Iframe loads from `app://.../assets/iframe/index.html`
     (check dev console — no `localhost:5173` reference).
   - Plugin logs Pyodide init (one-time, takes a few seconds).
   - Iframe sends `engine-request moda-init`; plugin posts
     `engine-response` with sessionId + state + config + stdout.
   - Canvas renders water particles. Featured "Run simulation"
     button appears.
7. Click "Run simulation":
   - Iframe sends `engine-request compute snippet_id=simulation`.
   - Plugin runs `simulation` via Pyodide (~8 seconds per spike).
   - Final-tick state renders on canvas (water + ink dispersions).
   - **No localhost:* errors in dev console.**
8. (Optional) Click the canvas — fires `moda-click`, ink appears
   at click location.
9. **V1 acceptance criterion:** steps 5-7 work with no uvicorn
   AND no Vite dev server running.

If smoke fails, paste:
- Any `localhost:*` console errors → means a code path didn't migrate.
- Any postMessage shape errors → protocol mismatch.
- Any "Pyodide host not initialized" → main.ts wiring issue.
- Any CSP / WASM-load errors → architecture A blocked; route to
  questions/ with the specific error.

## 11. Deviations

**Three minor.**

1. **Adapter class name kept `LocalHttpAdapter`.** The prompt
   suggested optional rename to `LocalEngineAdapter` — deferred
   to keep the diff scoped and avoid touching Simulator.tsx
   imports. Cleanup-of-cleanup.

2. **Iframe bundle committed (not gitignored).** The prompt
   listed both options and asked me to pick. Picked commit
   because the bundle is small (228 KB) and the alternative
   requires multi-repo build coordination. Hashed filenames
   churn on each rebuild but each diff is one rename.

3. **`manifest.json` was minified and `styles.css` was trimmed
   by some non-V1 tooling** that ran during the work. Restored
   both to their pre-V1 versions so the commit stays scoped.
   Worth a side-investigation if either change was intentional
   from another source.

## 12. One observation

The `withFakeEnginePlugin` helper in `Simulator.test.tsx` is a
nice abstraction for postMessage protocol testing. If Phase 3
adds new ops or if we ever build a `/canonicalize` Pyodide path,
the same helper pattern (listen for engine-request, dispatch by
op, post back engine-response) is the right shape for the test
fixture. Worth lifting into a shared test utility if a second
test file needs it.

Separately: the live 30Hz compute loop now does
JS-postMessage → plugin → Pyodide → reply → JS-postMessage on
every tick. The Pyodide call itself is ~18ms native, ~26ms
WASM per the moda spike. The postMessage round-trip is sub-ms
in jsdom but unknown in actual Obsidian — Electron's IPC
overhead between renderer processes could add a few ms. If the
user's smoke shows live fps below the spike's 38fps target,
that's the likely cost. Worth measuring once the smoke lands.
