# V1 Phase 2 — iframe routes through plugin (Pyodide via postMessage)

## Scope

Second of three V1 phase-prompts. Phase 1 (`0800`, commit `c781c0c`) wired plugin-side Pyodide. This phase routes the iframe's engine calls through the plugin (via postMessage) instead of HTTP-to-uvicorn, and ships the iframe as a static bundle inside the plugin so it loads without `localhost:5173`.

After this, the moda V1 acceptance test passes: open Obsidian → open moda simulator → "Run simulation" works with no uvicorn, no Vite dev server.

What this prompt delivers:

1. **postMessage engine protocol.** Iframe sends `engine-request {request_id, op, args}` to `window.parent`; plugin dispatches via `pyodide-host.computeViaEngine` and replies with `engine-response {request_id, ok, result?, error?}`. Request-id correlation for concurrent calls.

2. **Plugin engine-request handler (`moda-view.ts`).** Dispatches the four operations the iframe needs:
   - `moda-init` — runs `setup("medium")` via Pyodide, stores ParticleState in plugin memory, returns `{session_id, state: SimState, config: Config, stdout}` shape (matches the existing `/moda/init` HTTP response so the iframe consumer doesn't change).
   - `moda-compute` — runs `go(state, dt, temperature)`, updates stored state, returns `{state: SimState, stdout}`.
   - `moda-click` — runs `on_mouse_click(state, x, y)`, updates stored state, returns `{stdout}`.
   - `compute` — generic `computeViaEngine(snippet_id, args, vault_name)` for the featured-button path.

3. **Iframe HTTP adapter swap (`LocalHttpAdapter.ts` or equivalent).** Each `init`/`compute`/`click`/`computeSnippet` method swaps from `fetch('http://localhost:8000/...')` to a postMessage round-trip. Promise-based: posts an `engine-request`, awaits the matching `engine-response`, resolves with the result shape. Existing iframe consumers (Simulator.tsx) see the same return shapes — no React-side changes needed.

4. **Iframe static bundle in plugin assets.** Build forge-moda-client into a static bundle, output to `forge-client-obsidian/assets/iframe/` (or via a vite config update that points at the plugin's assets dir). Plugin loads iframe from `getResourcePath(.../assets/iframe/index.html)` instead of `http://localhost:5173`.

5. **Dev mode preserved.** Developers iterating on the iframe can still use `npm run dev` at `localhost:5173`. Plugin's iframe-source URL is configurable (settings toggle, env flag, or build flag — pick the cleanest). Default = production (bundled).

Does NOT:

- Touch music21 or forge-music. Phase 3.
- Migrate `/generate` or `/canonicalize`. Stays HTTP until α (transpile service).
- Refactor the engine. Per the spikes, runs in Pyodide as-is.
- Touch the bundled forge-moda v0.4.16 vault content.
- Submit anything to Obsidian's community plugin directory. BRAT for V1.
- Fix the hardcoded `_BUNDLED_MODA_SNIPPETS` Set wart in `server.ts` (CC's prompt 0800 observation). Separate small prompt; doesn't block Phase 2.
- Delete the engine's HTTP API. uvicorn keeps working for dev mode / native debugging.
- Address user-vault shadow regression (CC's prompt 0800 §10b). Same scope/follow-up.

## Why

Phase 1 swapped the plugin's direct engine-compute paths to Pyodide, but the user-facing affordance for moda (the simulator iframe) still calls `localhost:8000/moda/*`. With uvicorn down, the iframe crashes on `/moda/init`, the featured-button never renders, V1 acceptance fails. Phase 2 routes those calls through the plugin's existing `pyodide-host.computeViaEngine`, so the iframe works without uvicorn — and incidentally without the Vite dev server.

The smoke checkpoint after Phase 2: open moda simulator with uvicorn stopped and Vite dev server stopped. Featured button appears. Click runs `simulation` end-to-end in Pyodide. That's V1 acceptance for moda.

## Files to modify

### Phase 2.1 — postMessage protocol shape

**Iframe wire types** (e.g. `forge-moda-client/forge-moda-web/src/types/wire.ts`):

Add the engine-request/response interfaces:

```typescript
export interface EngineRequest {
  type: "engine-request";
  request_id: string;
  op: "moda-init" | "moda-compute" | "moda-click" | "compute";
  args: unknown[];  // op-specific positional args
  vault_name?: string;  // for op=compute
}

export interface EngineResponse {
  type: "engine-response";
  request_id: string;
  ok: boolean;
  result?: unknown;     // op-specific result shape (matches existing HTTP shapes)
  error?: string;
}
```

Document the per-op `args` shape in a comment block — e.g. `moda-init: []`, `moda-compute: [dt, temperature]`, `moda-click: [x, y]`, `compute: [snippet_id]`.

### Phase 2.2 — plugin engine-request handler

**`forge-client-obsidian/src/moda-view.ts`:**

Extend the existing message listener (which already handles `iframe-ready`, `featured-snippet`, `compute-result`) to dispatch `engine-request`. New method:

```typescript
private async handleEngineRequest(req: EngineRequest): Promise<void> {
  const respond = (resp: Omit<EngineResponse, "type">) => {
    this.iframeEl?.contentWindow?.postMessage(
      {type: "engine-response", ...resp},
      "*"
    );
  };

  try {
    const host = await this.plugin.pyodideHost.getInstance();
    let result: unknown;

    switch (req.op) {
      case "moda-init":
        result = await this.modaInit(host);
        break;
      case "moda-compute":
        result = await this.modaCompute(host, ...req.args);
        break;
      case "moda-click":
        result = await this.modaClick(host, ...req.args);
        break;
      case "compute": {
        const [snippet_id] = req.args as [string];
        const r = await host.computeViaEngine(snippet_id, [], req.vault_name ?? "forge-moda");
        result = {result: r.result, stdout: r.stdout};
        break;
      }
    }

    respond({request_id: req.request_id, ok: true, result});
  } catch (e) {
    respond({
      request_id: req.request_id,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
```

Plus four small helpers (`modaInit`, `modaCompute`, `modaClick`, etc.) that:
- Run the appropriate moda entry-point snippet via `computeViaEngine`.
- Maintain `this.currentParticleState` between calls (so `moda-compute` can pass state through).
- Serialize ParticleState → SimState shape that matches the existing `/moda/init` `/moda/compute` HTTP response (per `forge/api/moda.py:_serialize_particles`).

The serialization can be done Python-side (Pyodide returns the moda_sim_state wire shape from `serialize_for_wire`, the unify-compute-serialization work from prompt 1700) or JS-side (after `computeViaEngine` returns the raw ParticleState dict). Pick the cleaner — Python-side gives a moda_sim_state shape; JS-side gives raw arrays. The iframe today expects the row-oriented Particle list; emit that.

**Session ID handling.** The existing iframe wire expects a `session_id` on init responses. With in-process Pyodide there's no session — state is plugin-memory. Generate a fixed `session_id` like `"v1-pyodide-session"` and ignore it on subsequent requests (or use a UUID generated at iframe-mount). Document the choice.

### Phase 2.3 — iframe HTTP adapter swap

**`forge-moda-client/forge-moda-web/src/adapters/LocalHttpAdapter.ts` (or wherever the adapter lives):**

Existing methods (`init`, `compute`, `click`, `computeSnippet`) each `await fetch('localhost:8000/...')`. Replace each with the postMessage round-trip:

```typescript
class LocalHttpAdapter {  // or rename to LocalEngineAdapter — semantically more accurate now
  private pendingRequests = new Map<string, {
    resolve: (v: unknown) => void;
    reject: (e: Error) => void;
  }>();

  constructor() {
    window.addEventListener("message", this.onMessage);
  }

  private postEngineRequest(op: string, args: unknown[], vault_name?: string): Promise<unknown> {
    const request_id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(request_id, {resolve, reject});
      window.parent.postMessage({
        type: "engine-request", request_id, op, args, vault_name,
      }, "*");
    });
  }

  private onMessage = (event: MessageEvent) => {
    const data = event.data;
    if (data?.type !== "engine-response") return;
    const handler = this.pendingRequests.get(data.request_id);
    if (!handler) return;
    this.pendingRequests.delete(data.request_id);
    if (data.ok) handler.resolve(data.result);
    else handler.reject(new Error(data.error ?? "engine-response: unknown error"));
  };

  async init(): Promise<InitResponse> {
    return await this.postEngineRequest("moda-init", []) as InitResponse;
  }
  // ... same for compute, click, computeSnippet
}
```

Cleanup: remove the `fetch` calls, remove the localhost:5173/8000 references. The adapter is no longer "Http" — consider renaming to `LocalEngineAdapter` or similar. (Optional but cleaner.)

### Phase 2.4 — iframe static bundle in plugin assets

**Build output path.** Update forge-moda-client's vite config (`vite.config.ts`) so production build outputs to `../forge-client-obsidian/assets/iframe/`:

```typescript
export default defineConfig({
  // ...
  build: {
    outDir: "../forge-client-obsidian/assets/iframe",
    emptyOutDir: true,
  },
  base: "./",  // relative paths so the bundle works under any URL scheme
});
```

Critical: `base: "./"` makes the bundle's internal asset references work when loaded under Obsidian's `app://` URL scheme.

**Build invocation.** `npx vite build` (the workaround for the pre-existing tsc error) produces the static bundle. Document the workflow:

```
cd forge-moda-client/forge-moda-web && npx vite build
# → output lands at forge-client-obsidian/assets/iframe/
cd ../../forge-client-obsidian && npm run build
# → copies all assets including iframe/ into the plugin distribution
```

**Plugin iframe-load path.** `forge-client-obsidian/src/moda-view.ts`:

Existing code loads iframe from `http://localhost:5173`. Add a configurable source:

```typescript
private iframeSrc(): string {
  // Dev mode hook: if a settings toggle / env flag is set, point at Vite dev server.
  if (this.devModeIframe()) return "http://localhost:5173";
  return this.app.vault.adapter.getResourcePath(
    `.obsidian/plugins/${this.plugin.manifest.id}/assets/iframe/index.html`
  );
}
```

Pick the simplest dev-mode hook — likely a plugin setting (boolean) defaulting to false (production). Document.

### Phase 2.5 — vitest updates

Add iframe-side tests for the postMessage protocol:
- `LocalHttpAdapter.init()` posts an `engine-request` with `op: "moda-init"` and resolves on matching `engine-response`.
- Failure: `engine-response {ok: false}` rejects the promise with the error message.
- Concurrent calls: two `init()` calls in flight; responses arrive in arbitrary order; each resolves with the right result via request_id matching.

Existing 4 vitest cases should still pass. Expect 4 → 6 or 7.

Plugin tests: same Obsidian-coupling limitation. Skip new plugin tests; document.

## Implementation notes

### State management

The plugin holds the `currentParticleState` across engine-request calls. On `moda-init`, store fresh state. On `moda-compute`/`moda-click`, read + update. Keyed by session_id (which is generated at first init; can be a fixed string for V1's single-iframe assumption).

If iframe reloads (user navigates away and back), it sends a new `moda-init` → plugin resets to fresh state. Document.

### CORS / origin

Iframe loaded from `app://` URL. Plugin runs in Obsidian's main renderer. postMessage between them with `targetOrigin: "*"` (already the existing pattern from prompt 1500). Verify the iframe's `event.source` filter on the plugin side still drops cross-frame chatter (introduced in prompt 0300's hoisting).

### Build pipeline edge cases

- The vite config's `outDir` must be checked-in (a `.gitkeep` or similar) so first-time clones can build without the dir existing.
- If `forge-client-obsidian/assets/iframe/` is gitignored or committed: my read — commit the built artifacts so BRAT installs from the repo work without a build step. Same logic CC used for the engine + vault subdirs in Phase 1. CC verifies and picks.
- Alternative: gitignore the built iframe; require a build step before BRAT distribution. Add to `npm run setup-assets` to make first-time setup one-step. Document either way.

### Existing featured-button protocol

The `iframe-ready` ↔ `featured-snippet` handshake from prompt 1500 stays in place. Phase 2 adds `engine-request` ↔ `engine-response` alongside. Plugin's message listener dispatches by `data.type`.

### Pyodide reuse

Phase 1's `pyodide-host.ts` exposes a singleton `PyodideHost`. Plugin's `moda-view.ts` reuses it across all engine-request calls. No new Pyodide instance per request — the singleton is the point.

### Risks I anticipate

- **Iframe loaded from `app://` URL may not have access to crypto.randomUUID()** (older Obsidian versions). If so, polyfill with a small UUID generator. Likely fine on modern Obsidian (Electron 28+).
- **Vite build under `base: "./"` may break HMR in dev mode.** Verify that `npm run dev` still works for iframe development after the config change.
- **Concurrent engine-requests may interact badly with currentParticleState** if two iframes are open. For V1, assume single iframe. Document.
- **Pyodide call latency.** Each compute round-trip goes JS → postMessage → plugin → Pyodide → reply → postMessage → JS. Should be fast (<50ms for moda compute calls per the spike), but the live 30fps loop's per-tick overhead is now postMessage twice + Pyodide call. Verify in smoke.

## Tests

- Iframe (`npm test` in forge-moda-web): was 4/4; expect 6-7/6-7 with new postMessage tests.
- Plugin (`node --test`): was 42/42; expect 42/42 (engine-request handler is Obsidian-coupled).
- Engine: unchanged.

### Manual smoke (deferred to user — the V1 acceptance test)

1. `cd forge-moda-client/forge-moda-web && npx vite build` — verify the bundle lands in `forge-client-obsidian/assets/iframe/`.
2. `cd ../../forge-client-obsidian && npm run build` — verify the full plugin including iframe/ is packaged.
3. BRAT install (or `cp -R` from local plugin to the test vault's plugin dir). Reload Obsidian.
4. **Stop uvicorn** if it's running. **Stop the Vite dev server** if it's running. Both must be down for the V1 acceptance test.
5. Open the moda simulator in Bluh (`Forge: Open MoDa simulation` or similar command).
6. Expect:
   - Iframe loads from the plugin's bundled assets (no localhost:5173 references in the dev console).
   - Iframe init succeeds (no `localhost:8000/moda/init` fetch — the iframe sends `engine-request moda-init` via postMessage).
   - Plugin logs Pyodide initialization (one-time, takes a few seconds).
   - SimState renders on canvas (water particles, no ink yet).
   - "Run simulation" featured button appears in the iframe header.
7. Click the featured button. Expect:
   - `engine-request compute snippet_id=simulation` postMessage.
   - Plugin runs `simulation` via Pyodide (~8 seconds per the spike).
   - Final-tick state renders on canvas (water + 3 ink dispersions).
   - No HTTP errors anywhere.
8. (Optional) Click the canvas to add ink. Should fire `moda-click` engine-request and update state.
9. **The V1 acceptance criterion:** steps 5-7 work with **no uvicorn AND no Vite dev server running**. If they work, V1 Phase 2 is real.

If smoke fails, paste the symptoms — particularly any `localhost:` errors (means a path didn't migrate), or any postMessage protocol mismatches.

## Out of scope

- music21 + forge-music. Phase 3.
- Transpile service for `/generate`. Separate α prompt.
- Hardcoded snippet-ID set fix (CC's prompt 0800 observation). Separate small prompt.
- User-vault shadow regression. Same.
- Community plugin directory submission.
- Snapshot persistence beyond plugin session.
- Replacing engine HTTP API.
- Tamar physics.

## Report when done

Per protocol 8-section. Specifically:

1. **postMessage protocol shape.** Wire interfaces, `engine-request`/`engine-response`, per-op args.
2. **`moda-view.ts` handler diff.** New `handleEngineRequest`, dispatch, four sub-handlers (init/compute/click/compute).
3. **State management.** How `currentParticleState` is maintained, session_id handling.
4. **Iframe adapter diff.** Before/after of LocalHttpAdapter (or renamed). Postscript: removed localhost:8000 + localhost:5173 references.
5. **Iframe build output.** Vite config diff, build invocation, where the bundle lands.
6. **Plugin iframe-source diff.** moda-view.ts's `iframeSrc()` (or equivalent), dev-mode hook.
7. **Build pipeline summary.** Steps to produce a complete plugin distribution.
8. **Test results.** Iframe pass count, plugin pass count.
9. **Commit SHAs.** forge-client-obsidian, forge-moda-client.
10. **Manual smoke guidance.** The 9-step checklist for user verification.
11. **Any deviation and why.**
12. **One observation.** Anything worth flagging for Phase 3 or follow-ups.

## Commits + push

Two commits, two repos:
- `forge-moda-client` — adapter refactor + vite config + new vitest cases. Push to main.
- `forge-client-obsidian` — engine-request handler, iframe-source switch, build pipeline updates. Push to main.

If a phase sub-step fails (e.g., vite build path doesn't work under `base: "./"`, or the iframe can't fetch its assets via `app://` URL), route to `questions/` with the specific blocker. Don't ship partial.

## Don'ts

- **Don't touch music21 or forge-music.** Phase 3.
- **Don't migrate `/generate` or `/canonicalize`.** Stays HTTP.
- **Don't refactor the engine.** Runs in Pyodide as-is.
- **Don't fix the hardcoded snippet-ID set.** Separate prompt.
- **Don't address the user-vault shadow regression.** Same.
- **Don't break dev mode.** Developers running `npm run dev` for iframe iteration must still work via a settings toggle / env flag.
- **Don't ship to community plugin directory.** BRAT for V1.
- **Don't try to fix the pre-existing `vite.config.ts` tsc error.** Same workaround — `npx vite build`.
- **Don't change the engine's HTTP API.** uvicorn keeps working for native debugging.
- **Don't commit a Pyodide debug build, dev sourcemaps, or any non-production artifact.**
- **Don't proceed past a blocker.** Route to questions/ if the iframe-via-app:// URL or vite-build-base path doesn't resolve. Phase 2's whole reason for existing is the iframe-no-longer-needs-uvicorn flow; partial doesn't help.
