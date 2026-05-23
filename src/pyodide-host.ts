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

    // Load Pyodide's bootstrap. The package ships `pyodide.mjs` (ESM)
    // and `pyodide.asm.js` (UMD). We dynamic-import the ESM build
    // from the local plugin URL.
    const pyodideJsUrl = this.pluginAssetUrl("pyodide/pyodide.mjs");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pyodideModule: any = await import(/* @vite-ignore */ pyodideJsUrl);
    const loadPyodide = pyodideModule.loadPyodide;

    const indexURL = this.pluginAssetUrl("pyodide/");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pyodide: PyodideInstance = await loadPyodide({ indexURL });
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
    pyodide.runPython(`
import sys
sys.path.insert(0, "/bundle/engine")

import io
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

def _forge_compute(snippet_id: str, args, inputs, vault_name: str):
    reg, resolver = _forge_get_resolver(vault_name)
    snip = resolver.resolve(snippet_id)
    snippet_type = snip.get("meta", {}).get("type")
    if snippet_type == "action":
        code = extract_python(snip["body"])
        stdout, result = exec_python(
            code, inputs, resolver, args=tuple(args),
            vault_path=f"/bundle/vaults/{vault_name}",
            registry=reg, snippet_id=snip["snippet_id"],
        )
    elif snippet_type in ("data", "snapshot"):
        from forge.core.executor import read_data_snippet
        result = read_data_snippet(snip)
        stdout = ""
    else:
        raise ValueError(f"unknown snippet type '{snippet_type}' for {snippet_id!r}")
    return result, stdout
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

/** The handle returned by `PyodideHost.getInstance()`. */
export interface PyodideHostInstance {
  computeViaEngine(snippet_id: string, args: unknown[], vault_name: string): Promise<ComputeResult>;
}

class PyodideHostInstanceImpl implements PyodideHostInstance {
  private pyodide: PyodideInstance;

  constructor(pyodide: PyodideInstance) {
    this.pyodide = pyodide;
  }

  async computeViaEngine(snippet_id: string, args: unknown[], vault_name: string): Promise<ComputeResult> {
    // Marshal args + inputs through Pyodide's JS↔Python bridge. The
    // engine's exec_python accepts a tuple of positionals and a dict
    // of kwargs; we pass empty inputs for now (Phase 1 just exercises
    // the positional-args path).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.pyodide.globals.set("_forge_args_in", args as any);
    this.pyodide.globals.set("_forge_snippet_id", snippet_id);
    this.pyodide.globals.set("_forge_vault_name", vault_name);

    const tuple = this.pyodide.runPython(`
_forge_compute(_forge_snippet_id, list(_forge_args_in or []), {}, _forge_vault_name)
`);
    // tuple is a PyProxy of (result, stdout). Convert to plain JS.
    const result = tuple.get(0);
    const stdout = tuple.get(1);
    // PyProxies for non-primitive results need explicit toJs(); strings come through.
    let resultJs: unknown = result;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (result && typeof (result as any).toJs === "function") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resultJs = (result as any).toJs({ dict_converter: Object.fromEntries });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (result as any).destroy?.();
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tuple.destroy?.();
    return { result: resultJs, stdout: String(stdout ?? "") };
  }
}
