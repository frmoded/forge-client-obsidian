# V1 Phase 1 — plugin hosts Pyodide for engine-compute paths

## Scope

First of three phase-prompts replacing the routed `0700` V1 integration. Single repo (`forge-client-obsidian`), single phase. After this ships and the user smokes it, Phase 2 fires (iframe through plugin), then Phase 3 (music21).

What this prompt delivers:

1. **Bundle Pyodide assets** in `forge-client-obsidian/assets/`:
   - Pyodide 0.29.4 (WASM + JS + stdlib zip) — same version as the spike used.
   - numpy + pyyaml + micropip wheels.
   - Trimmed engine: copy of `forge.core.*` and `forge.moda.types` from `~/projects/forge/forge/` (same subset the spike used at `spikes/pyodide-moda/bundle/forge/`).
   - Curated forge-moda v0.4.16 vault content (copy of `~/projects/forge-moda/`).
   - Asset manifest (a JSON file listing all bundled files for the JS loader to fetch).

2. **`forge-client-obsidian/src/pyodide-host.ts`** — new module:
   - `getInstance()` returns a singleton Pyodide handle; lazy-initializes on first call.
   - On init: loads Pyodide from `assets/pyodide/` (NOT a CDN — V1 works offline).
   - Loads `numpy`, `pyyaml` via `loadPackage`. Loads `micropip` similarly.
   - Mounts the bundled engine + vault into Pyodide's MEMFS at `/bundle/engine` and `/bundle/vaults/forge-moda`. Adds `/bundle/engine` to `sys.path`.
   - Exposes `computeViaEngine(snippet_id: string, args: unknown[], vault_name: string): Promise<{result: unknown, stdout: string}>`.
   - Caches the Pyodide instance for the session.

3. **Swap plugin-direct engine-compute paths to Pyodide.** Identify the call sites in `forge-client-obsidian/src/` that today hit `localhost:8000` for engine compute (not LLM, not moda-iframe-driven endpoints). Likely candidates per the prompt 0700 feedback's enumeration: `/compute`, `/freeze`, `/unfreeze`, `/sync_dependencies` — verify the exact set. Replace HTTP calls with `pyodideHost.computeViaEngine(...)`.

4. **Build pipeline asset copy.** Plugin's existing build (esbuild or similar) probably doesn't ship `assets/` to the installed plugin directory. Add a build step (raw file copy, not JS bundler — Pyodide WASM mustn't go through esbuild) so `assets/` lives in the installed plugin tree on the user's machine.

5. **Test compatibility.** Existing 42/42 plugin tests must still pass. New tests are optional — the engine-Obsidian coupling continues to limit pure-core test coverage. If `pyodide-host.ts` admits any pure-core extraction (e.g., the request-shaping logic), test that part. Otherwise: build + manual smoke is the verification path, same as prior plugin work.

Does NOT:

- Touch the iframe (`forge-moda-client`). Phase 2.
- Touch music21 / forge-music. Phase 3.
- Touch the engine repo. Engine runs in Pyodide as-is.
- Migrate iframe-driven endpoints (`/moda/init`, `/moda/compute`, `/moda/click`). Stays HTTP for now; Phase 2 swaps to postMessage-via-plugin.
- Migrate LLM-driven endpoints (`/generate`, `/canonicalize`). Stays HTTP. When the transpile service (α) ships, those move to it — separate prompt.
- Migrate installer endpoints (`/install`, registry/lookup, etc.). Bundled curated vaults make `/install` unnecessary in V1. Plugin's install UI (if any) can stay HTTP for now; if a user invokes it with no uvicorn, it fails — accept the regression.
- Submit anything to Obsidian's community plugin directory. BRAT distribution for V1.
- Delete the engine's HTTP API. uvicorn keeps working for native debugging; plugin just stops using it for the swapped paths.
- Add settings UI for transpile service token. Comes with the α prompt.

## Why

Per the architecture decision in 0700: plugin hosts Pyodide. CC's 0700 routing was correct — the integration push needs live smoke checkpoints, which means phase-by-phase prompts. This phase establishes the foundation (Pyodide infrastructure in the plugin) and migrates the simplest, plugin-direct compute paths. After user smoke confirms plugin Pyodide works in Obsidian, Phase 2 routes the iframe through it.

After this lands:
- User installs plugin → Pyodide bundle ships with it.
- User Forge-clicks on a snippet → plugin Pyodide executes; uvicorn not needed.
- /generate still requires uvicorn (until transpile service); /moda/* iframe paths still need uvicorn (until Phase 2). Both flagged.

## Files to modify

### New: `forge-client-obsidian/assets/`

```
assets/
  pyodide/
    pyodide.asm.wasm         # ~8 MB
    pyodide.asm.js
    pyodide.js
    python_stdlib.zip        # ~2 MB
    pyodide-lock.json
  wheels/
    numpy-*.whl
    pyyaml-*.whl
    micropip-*.whl
  engine/
    forge/
      __init__.py
      core/
        __init__.py
        executor.py
        serialization.py
        snippet_registry.py
        graph_resolver.py
        snapshots.py
        exceptions.py
        registry.py
      moda/
        __init__.py
        types.py
  vaults/
    forge-moda/
      forge.toml
      *.md
      _meta/_chips.md
  manifest.json              # flat list of all paths under assets/ for the JS loader
```

**Pyodide assets source.** Pull Pyodide 0.29.4 from its standard distribution (npm `pyodide` package or its GitHub release tarball). Same version as the moda spike used. Don't auto-update.

**Engine subset source.** Copy from `~/projects/forge/forge/core/` and `~/projects/forge/forge/moda/`. Don't include `forge.api`, `forge.installer`, `forge.sdk`, or `forge.music` (music comes in Phase 3). Don't include the `try: from forge.music import lib` blocks at module load — Pyodide will degrade gracefully when those imports fail (same behavior as the spike showed).

**Vault source.** Copy from `~/projects/forge-moda/` (v0.4.16). All `.md` files, `forge.toml`, `_meta/_chips.md`. Don't include `.forge/edges/` snapshots (live data, not release content).

**Manifest.** A flat JSON listing every file path under `assets/` for the JS loader to fetch on init. Generated at build time (probably a small `scripts/build-manifest.mjs`).

### New: `forge-client-obsidian/src/pyodide-host.ts`

A self-contained module. Pattern after the spike's `run-spike.mjs` but adapted to Obsidian's plugin asset loading.

Public API:

```typescript
export interface ComputeResult {
  result: unknown;       // Whatever the snippet's compute() returned, after Pyodide → JS conversion.
  stdout: string;        // Captured stdout from print() calls.
}

export class PyodideHost {
  // Initializes on first call; cached for session.
  async getInstance(): Promise<PyodideHostInstance>;
}

export interface PyodideHostInstance {
  computeViaEngine(snippet_id: string, args: unknown[], vault_name: string): Promise<ComputeResult>;
}
```

Implementation outline:

```typescript
async getInstance(): Promise<PyodideHostInstance> {
  if (this.instance) return this.instance;
  if (this.loading) return this.loading;
  this.loading = this._init();
  this.instance = await this.loading;
  this.loading = null;
  return this.instance;
}

private async _init(): Promise<PyodideHostInstance> {
  const pyodide = await loadPyodide({
    indexURL: this.pluginAssetUrl("pyodide/"),
  });
  await pyodide.loadPackage(["numpy", "pyyaml", "micropip"]);
  await this._mountBundle(pyodide);
  pyodide.runPython("import sys; sys.path.insert(0, '/bundle/engine')");
  return new PyodideHostInstanceImpl(pyodide);
}

private async _mountBundle(pyodide) {
  const manifest = await this._fetchAssetJson("manifest.json");
  for (const path of manifest.files) {
    if (path.startsWith("pyodide/") || path.startsWith("wheels/")) continue;  // these are loaded by pyodide itself / micropip later
    const content = await this._fetchAsset(path);
    pyodide.FS.writeFile(`/bundle/${path}`, content);
  }
}

private pluginAssetUrl(relpath: string): string {
  // Research the right primitive — likely `app.vault.adapter.getResourcePath(...)` for non-app:// schemes,
  // or `app://obsidian-plugin/forge-client-obsidian/assets/${relpath}` if Obsidian's plugin-asset URL scheme is supported.
  // Document the choice in the report.
}
```

The `computeViaEngine` implementation: resolve the snippet via the engine's resolver against the named vault (in MEMFS), execute via `exec_python`, capture stdout, return both.

### Modify: `forge-client-obsidian/src/server.ts` (or wherever plugin-direct HTTP calls live)

Identify the engine-compute call sites. Likely names: `compute()`, `freeze()`, `unfreeze()`, `syncDependencies()`. For each:

- Replace `httpFetch('/compute', {snippet_id, ...})` with `pyodideHost.getInstance().then(host => host.computeViaEngine(snippet_id, args, vault))`.
- Keep the existing return shape so downstream callers don't change.
- LLM-driven endpoints (`/generate`, `/canonicalize`) stay HTTP.
- iframe-driven endpoints (`/moda/*`) stay HTTP.

If a single function dispatches multiple endpoints, refactor cleanly — extract the engine-compute paths into their own function, leave the others on HTTP.

### Modify: `forge-client-obsidian/src/main.ts` (or wherever Forge-click handlers live)

Surface the engine-compute results from `pyodideHost` to Forge Output. The existing `OutputView.append(snippet_id, stdout, result)` is the entry point — pass `result.result` and `result.stdout` through.

### Modify: build pipeline

Plugin's existing build (probably esbuild via `npm run build` or `npm run dev`). Add an asset-copy step:

- After the JS bundle builds, copy `assets/**` to the plugin's output directory (usually `main.js`'s sibling).
- Do NOT pipe through esbuild — Pyodide WASM and wheels are not JS, would be corrupted.
- A simple `fs.cp` / `cp -R` in a postbuild script works.
- Update `package.json` scripts: `"build": "esbuild ... && node scripts/copy-assets.mjs"` or similar.

The build's output directory is what BRAT (and Obsidian community plugins) ship. Verify the assets are present in the installed plugin tree.

### Modify: `forge-client-obsidian/manifest.json`

Obsidian's plugin manifest. May need to declare additional assets or update `main` paths. Check Obsidian's plugin-asset conventions — depends on Obsidian version. Document what changes.

## Implementation notes

### Pyodide asset URL resolution

Obsidian's plugin context exposes several APIs for asset paths. The right one for loading Pyodide's WASM binaries from a local plugin install:

- `this.app.vault.adapter.getResourcePath(path)` — returns an Obsidian-internal URL that the browser can fetch.
- `app://obsidian-plugin/...` — Obsidian's internal plugin-asset URL scheme (may or may not be available depending on Obsidian version).
- `file://` — raw filesystem URLs (may be blocked by CSP).

CC researches and picks. Document the choice. If none of these work for Pyodide's WASM loader (which expects a directory URL), route to questions/.

### Obsidian CSP / WASM

Per 0700: untested whether Obsidian's CSP permits WASM in the plugin's main process. Spikes ran Pyodide in Node; the assumption is browser/Electron renderer behaves identically. **If WASM is blocked**, route to questions/ — architecture A is dead and we need to re-decide. Don't silently flip to architecture B.

### Engine subset content

The spike's `bundle/forge/` is the proven-working set. Copy it. Don't try to optimize — that's a separate effort.

### MEMFS write performance

The spike wrote ~70 files into MEMFS at startup. CC measured boot as fast (no explicit timing of the mount step). For V1 the mount is one-shot per session; perf shouldn't matter. But: if the iframe's bundle adds a lot of files (Phase 2), consider lazy mounting then. Not a Phase 1 concern.

### Plugin tests

The 42 existing tests target `*-core.ts` modules without Obsidian imports. `pyodide-host.ts` will be Obsidian-coupled (asset URL resolution, fetch). The pure-core extraction opportunity:
- A `PyodideEngine` class that wraps a raw Pyodide instance and exposes `computeViaEngine` — testable with a mocked Pyodide.
- `PyodideHost` (the singleton manager + Obsidian asset loader) wraps `PyodideEngine` — not testable per existing convention.

Optional. If natural; otherwise skip with the standard flag-it-in-report.

### Forge Output stdout regression check

The 0000 prompt swapped Forge Output to render stdout below result. Verify the new Pyodide-backed path still surfaces stdout correctly (existing engine path returned `{stdout, result}` from `/compute`; new path returns `{result, stdout}` — same fields, just verify the rendering is preserved).

## Tests

- `npm run build` succeeds without errors.
- `node --test src/*.test.ts` → 42/42 plugin tests still pass.
- Build output verifies assets are copied — `ls forge-client-obsidian/dist/` (or wherever) shows `assets/pyodide/`, `assets/engine/`, etc.

### Manual smoke (user runs after this lands)

1. `cd forge-client-obsidian && npm run build`. Confirm output directory contains `assets/`.
2. Install plugin via BRAT in a test vault. Reload Obsidian.
3. Open developer console. No errors should appear on plugin load (Pyodide hasn't loaded yet — lazy).
4. Forge-click on any moda snippet (e.g., `simulation.md` in the bundled forge-moda). Confirm:
   - Console shows Pyodide-loading messages (one-time, takes a few seconds).
   - Forge Output renders the result.
   - Forge Output renders the stdout (if any).
   - No `localhost:8000` fetch errors in the console.
5. Stop uvicorn if it's running. Repeat Forge-click. Confirm it still works.
6. Forge-click on a NON-moda snippet (e.g., one from forge-music if bundled — but Phase 3 hasn't shipped, so this case fails gracefully or returns a "snippet not found" message).
7. Try a `/generate` action — should still hit `localhost:8000` (since LLM endpoints stay HTTP). If uvicorn is down, fails; that's expected for now.

## Out of scope

- Iframe changes. Phase 2.
- music21 + forge-music. Phase 3.
- Transpile service for `/generate`. Separate.
- Snapshot persistence beyond session (MEMFS is in-memory). Real persistence is a follow-up if needed.
- Replacing the Vite dev server workflow for forge-moda-client development (developers can still use it for iteration; this prompt doesn't touch the iframe).
- Dark-theme palette bridge.
- Forge-music authoring vault.

## Report when done

Per protocol 8-section. Specifically:

1. **`assets/` tree.** Directory layout + sizes per subdir + total.
2. **Pyodide URL resolution.** Which API you used, why.
3. **CSP / WASM verification.** Did Obsidian load WASM in the plugin process without blocking? Empirical answer.
4. **`pyodide-host.ts` shape.** Public API, init sequence, MEMFS mount.
5. **Swapped endpoints.** Which call sites changed from HTTP → Pyodide. Endpoints NOT swapped (LLM + iframe + installer) explicitly listed.
6. **Build pipeline diff.** What you added; total install size.
7. **Test results.** Plugin pass count.
8. **Commit SHA.** Single forge-client-obsidian commit.
9. **Manual smoke guidance.** The 7-step checklist for user verification.
10. **Any deviation and why.** Especially any Pyodide-loading or Obsidian-API surprises.
11. **One observation.** Anything worth flagging for Phase 2 or Phase 3.

## Commits + push

Single `forge-client-obsidian` commit. Push to `main`. Phase 2/3 will commit on top.

Suggested message:

```
V1 Phase 1: plugin hosts Pyodide for engine-compute paths

Bundle Pyodide + numpy + pyyaml + curated engine + forge-moda v0.4.16
into assets/. New pyodide-host.ts lazy-loads on first compute request.
Forge Output and other plugin-direct engine paths route through
Pyodide instead of localhost:8000. LLM endpoints (/generate,
/canonicalize) and iframe endpoints (/moda/*) stay HTTP — Phase 2/3
migrate those.

Asset URL scheme: <chosen>. Total install size: ~<N> MB.
Tests: 42/42. Manual smoke deferred to user.
```

## Don'ts

- **Don't touch the iframe.** Phase 2.
- **Don't add music21 or forge-music.** Phase 3.
- **Don't touch the engine.** Per the spikes, it runs in Pyodide as-is.
- **Don't delete the engine's HTTP API.** uvicorn stays alive for native debugging.
- **Don't silently switch to architecture B** (iframe-hosts-Pyodide) if Pyodide doesn't load in the plugin's main process. Route to questions/ with the specific blocker.
- **Don't pipe Pyodide WASM through esbuild.** Raw file copy only.
- **Don't include `.forge/edges/` snapshots in the bundled forge-moda vault.** Live data, not release content.
- **Don't include `forge.api`, `forge.installer`, `forge.sdk`, or `forge.music` in the engine subset.** Phase 3 adds forge.music's lib if it's needed; for Phase 1, moda only.
- **Don't add a transpile-service token settings UI.** Separate prompt.
- **Don't bundle the music21 corpus.** Phase 4 already stripped it; Phase 3 will use the stripped wheel.
- **Don't ship to community plugin directory.** BRAT for V1.
- **Don't break local-dev workflow** for developers who run uvicorn for non-V1 work.
- **Don't proceed past blockers.** If Pyodide-load or asset-URL or CSP fails, route to questions/ with the specific gap. Don't ship partial.
