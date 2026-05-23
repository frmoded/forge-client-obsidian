// V1 Phase 1: plugin hosts Pyodide for engine-compute paths.
//
// Lazy-loads Pyodide from the plugin's bundled assets (NOT a CDN —
// V1 works offline after install). Mounts the curated engine
// (forge.core.* + forge.moda.types) and curated forge-moda vault
// content into Pyodide's MEMFS so `from forge.core.snippet_registry
// import SnippetRegistry` works and the resolver can find moda
// snippets. Exposes `computeViaEngine(snippet_id, args, vault_name)`
// for the plugin's existing engine-compute call sites to invoke
// instead of HTTP-to-localhost:8000.
//
// Architecture decision per V1 prompt 0700: plugin hosts Pyodide,
// NOT the iframe. Same WASM core that the moda + music spikes proved
// works at ~1.2-1.4× native speed. This module is the plugin-side
// foundation; Phase 2 routes the iframe's HTTP calls through here,
// Phase 3 adds music21.
//
// Asset URL resolution: uses Obsidian's `app.vault.adapter.
// getResourcePath(...)` for paths under the installed plugin
// directory. The Obsidian plugin convention exposes plugin files
// at `app://<random-hash>/<vault-relative-path>` and getResourcePath
// returns that URL. Pyodide's `loadPyodide({indexURL})` accepts any
// URL the browser can fetch, so this works for the WASM/JS/stdlib
// load. Untested in Obsidian (live smoke deferred per prompt) —
// flagged in the report.
//
// Vault resolution caveat: V1 Phase 1 resolves snippets ONLY
// against the bundled forge-moda library (mounted at
// /bundle/vaults/forge-moda). User-vault shadowing and user-authored
// snippets in the user's vault root do NOT work in V1 Phase 1.
// This is a deliberate scope cut (see report); the alternative would
// require streaming the user's vault into MEMFS at every compute,
// which is a significant follow-up.

import type { App } from "obsidian";

// Pyodide's runtime type isn't exported as a clean public type; the
// loader returns an `any`-ish object. We narrow what we touch.
export interface PyodideInstance {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runPython: (code: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runPythonAsync: (code: string) => Promise<any>;
  loadPackage: (packages: string | string[]) => Promise<void>;
  FS: {
    mkdir: (path: string) => void;
    writeFile: (path: string, data: string | Uint8Array) => void;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globals: any;
}

export interface ComputeResult {
  // Whatever the snippet's compute() returned, after Pyodide → JS conversion.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: unknown;
  // Captured stdout from print() calls inside the snippet (or its callees).
  stdout: string;
}

/** Wire shape returned by moda init / compute — matches the existing
 *  /moda/init and /moda/compute HTTP responses so the iframe's adapter
 *  consumers don't need to change. The simState carries the per-row
 *  particle list (id/type/x/y/mass); headings/speeds stay internal in
 *  the Python-side ParticleState. */
export interface ModaInitResult {
  sessionId: string;
  state: { tick: number; particles: Array<{ id: number; type: string; x: number; y: number; mass: string }> };
  config: { width: number; height: number; temperatureLevels: ["zero", "low", "medium", "high"] };
  stdout: string;
}

export interface ModaComputeResult {
  state: { tick: number; particles: Array<{ id: number; type: string; x: number; y: number; mass: string }> };
  stdout: string;
}

export interface ModaClickResult {
  ack: true;
  stdout: string;
}

interface AssetManifest {
  pyodide: string[];
  wheels: string[];
  engine: string[];
  vaults: string[];
}

/** Singleton manager. Lazy-loads on first `getInstance()` call; subsequent
 *  calls return the cached handle for the session. The instance lives
 *  as long as the plugin process — re-loading the plugin re-initializes. */
export class PyodideHost {
  private instance: PyodideHostInstance | null = null;
  private loading: Promise<PyodideHostInstance> | null = null;
  private app: App;
  private pluginId: string;

  constructor(app: App, pluginId: string) {
    this.app = app;
    this.pluginId = pluginId;
  }

  /** Resolve a plugin asset path (relative to assets/) to a URL the
   *  browser can fetch. Uses Obsidian's `getResourcePath`. */
  private pluginAssetUrl(relpath: string): string {
    // Plugin install location: <vault>/.obsidian/plugins/<plugin-id>/
    // assets/ sits next to main.js inside that directory.
    const vaultPath = `.obsidian/plugins/${this.pluginId}/assets/${relpath}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.app.vault.adapter as any).getResourcePath(vaultPath);
  }

  /** Initialize Pyodide if not already done, then return the host handle. */
  async getInstance(): Promise<PyodideHostInstance> {
    if (this.instance) return this.instance;
    if (this.loading) return this.loading;
    this.loading = this._init();
    try {
      this.instance = await this.loading;
      return this.instance;
    } finally {
      this.loading = null;
    }
  }

  private async _init(): Promise<PyodideHostInstance> {
    const t0 = performance.now();
    console.log("Forge: initializing Pyodide…");

    // Obsidian's Electron renderer exposes `process.versions.node`
    // (Node integration is enabled), which trips Pyodide's
    // environment detection — Pyodide's check is
    //   typeof process.versions.node == "string" && !process.browser
    // and it then tries `await import("node:url")` to load Node's
    // filesystem helpers. The renderer's CORS layer blocks `node:`
    // URLs ("only chrome, chrome-extension, data, http, https
    // schemes are supported"), so the load fails.
    //
    // Fix: set `process.browser = true` for the duration of the
    // Pyodide module evaluation. That flips Pyodide's IN_NODE
    // constant to false → it takes the browser code path (MEMFS,
    // fetch-based asset loading) — exactly what we want anyway,
    // since we mount everything via FS.writeFile after init.
    //
    // IN_NODE is computed once at module evaluation, so we only
    // need `process.browser` truthy during the import + loadPyodide
    // call. We restore the original value in finally so unrelated
    // code that inspects `process.browser` isn't affected.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proc = (globalThis as any).process;
    const hadBrowser = proc && Object.prototype.hasOwnProperty.call(proc, "browser");
    const prevBrowser = proc?.browser;
    if (proc) proc.browser = true;

    let pyodide: PyodideInstance;
    try {
      // Load Pyodide's bootstrap. The package ships `pyodide.mjs` (ESM)
      // and `pyodide.asm.js` (UMD). We dynamic-import the ESM build
      // from the local plugin URL.
      const pyodideJsUrl = this.pluginAssetUrl("pyodide/pyodide.mjs");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pyodideModule: any = await import(/* @vite-ignore */ pyodideJsUrl);
      const loadPyodide = pyodideModule.loadPyodide;

      const indexURL = this.pluginAssetUrl("pyodide/");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pyodide = await loadPyodide({ indexURL });
    } finally {
      if (proc) {
        if (hadBrowser) proc.browser = prevBrowser;
        else delete proc.browser;
      }
    }
    console.log(`Forge: Pyodide loaded in ${(performance.now() - t0).toFixed(0)}ms`);

    // Fetch the asset manifest to know what to mount.
    const manifestUrl = this.pluginAssetUrl("manifest.json");
    const manifestRes = await fetch(manifestUrl);
    const manifest: AssetManifest = await manifestRes.json();

    // Load stock packages. numpy + pyyaml are Pyodide-stock; they
    // resolve from the indexURL we set above (which points at our
    // local pyodide/ directory). micropip same.
    await pyodide.loadPackage(["numpy", "pyyaml", "micropip"]);
    console.log(`Forge: stock packages loaded in ${(performance.now() - t0).toFixed(0)}ms`);

    // Mount the engine + vaults into MEMFS.
    pyodide.FS.mkdir("/bundle");
    pyodide.FS.mkdir("/bundle/engine");
    pyodide.FS.mkdir("/bundle/vaults");
    for (const relpath of manifest.engine) {
      // relpath is e.g. "engine/forge/core/executor.py"
      const url = this.pluginAssetUrl(relpath);
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
      this._mkdirP(pyodide, "/bundle/" + relpath);
      pyodide.FS.writeFile("/bundle/" + relpath, bytes);
    }
    for (const relpath of manifest.vaults) {
      // relpath is e.g. "vaults/forge-moda/simulation.md"
      const url = this.pluginAssetUrl(relpath);
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
      this._mkdirP(pyodide, "/bundle/" + relpath);
      pyodide.FS.writeFile("/bundle/" + relpath, bytes);
    }
    console.log(`Forge: bundle mounted in ${(performance.now() - t0).toFixed(0)}ms`);

    // Engine on sys.path; build the resolver per bundled vault.
    // Also inject the moda-specific helpers that maintain ParticleState
    // in Python globals between engine-request round-trips (Phase 2):
    // state never crosses the JS↔Python boundary; only its wire
    // serialization (the per-row Particle list) does.
    pyodide.runPython(`
import sys
sys.path.insert(0, "/bundle/engine")

import io
import uuid
from forge.core.snippet_registry import SnippetRegistry
from forge.core.graph_resolver import GraphResolver
from forge.core.executor import extract_python, exec_python

_forge_vault_registries = {}

def _forge_get_resolver(vault_name: str):
    if vault_name not in _forge_vault_registries:
        reg = SnippetRegistry()
        reg.scan(f"/bundle/vaults/{vault_name}")
        _forge_vault_registries[vault_name] = (reg, GraphResolver(reg))
    return _forge_vault_registries[vault_name]

def _forge_run_snippet(snippet_id: str, args, vault_name: str):
    """Run a snippet and return (stdout, result). Action and data
    snippets dispatch via the same path the engine's /compute endpoint
    uses internally."""
    reg, resolver = _forge_get_resolver(vault_name)
    snip = resolver.resolve(snippet_id)
    snippet_type = snip.get("meta", {}).get("type")
    if snippet_type == "action":
        code = extract_python(snip["body"])
        stdout, result = exec_python(
            code, {}, resolver, args=tuple(args),
            vault_path=f"/bundle/vaults/{vault_name}",
            registry=reg, snippet_id=snip["snippet_id"],
        )
    elif snippet_type in ("data", "snapshot"):
        from forge.core.executor import read_data_snippet
        result = read_data_snippet(snip)
        stdout = ""
    else:
        raise ValueError(f"unknown snippet type '{snippet_type}' for {snippet_id!r}")
    return stdout, result

def _forge_compute(snippet_id: str, args, inputs, vault_name: str):
    """Phase 1 entry point — kept for backward compat. inputs is the
    second positional in the old signature; we forward through."""
    _ = inputs
    stdout, result = _forge_run_snippet(snippet_id, args, vault_name)
    return result, stdout

# ---- Moda live-loop helpers (Phase 2) ---------------------------
# State lives in Python globals between engine-request calls. The
# wire serializer (_forge_moda_state_to_wire) mirrors
# forge.api.moda._serialize_particles: per-row Particle dicts, with
# heading/speed/width/height intentionally absent from the wire view.

_forge_moda_state = None      # ParticleState dataclass instance, or None until init
_forge_moda_session_id = None

def _forge_moda_state_to_wire(state):
    """Mirror of forge.api.moda._serialize_particles."""
    ids = state.ids
    types = state.types
    xs = state.xs
    ys = state.ys
    masses = state.masses
    particles = [
        {
            "id": int(ids[i]),
            "type": str(types[i]),
            "x": float(xs[i]),
            "y": float(ys[i]),
            "mass": str(masses[i]),
        }
        for i in range(int(ids.shape[0]))
    ]
    return {"tick": int(state.tick), "particles": particles}

def _forge_moda_init():
    """Run setup("medium") to produce the initial ParticleState. Same
    initial-temperature convention as forge.api.moda._init's hardcoded
    "medium" (the slider's value takes over on the first compute)."""
    global _forge_moda_state, _forge_moda_session_id
    stdout, state = _forge_run_snippet("setup", ("medium",), "forge-moda")
    _forge_moda_state = state
    _forge_moda_session_id = uuid.uuid4().hex
    return {
        "sessionId": _forge_moda_session_id,
        "state": _forge_moda_state_to_wire(state),
        "config": {
            "width": int(state.width),
            "height": int(state.height),
            "temperatureLevels": ["zero", "low", "medium", "high"],
        },
        "stdout": stdout,
    }

def _forge_moda_compute(dt, temperature):
    """Run go(state, dt, temperature). Mirrors forge.api.moda.compute."""
    global _forge_moda_state
    if _forge_moda_state is None:
        raise RuntimeError("moda-compute called before moda-init")
    stdout, new_state = _forge_run_snippet(
        "go", (_forge_moda_state, dt, temperature), "forge-moda",
    )
    _forge_moda_state = new_state
    return {
        "state": _forge_moda_state_to_wire(new_state),
        "stdout": stdout,
    }

def _forge_moda_click(x, y):
    """Run on_mouse_click(state, x, y). Mirrors forge.api.moda.click."""
    global _forge_moda_state
    if _forge_moda_state is None:
        raise RuntimeError("moda-click called before moda-init")
    stdout, new_state = _forge_run_snippet(
        "on_mouse_click", (_forge_moda_state, x, y), "forge-moda",
    )
    _forge_moda_state = new_state
    return {"ack": True, "stdout": stdout}
`);
    console.log(`Forge: engine ready in ${(performance.now() - t0).toFixed(0)}ms`);

    return new PyodideHostInstanceImpl(pyodide);
  }

  /** Create all parent directories for a target file path in Pyodide's MEMFS.
   *  Walks parents and calls FS.mkdir for any that don't yet exist. */
  private _mkdirP(pyodide: PyodideInstance, target: string): void {
    const parts = target.split("/").filter((p) => p.length > 0);
    parts.pop(); // drop the file name; we just want directories
    let cursor = "";
    for (const part of parts) {
      cursor += "/" + part;
      try {
        pyodide.FS.mkdir(cursor);
      } catch {
        // Already exists — Pyodide's FS.mkdir throws on duplicate.
      }
    }
  }
}

/** The handle returned by `PyodideHost.getInstance()`. Generic compute
 *  + the moda fast-path live here; Phase 2 added the moda methods. */
export interface PyodideHostInstance {
  computeViaEngine(snippet_id: string, args: unknown[], vault_name: string): Promise<ComputeResult>;
  modaInit(): Promise<ModaInitResult>;
  modaCompute(dt: number, temperature: string): Promise<ModaComputeResult>;
  modaClick(x: number, y: number): Promise<ModaClickResult>;
}

class PyodideHostInstanceImpl implements PyodideHostInstance {
  private pyodide: PyodideInstance;

  constructor(pyodide: PyodideInstance) {
    this.pyodide = pyodide;
  }

  /** Generic compute via the engine's resolver + executor. Used by
   *  the plugin's Forge-click paths (Phase 1) and the iframe's
   *  featured-button via engine-request op="compute" (Phase 2). */
  async computeViaEngine(snippet_id: string, args: unknown[], vault_name: string): Promise<ComputeResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.pyodide.globals.set("_forge_args_in", args as any);
    this.pyodide.globals.set("_forge_snippet_id", snippet_id);
    this.pyodide.globals.set("_forge_vault_name", vault_name);
    const tuple = this.pyodide.runPython(`
_forge_compute(_forge_snippet_id, list(_forge_args_in or []), {}, _forge_vault_name)
`);
    const result = tuple.get(0);
    const stdout = tuple.get(1);
    const resultJs = this._unwrap(result);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tuple.destroy?.();
    return { result: resultJs, stdout: String(stdout ?? "") };
  }

  /** Moda fast-path: setup → ParticleState stored in Python globals;
   *  return the wire-shape init response. Mirrors the existing
   *  /moda/init HTTP response so the iframe consumer doesn't change. */
  async modaInit(): Promise<ModaInitResult> {
    const proxy = this.pyodide.runPython(`_forge_moda_init()`);
    return this._unwrap(proxy) as ModaInitResult;
  }

  /** Moda fast-path: go(state, dt, temperature). State is read +
   *  updated in Python globals; only the wire-shape result crosses
   *  the JS boundary. */
  async modaCompute(dt: number, temperature: string): Promise<ModaComputeResult> {
    this.pyodide.globals.set("_forge_in_dt", dt);
    this.pyodide.globals.set("_forge_in_temperature", temperature);
    const proxy = this.pyodide.runPython(`_forge_moda_compute(_forge_in_dt, _forge_in_temperature)`);
    return this._unwrap(proxy) as ModaComputeResult;
  }

  /** Moda fast-path: on_mouse_click(state, x, y). Updates state in
   *  Python globals; returns the ack envelope. */
  async modaClick(x: number, y: number): Promise<ModaClickResult> {
    this.pyodide.globals.set("_forge_in_x", x);
    this.pyodide.globals.set("_forge_in_y", y);
    const proxy = this.pyodide.runPython(`_forge_moda_click(_forge_in_x, _forge_in_y)`);
    return this._unwrap(proxy) as ModaClickResult;
  }

  /** Convert a Pyodide PyProxy to a plain JS value, destroying the
   *  proxy to release the Python-side reference. Primitives pass
   *  through unchanged; dicts come out as plain Objects. */
  private _unwrap(value: unknown): unknown {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = value as any;
    if (v && typeof v.toJs === "function") {
      const out = v.toJs({ dict_converter: Object.fromEntries });
      v.destroy?.();
      return out;
    }
    return value;
  }
}

// Module-level singleton accessor — mirror of the existing setter
// pattern in server.ts. main.ts constructs the host once on plugin
// onload and calls setPyodideHost; moda-view.ts reaches for it via
// getPyodideHost() rather than threading the plugin instance through
// the ItemView constructor.
let _moduleSingleton: PyodideHost | null = null;

export function setPyodideHostSingleton(host: PyodideHost | null): void {
  _moduleSingleton = host;
}

export function getPyodideHost(): PyodideHost | null {
  return _moduleSingleton;
}
