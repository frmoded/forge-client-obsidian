# V1 Pyodide plugin integration — moda + music shipping path

## Scope

The big V1 push. Takes the Pyodide spike's research and turns it into a shippable plugin. Goal: install Obsidian plugin → Pyodide boots inside the plugin → moda simulation runs end-to-end with no localhost server, no Python on user's machine, no HTTP.

Four coupled phases. Each its own commit. If a phase fails, ship the earlier ones and route the prompt to `questions/` with the specific blocker.

1. **Plugin hosts Pyodide.** Bundle Pyodide assets + numpy + pyyaml + curated engine subset + curated forge-moda vault content into `forge-client-obsidian/assets/`. Plugin lazy-loads Pyodide on first compute request. Expose a `computeViaEngine(snippet_id, args, vault)` method on the plugin. Plugin's existing Forge Output path uses it instead of HTTP-to-localhost:8000.
2. **Iframe routes engine calls through plugin.** Iframe's `LocalHttpAdapter` stops making HTTP calls — `computeSnippet` and the `/moda/*`-equivalent paths postMessage to the plugin; plugin invokes `computeViaEngine`; result postMessages back to iframe. Iframe loads its static bundle from the plugin's assets, not from `localhost:5173`.
3. **Add music21 + curated forge-music.** Bundle music21 wheel and forge-music v0.3.0 vault content. Plugin's Pyodide init also installs music21 via `micropip`. Forge-click on `form.md` produces MusicXML via the same engine API; renders in Forge Output via Verovio (already wired).
4. **Trim music21 wheel.** `micropip.install("music21", deps=False)` + explicit `requests`, plus a corpus-stripped wheel vendored locally. Target ~22MB total plugin asset size (vs ~40MB unstripped).

After this lands, V1 deployment story is: install the Obsidian plugin → Pyodide boots → both moda and music vaults work, no localhost, no Python.

Does NOT:

- Build the hosted transpile service (option α for `/generate`). Separate prompt; this V1 is consume-only.
- Implement plugin settings UI for API token. No `/generate` path in this prompt.
- Add new authoring affordances (chip palettes for forge-music, etc.).
- Submit to Obsidian's community plugin directory. BRAT install during this V1; community-directory submission is a separate workflow.
- Touch the engine's HTTP layer (`forge/api/server.py`, `forge/api/moda.py`) — uvicorn keeps existing in case anyone wants to run native locally for debugging. This prompt makes the plugin stop using it; doesn't delete it.
- Refactor the engine itself. Per the spike, engine runs in Pyodide as-is.
- Create the forge-music authoring vault.
- Migrate `.forge/edges/` snapshot handling beyond what works today.

## Why

Per the music21 spike, both moda and music run cleanly in Pyodide (1.20×–1.44× native, no feature gaps in compose-and-serialize). Combined verdict from the two spikes: **single Obsidian plugin, two domain vaults, single Pyodide runtime, no Homebrew, no Python on the user's machine.**

This prompt is the engineering work that realizes that verdict. After it, V1 ships via BRAT (and eventually Obsidian's community plugin directory).

## Architectural decision (called out so CC can push back)

**Plugin hosts Pyodide, not iframe.**

Two viable architectures the spike data supports:

- **A. Plugin hosts Pyodide.** Plugin loads Pyodide on startup (lazy on first compute request). Both plugin-side ops (Forge Output for direct Forge-clicks) and the iframe (via postMessage) route through plugin's Pyodide.
- **B. Iframe hosts Pyodide.** Plugin postMessages to iframe for engine work. Requires iframe to be loaded for any engine op.

Picked **A** because:
- Music demo path (Forge-click on `form.md` → MusicXML in Forge Output) is a plugin-level operation, not iframe-level. Tamar needs this path. With B, the iframe would need to be open for music to work — confusing.
- Single Pyodide instance, no duplication.
- Plugin's main process is a fine Pyodide host (Obsidian uses Electron renderer; Pyodide loads normally there).
- iframe stays a thin presentation surface — easier to reason about.

If CC finds a concrete reason A doesn't work (e.g., Obsidian sandbox doesn't allow WASM in plugin main process), document it and route to `questions/`. **Don't silently switch to architecture B.**

## Files to modify

### Phase 1 — plugin Pyodide infrastructure

**`forge-client-obsidian/assets/`** (new directory tree):

```
assets/
  pyodide/                  # Pyodide WASM + JS + stdlib zip
    pyodide.asm.wasm
    pyodide.asm.js
    pyodide.js
    python_stdlib.zip
    pyodide-lock.json
  wheels/                   # Python wheels
    numpy-*.whl
    pyyaml-*.whl
    micropip-*.whl
  vaults/
    forge-moda/             # forge-moda v0.4.16 content (the curated subset to ship)
      forge.toml
      *.md
      _meta/_chips.md
  engine/                   # Trimmed engine: forge.core.*, forge.moda.types
    forge/
      __init__.py
      core/...
      moda/types.py
```

Pyodide assets: pull from the same version the spike used (`0.29.4`). Vendor locally rather than CDN — V1 must work offline after install.

Source for the engine subset: copy from `~/projects/forge/forge/core/` and `~/projects/forge/forge/moda/`. Same shape as the spike's `bundle/forge/`. Skip `forge.api`, `forge.installer`, `forge.sdk`.

Source for the moda vault: copy from `~/projects/forge-moda/` (v0.4.16).

**Plugin loader (`forge-client-obsidian/src/pyodide-host.ts`** new file):

A small module that:
1. Lazy-loads Pyodide on first call to `getInstance()`. Caches the loaded instance for the session.
2. On first init: loads `numpy`, `pyyaml`, `micropip` from local wheels (`pyodide.loadPackage(["numpy", "pyyaml"])`, etc.).
3. Mounts the bundled engine + vault content into Pyodide's MEMFS at `/bundle`. Adds `/bundle/engine` to `sys.path`.
4. Returns a handle exposing `computeViaEngine(snippet_id, args, vault_name)` that:
   - Looks up the snippet via the resolver against the named bundled vault.
   - Executes via `exec_python`.
   - Returns `{result, stdout}` (raw Python values, JS converts via Pyodide bridge).

This is the engine host. All plugin engine ops route through it.

**Plugin Forge Output path:**

Existing code calls something like `httpFetch('/compute', {snippet_id, ...})`. Replace with `pyodideHost.computeViaEngine(snippet_id, args, vault)`. Surface stdout + result to Forge Output via existing `append()` (the prompt 0300 work made this clean).

Drop the `localhost:8000` HTTP path. If a developer wants to use uvicorn for native debugging, they can — but the plugin doesn't talk to it anymore. (Engine HTTP API stays alive; just unused by V1 plugin.)

**Build pipeline:**

Plugin's build (esbuild / rollup / whatever) needs to copy `assets/` into the installed plugin directory at build time. Pyodide assets are large (~10MB); shouldn't go through the JS bundler — should be raw file copies.

Plugin's `manifest.json` may need to declare `pythonAssets` or similar so Obsidian copies them on install. Investigate Obsidian's plugin-asset conventions; document choice.

### Phase 2 — iframe routes through plugin

**`forge-moda-client/forge-moda-web/src/types/wire.ts` (or wherever the adapter types live):**

Add postMessage shapes:
- `{type: "engine-request", request_id, snippet_id, args, vault_name}` — iframe → plugin
- `{type: "engine-response", request_id, ok: true, result, stdout}` — plugin → iframe (success)
- `{type: "engine-response", request_id, ok: false, error}` — plugin → iframe (failure)

`request_id` is a UUID per call so responses can be correlated when multiple requests are in flight.

**`forge-moda-client/forge-moda-web/src/adapters/LocalHttpAdapter.ts` (or equivalent):**

`computeSnippet(snippet_id, vault_path)` no longer calls `fetch('/compute', ...)`. Instead:
1. Generate a `request_id`.
2. postMessage `engine-request` to `window.parent`.
3. Await a response with matching `request_id` (resolve via a promise stored in a request-table).
4. Return the result shape the existing iframe consumer expects.

Same refactor for any other HTTP call the iframe makes (`/moda/init`, `/moda/compute`, `/moda/click`).

**Plugin side (`forge-client-obsidian/src/moda-view.ts`):**

Existing message handler already dispatches `iframe-ready`, `featured-snippet`, `compute-result`. Add an `engine-request` branch:
1. Validate the payload.
2. Call `pyodideHost.computeViaEngine(...)` from Phase 1.
3. postMessage the response back to the iframe's `contentWindow` with the same `request_id`.

**Iframe loading source:**

Today the moda view loads iframe from `http://localhost:5173`. Change to load from `app://obsidian-plugin/forge-client-obsidian/iframe/index.html` (or whatever Obsidian's local-asset URL scheme is — investigate). The iframe's built static bundle lives at `forge-client-obsidian/assets/iframe/` (built from forge-moda-client's vite build).

Tests:

- Iframe vitest: 4 → 5+. Add a test that `computeSnippet` postMessages and resolves on response. Use the test harness's parent-window stub.
- Plugin: same Obsidian-coupling limitation as before; the engine-request dispatch is in `moda-view.ts`. Skip new tests there per prior precedent; flag.

### Phase 3 — add music21 + curated forge-music

**`forge-client-obsidian/assets/wheels/music21-*.whl`** — copy or fetch.

**`forge-client-obsidian/assets/vaults/forge-music/`** — copy from `~/projects/forge-music/` (v0.3.0, the content shipped by prompt 0600).

**`pyodide-host.ts`** updates:

On Pyodide init, also `await micropip.install('music21')` (full deps for Phase 3; trim in Phase 4). Resolves wheel from the local `assets/wheels/` URL.

The engine subset already includes `forge.core.executor` which lazy-imports music21 — no engine code change needed. The `_MUSIC21_NAMES` injection becomes available because music21 successfully imports.

Phase 3 verification:
- Plugin's `computeViaEngine("form", [], "forge-music")` returns a MusicXML payload.
- Forge-click on `form.md` from the bundled forge-music vault (resolution via A4) lands MusicXML in Forge Output.
- Verovio renders it (already wired).

### Phase 4 — trim music21 wheel

Goal: drop ~10MB unused-deps + ~12MB corpus → target ~22MB total bundle.

**`pyodide-host.ts`:**
- Replace `micropip.install("music21")` with `micropip.install("music21", deps=False)` + `await micropip.install("requests")`.

**`forge-client-obsidian/assets/wheels/music21-stripped-*.whl`** (new):

Vendor a corpus-stripped music21 wheel. Build steps:
1. Download music21's official wheel from PyPI.
2. Open the wheel (it's a zip).
3. Remove the `music21/corpus/` directory (large, not used).
4. Update the wheel's RECORD file (entry list + hashes).
5. Re-zip with the standard wheel structure.

A small build script in `assets/wheels/build-music21-stripped.sh` (or `.py`) is acceptable. Document the script's exact transformation in the report.

Re-measure: report bundle size before and after trim (gzipped over the wire).

Verification: same as Phase 3 — `form.md` runs end-to-end via the trimmed wheel. If anything breaks, route to `questions/`.

## Implementation notes

### Pyodide loading inside a plugin

Pyodide's standard distribution loads via a JS bootstrap that fetches WASM + stdlib. In a plugin context, the bootstrap should be configured to load from local plugin URLs, not CDN:

```typescript
const pyodide = await loadPyodide({
  indexURL: pluginAssetUrl("pyodide/"),  // points at assets/pyodide/
});
```

`pluginAssetUrl()` resolves the plugin's installed asset path. Use Obsidian's plugin API (e.g., `this.app.vault.adapter.getResourcePath(...)` for non-app:// schemes, or document the right primitive).

### MEMFS mount

Vault content and engine code need to be in Pyodide's filesystem so imports + resolution work. On init:

```typescript
const engineFiles = await fetchManifest("engine/manifest.json");
for (const path of engineFiles) {
  const content = await fetch(pluginAssetUrl(`engine/${path}`));
  pyodide.FS.writeFile(`/bundle/engine/${path}`, await content.text());
}
// similar for vaults/
pyodide.runPython("import sys; sys.path.insert(0, '/bundle/engine')");
```

A `manifest.json` listing all files in the bundle is the cleanest way for the JS side to know what to fetch. Generate at build time.

### Request lifecycle

The iframe's postMessage protocol needs request IDs to handle concurrent calls. Pattern:

```typescript
class EngineAdapter {
  private pendingRequests = new Map<string, {resolve, reject}>();

  async computeSnippet(...) {
    const id = crypto.randomUUID();
    const promise = new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {resolve, reject});
    });
    window.parent.postMessage({type: "engine-request", request_id: id, ...}, "*");
    return promise;
  }

  onMessage(event) {
    if (event.data.type === "engine-response") {
      const handler = this.pendingRequests.get(event.data.request_id);
      if (handler) {
        this.pendingRequests.delete(event.data.request_id);
        event.data.ok ? handler.resolve(...) : handler.reject(...);
      }
    }
  }
}
```

### Asset bundle size sanity check

After Phase 4, measure total plugin install size (everything in `forge-client-obsidian/`'s build output). Report it. Target ~22MB compressed. If it lands meaningfully higher, flag.

### Risks I anticipate

- **Obsidian's CSP / sandbox.** May not allow loading WASM in the plugin's main process. If so, route to `questions/`. Architecture A would need to flip to B (iframe hosts Pyodide); not impossible but a bigger refactor than this prompt covers.
- **Plugin asset paths.** Different Obsidian APIs for `app://` vs `file://` vs `getResourcePath`. CC researches; documents.
- **Pyodide bootstrap config.** Loading from local URLs (not CDN) may need workarounds for the indexURL pattern. Pyodide docs cover this.
- **Build pipeline.** Plugin's existing build might not have an asset-copy step. Add one; document choice.

## Tests

- **Engine (forge):** unchanged. Was 406 passing; still 406.
- **Plugin (forge-client-obsidian):** 42/42; expect 42 (new code is Obsidian-coupled).
- **Iframe (forge-moda-client):** 4 → 5 or 6 (new postMessage tests).

### Manual smoke (deferred to user post-install)

1. Build the plugin (`npm run build` or whatever the workflow is). Note total asset size.
2. Install via BRAT in Bluh (or a fresh test vault).
3. Reload Obsidian. Confirm Pyodide loads silently (no errors in dev console).
4. Open moda iframe. Confirm "Run simulation" button appears.
5. Click. Confirm simulation runs (canvas updates with particles); no `localhost:8000` errors in the console; no fetch to that host.
6. Forge-click on `form.md` (from the bundled forge-music). Confirm MusicXML rendering in Forge Output via Verovio.
7. Confirm everything works with uvicorn NOT running on the user's machine.

## Out of scope

- Hosted `/generate` transpile service. Separate prompt; depends on hosting + auth design.
- Settings UI for API token.
- Obsidian community plugin directory submission.
- Adding new vault content beyond forge-moda v0.4.16 + forge-music v0.3.0 (the curated set).
- Tamar physics conversation.
- Replacing the Vite dev server workflow entirely (developers can still use it for iteration; the plugin just doesn't depend on it).
- Snapshot persistence across plugin reloads (MEMFS is in-memory; snapshots are session-lived). Real persistence is a follow-up if needed.
- Dark-theme palette bridge (separately deferred).

## Report when done

Per protocol 8-section CC report, expanded for the larger scope:

### Phase 1 (plugin Pyodide)

1. **`assets/` directory shape.** Tree, sizes per subdir, total.
2. **`pyodide-host.ts` shape.** Init sequence, MEMFS mount, exposed API.
3. **Forge Output integration.** How the existing path swapped from HTTP to Pyodide.
4. **Asset copy in build pipeline.** What you added; whether it's a build-time step or an install-time step.

### Phase 2 (iframe through plugin)

5. **postMessage protocol.** Request-id mechanism, success/failure shapes.
6. **Iframe loading source.** What URL the moda view now loads; how it resolves.
7. **Adapter refactor.** Before/after of the LocalHttpAdapter.
8. **Test diff.** Vitest cases added.

### Phase 3 (music21)

9. **music21 install path.** Wheel source, `micropip.install` invocation.
10. **forge-music vault integration.** Mount + verification.
11. **Verovio rendering verification.** Smoke (or "deferred to user").

### Phase 4 (trim)

12. **Wheel-strip script.** Where it lives, what it does.
13. **Bundle size before and after.** Compressed and uncompressed.
14. **deps=False vs full-deps verification.** Confirm music21 still imports + form snippet still runs.

### Common

15. **Per-phase status.** Shipped / partial / blocked.
16. **Commit SHAs.** forge-client-obsidian, forge-moda-client. Possibly forge if anything trimmed there.
17. **Test results.** Engine, plugin, iframe.
18. **Manual smoke guidance.** The 7-step checklist for user verification.
19. **Any deviation and why.** Especially around architecture A vs B; risks I named.
20. **One observation.** Anything that surfaces during implementation that's worth a follow-up — bundle size optimizations, lazy-load opportunities, Obsidian API quirks.

## Commits + push

Two repos primarily:
- `forge-client-obsidian` — most of the work. Probably 1-2 commits (Phase 1 + Phase 2 could be one if interleaved; Phase 3 + Phase 4 could share a commit).
- `forge-moda-client` — adapter refactor, postMessage protocol, vitest updates. One commit.

Push both to `main`.

If a phase fails, ship preceding phases via their own commits; route this prompt to `questions/` with the specific blocker.

## Don'ts

- **Don't silently switch architecture A → B.** If architecture A doesn't work, document why and route to `questions/`.
- **Don't bundle the hosted transpile service.** Separate prompt; this is consume-only.
- **Don't add a settings UI for API token.** Same.
- **Don't refactor the engine.** Per the spikes, it runs in Pyodide as-is.
- **Don't delete the engine's HTTP API.** Uvicorn still works for native debugging. Plugin just stops using it.
- **Don't try to fix the pre-existing `vite.config.ts` tsc error.** Same workaround as before — `npx vite build`. Flag if it actively blocks.
- **Don't ship music21 with the corpus.** Phase 4 strips it; if Phase 4 fails, ship Phases 1-3 and let the user smoke against the larger bundle while we sort out Phase 4.
- **Don't touch forge-moda or forge-music vault content.** Bundle them; don't edit them.
- **Don't change the bundled engine code from what `~/projects/forge/forge/core/`/`forge/moda/` has today.** If something needs changing for Pyodide compat, route to questions/.
- **Don't ship to community plugin directory.** BRAT distribution only for V1.
- **Don't bundle music21 corpus, MIDI export deps, Lilypond integration, or matplotlib.** All confirmed unused in the spike's verdict.
- **Don't break local-dev workflow for developers who run uvicorn.** Their setup still functions; the plugin just doesn't talk to uvicorn anymore.
- **Don't proceed past a phase failure** with downstream phases. Each phase depends on the previous; failure isolates rather than cascades.
