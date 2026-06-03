// V1 Phase 1: plugin hosts Pyodide for engine-compute paths.
//
// Lazy-loads Pyodide from the plugin's bundled assets (NOT a CDN —
// V1 works offline after install). Mounts the curated engine
// (forge.core.* + forge.moda.types) and curated forge-moda vault
// content into Pyodide's MEMFS so `from forge.core.snippet_registry
// import SnippetRegistry` works and the resolver can find moda
// snippets. Exposes `computeViaEngine(snippet_id, args)` (v0.2.9
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

// V1 user-vault mount: bundled-library subdirectory names. Files
// under these top-level directories in the user's vault are SKIPPED
// when mounting into MEMFS — the plugin ships its own trusted copy
// of each library, and the user's local install (e.g., a stale
// version from a prior `Forge: install …`) is intentionally
// ignored. Bundled wins. Add new libraries here when Phase 3+ ship
// (forge-music is next).
// v0.2.15: forge-music joins forge-moda as a bundled library. Both
// ship as plugin assets and resolve via the same A4 / A5.1 path; no
// install step needed. Keep this set in sync with the Python-side
// _BUNDLED_LIBRARIES_V1 list (around line ~344) AND with
// forge-action.ts:installVault's BUNDLED set — three copies, all
// load-bearing. v1.0 audit (task #19 in v1-deployment-plan) collapses
// them into one shared constant.
const BUNDLED_LIBRARY_NAMES = new Set<string>(["forge-moda", "forge-music"]);

// Frontmatter `type:` values that mark a file as a Forge snippet
// rather than a plain note. The resolver only registers files whose
// type is one of these; we mirror that filter at mount time to
// avoid uselessly streaming plain notes into MEMFS.
const FORGE_SNIPPET_TYPES = new Set<string>(["action", "data", "snapshot"]);

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
   *  browser can fetch. Uses Obsidian's `getResourcePath`, with the
   *  cache-busting query string stripped.
   *
   *  Why strip the query: Obsidian's `getResourcePath` appends
   *  `?<timestamp>` for cache invalidation. That's fine for one-shot
   *  fetches, but Pyodide's `loadPyodide({indexURL})` concatenates
   *  the indexURL with subsequent filenames (e.g.,
   *  `pyodide-lock.json`, `pyodide.asm.wasm`). The result becomes
   *  `assets/pyodide/?TIMESTAMP/pyodide-lock.json` — and Obsidian's
   *  URL resolver treats everything after `?` as the query string,
   *  so the actual fetched path becomes `assets/pyodide/` (a
   *  directory), returning 404. Pyodide can't load its lockfile,
   *  stdlib, or wasm.
   *
   *  Solution: strip the query. Pyodide's URL concatenation then
   *  produces clean paths like `assets/pyodide/pyodide-lock.json`.
   *  The cache-buster's only job was cache invalidation; for our
   *  static read-only assets that's not needed (plugin reload
   *  rebuilds the bundle anyway). */
  private pluginAssetUrl(relpath: string): string {
    // Plugin install location: <vault>/.obsidian/plugins/<plugin-id>/
    // assets/ sits next to main.js inside that directory.
    const vaultPath = `.obsidian/plugins/${this.pluginId}/assets/${relpath}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fullUrl: string = (this.app.vault.adapter as any).getResourcePath(vaultPath);
    // Strip everything from the first `?` onward — the cache-buster.
    const q = fullUrl.indexOf("?");
    return q >= 0 ? fullUrl.slice(0, q) : fullUrl;
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
    // local pyodide/ directory). v0.2.27 dropped micropip — we used
    // to load it for future-proofing, but the music21-bundling work
    // proved micropip pulls transitive deps via loadPackage (calling
    // out to indexURL → the CDN in dev, 404 in production-no-network)
    // even with deps=False. We vendor wheels directly under
    // assets/wheels/ and extract them via stdlib zipfile in the
    // runPython block below.
    await pyodide.loadPackage(["numpy", "pyyaml"]);
    console.log(`Forge: stock packages loaded in ${(performance.now() - t0).toFixed(0)}ms`);

    // Mount the engine + user vault + bundled libraries into MEMFS.
    //
    // V1 layout (post-shadow-fix):
    //   /bundle/engine/                  forge.core.* + forge.moda.types
    //   /bundle/user-vault/              user's active vault (root only)
    //     forge.toml                     user's deps declaration
    //     <user shadows>.md              user's authoring snippets at root
    //     forge-moda/                    BUNDLED library (NOT user's local copy)
    //       setup.md, go.md, ...
    //
    // The user-vault is the resolver's authoring vault. A4 + A5.1
    // resolve shadows naturally: a user's root-level shadow takes
    // precedence over the bundled library subdirectory copy. The
    // user's OWN forge-moda/ subdir (if they have one from a stale
    // /install) is intentionally skipped — V1 ships self-contained.
    pyodide.FS.mkdir("/bundle");
    pyodide.FS.mkdir("/bundle/engine");
    pyodide.FS.mkdir("/bundle/user-vault");
    for (const relpath of manifest.engine) {
      // relpath is e.g. "engine/forge/core/executor.py"
      const url = this.pluginAssetUrl(relpath);
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
      this._mkdirP(pyodide, "/bundle/" + relpath);
      pyodide.FS.writeFile("/bundle/" + relpath, bytes);
    }

    // v0.2.27: mount vendored wheels (music21 + minimum deps) into
    // /bundle/wheels/. The runPython block below extracts them into
    // /bundle/site-packages/ via stdlib zipfile. No micropip; no
    // network. See music21-bundle.test.ts for the verification harness.
    if (manifest.wheels && manifest.wheels.length > 0) {
      pyodide.FS.mkdir("/bundle/wheels");
      pyodide.FS.mkdir("/bundle/site-packages");
      for (const relpath of manifest.wheels) {
        // relpath is e.g. "wheels/music21-8.3.0-py3-none-any.whl"
        const url = this.pluginAssetUrl(relpath);
        const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
        this._mkdirP(pyodide, "/bundle/" + relpath);
        pyodide.FS.writeFile("/bundle/" + relpath, bytes);
      }
      console.log(`Forge: ${manifest.wheels.length} wheels mounted (music21 + deps).`);
    }

    // Step 1: walk the user's active vault. Filter to Forge-shaped
    // markdown files (frontmatter `type: action | data | snapshot`).
    // Skip files under bundled-library subdirs — those would shadow
    // the trusted bundled copy below.
    //
    // The metadata cache is populated by the time the first compute
    // request fires (this _init is lazy; plugin onload + layout-ready
    // settle long before the user clicks anything). If a stragglers
    // file's frontmatter isn't yet in the cache it gets skipped this
    // session; iframe reload picks it up next time.
    const userFiles = this.app.vault.getMarkdownFiles();
    let userMounted = 0;
    for (const file of userFiles) {
      const topDir = file.path.split("/")[0];
      if (BUNDLED_LIBRARY_NAMES.has(topDir)) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fm: any = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (!fm || !FORGE_SNIPPET_TYPES.has(fm.type)) continue;
      const content = await this.app.vault.read(file);
      const target = "/bundle/user-vault/" + file.path;
      this._mkdirP(pyodide, target);
      pyodide.FS.writeFile(target, content);
      userMounted++;
    }

    // Step 2: mount user's forge.toml if present. The resolver reads
    // this for `domains` declarations, which gate which prompt-
    // fragment library is available to snippet generation. Optional —
    // missing forge.toml is fine for compute-only V1 paths.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adapter = this.app.vault.adapter as any;
      if (await adapter.exists?.("forge.toml")) {
        const toml = await adapter.read("forge.toml");
        pyodide.FS.writeFile("/bundle/user-vault/forge.toml", toml);
      }
    } catch (e) {
      console.warn("Forge: could not read forge.toml from user vault", e);
    }

    // Step 3: mount bundled libraries (forge-moda for V1) as
    // subdirectories of the user-vault. Each `manifest.vaults` entry
    // is "vaults/<lib>/<file>"; we rewrite to "user-vault/<lib>/<file>"
    // so A5.1's library-subdir convention finds them under the
    // authoring vault root.
    for (const relpath of manifest.vaults) {
      const targetRel = relpath.replace(/^vaults\//, "user-vault/");
      const url = this.pluginAssetUrl(relpath);
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
      this._mkdirP(pyodide, "/bundle/" + targetRel);
      pyodide.FS.writeFile("/bundle/" + targetRel, bytes);
    }
    console.log(`Forge: user vault mounted (${userMounted} files; edits require iframe reload).`);
    console.log(`Forge: bundle mounted in ${(performance.now() - t0).toFixed(0)}ms`);

    // Engine on sys.path; build the resolver per bundled vault.
    // Also inject the moda-specific helpers that maintain ParticleState
    // in Python globals between engine-request round-trips (Phase 2):
    // state never crosses the JS↔Python boundary; only its wire
    // serialization (the per-row Particle list) does.
    //
    // _PYTHON_BLOCK_BEGIN
    // v0.2.23: src/compute-kwargs.test.ts extracts the inline Python
    // between the BEGIN/END markers and runs it inside Pyodide-in-Node
    // so the suite exercises the same helpers production loads. This
    // closes the v0.2.22 drift trap (test fixture mirrored a fixed
    // version while production stayed broken). Don't add Python that
    // depends on JS-side prep above this marker, and don't remove
    // these markers unless the dynamic-load fixture in
    // compute-kwargs.test.ts is updated to match.
    pyodide.runPython(`
import sys
sys.path.insert(0, "/bundle/engine")

# v0.2.27: extract vendored wheels (music21 + minimum deps) into a
# site-packages dir and put it on sys.path. No micropip — see the
# JS-side comment above the wheel mount for why. The wheels mount is
# optional (older builds don't have manifest.wheels); guard the
# directory existence.
import os
if os.path.isdir("/bundle/wheels"):
    import zipfile
    SITE = "/bundle/site-packages"
    if SITE not in sys.path:
        sys.path.insert(0, SITE)
    for fname in sorted(os.listdir("/bundle/wheels")):
        if fname.endswith(".whl"):
            with zipfile.ZipFile(os.path.join("/bundle/wheels", fname)) as zf:
                zf.extractall(SITE)

import io
import uuid
import re as _forge_re
from forge.core.snippet_registry import SnippetRegistry
from forge.core.graph_resolver import GraphResolver
from forge.core.executor import extract_python, exec_python, extract_section
from forge.core.serialization import serialize_result

# V1 user-vault model: single registry against /bundle/user-vault/.
# That directory holds the user's authoring snippets at the root +
# bundled libraries (forge-moda for V1) as subdirectories. A4 + A5.1
# handle shadow resolution: user's root-level overrides bundled
# library subdir; bundled subdir is the fall-through for anything
# the user didn't shadow.
_forge_user_vault = "/bundle/user-vault"
_forge_registry = SnippetRegistry()
_forge_registry.scan(_forge_user_vault)

# Ensure bundled-library subdirs are reachable via bare-snippet
# resolution. The registry's _scan_library_vault DOES register
# bundled-library snippets under their own vault name, but
# _auto_set_resolution_order reads the AUTHORING vault's forge.toml
# to populate the search order — and when that's absent (a brand-new
# user vault with no declared deps), the order falls back to
# [authoring, forge (built-in)] and the library subdirs are
# unreachable for bare lookups.
#
# This list mirrors the JS-side BUNDLED_LIBRARY_NAMES (kept
# hand-synced; one source of truth per language). v0.2.15: forge-music
# joined the bundle alongside forge-moda. v1.0 audit (task #19)
# collapses the JS-side + Python-side + forge-action.ts copies into
# one shared constant.
_BUNDLED_LIBRARIES_V1 = ["forge-moda", "forge-music"]
_existing_order = [v for v in _forge_registry.resolution_order() if v != "forge"]
for _lib in _BUNDLED_LIBRARIES_V1:
    if _lib not in _existing_order:
        _existing_order.append(_lib)
_forge_registry.set_resolution_order(_existing_order)

_forge_resolver = GraphResolver(_forge_registry)

# V1 α: hosted /generate inventory helper. The hosted transpile service
# is stateless — the plugin posts a materialized snippet inventory so
# the service builds the same prompt the engine's _build_prompt would
# construct locally. This mirror lives close to the resolver because
# it needs the same registry the engine compute path uses.
#
# Source of truth on the JS side: forge.core.llm._find_deps + _build_prompt
# in the engine repo. anthropic_client.build_user_prompt in the
# forge-transpile repo consumes the resulting payload. Re-vendor when
# any of those drift.
# NOTE: every regex backslash below is intentionally doubled. This
# Python source lives inside a JS template literal — V8 strips
# unrecognized escape sequences (backslash-w to w, backslash-[ to [,
# backslash-quote to plain quote), which both corrupts regex metachars
# silently AND prematurely terminates f-strings whose escaped quote
# vanishes. Fix is JS-side: write two backslashes in the source so
# Python receives one. Keep every metachar double-escaped if you edit.
_FORGE_ID_CHARS = r"[\\w./-]+"

def _forge_find_deps(body: str):
    """Mirror of forge.core.llm._find_deps. Walks the snippet body for
    [[wikilinks]] and context.compute("id") calls, returns the deduped
    list of referenced snippet IDs in first-seen order."""
    deps = []
    seen = set()
    for m in _forge_re.finditer(
        rf'\\[\\[({_FORGE_ID_CHARS})(?:\\|[^\\]]*)?\\]\\]', body or ""
    ):
        dep = m.group(1).strip()
        if dep and dep not in seen:
            deps.append(dep); seen.add(dep)
    for m in _forge_re.finditer(
        rf'context\\.compute\\(\\s*["\\']({_FORGE_ID_CHARS})["\\']', body or ""
    ):
        dep = m.group(1).strip()
        if dep and dep not in seen:
            deps.append(dep); seen.add(dep)
    return deps

def _forge_get_generate_inventory(snippet_id: str):
    """Materialize the inventory α's POST /generate consumes. Plain-dict
    return shape — structured-clone-safe across the JS↔Python bridge.

    Field-by-field parity with what the engine's _build_prompt would
    assemble from its own VaultSessionManager:
      - snippet_id, description, inputs, generation_notes: from meta
      - english: from the snippet body's '# English' section (mirror of
        forge.core.executor.extract_section, which lives in the bundled
        engine and is imported above)
      - deps: extracted from the existing body via _forge_find_deps,
        then each dep's description + inputs read from the resolver
    active_domains is populated JS-side (from settings/forge.toml) and
    appended to the payload before POST; not included here."""
    snip = _forge_resolver.resolve(snippet_id)
    meta = snip.get("meta") or {}
    body = snip.get("body", "") or ""
    dep_ids = _forge_find_deps(body)
    dep_infos = []
    for dep_id in dep_ids:
        try:
            dep_snip = _forge_resolver.resolve(dep_id)
        except Exception:
            # Dangling ref — skip rather than fail the whole request.
            continue
        dep_meta = dep_snip.get("meta") or {}
        dep_infos.append({
            "snippet_id": dep_id,
            "description": (dep_meta.get("description") or "").strip(),
            "inputs": [str(i) for i in (dep_meta.get("inputs") or [])],
        })
    return {
        "snippet_id": snippet_id,
        "description": (meta.get("description") or "").strip(),
        "english": extract_section(body, "english") or "",
        "inputs": [str(i) for i in (meta.get("inputs") or [])],
        "generation_notes": (meta.get("generation_notes") or "").strip(),
        "deps": dep_infos,
    }

def _forge_get_input_names(snippet_id: str):
    """v0.2.20: derive the inputs to request from the user by
    parsing the Python facet's compute() signature, then unioning
    with the frontmatter-declared inputs list.

    The Python signature is the source of truth for what compute()
    actually needs — the LLM may write a signature with params not
    declared in frontmatter (the Greet bug — empty frontmatter
    inputs + def compute(context, name)), and the modal must still
    surface those so the user can supply values.

    Ordering: declared inputs first (preserves user-intended UI
    order), then any signature-only params appended at the end.

    Defensive fallbacks:
      - malformed Python (SyntaxError): return declared.
      - missing/empty Python facet: return declared.
      - missing compute() function: return declared.
      - 'context' param is always filtered (engine implicitly
        passes it; user never supplies via the modal).

    v0.2.21: race fix. The registry caches snippet bodies at scan
    time; if the user edited the file after plugin load and the
    modify-hook hasn't completed, resolve() returns stale content.
    Refreshing from MEMFS here makes the helper race-proof from any
    caller's perspective — runSnippet doesn't need to remember to
    pre-flight, mirroring v0.2.19's preflightThenInventory pattern."""
    import ast as _forge_ast
    relpath = f"/bundle/user-vault/{snippet_id}.md"
    try:
        _forge_registry.refresh_file(relpath)
    except Exception:
        # Path may not exist (bundle-only snippet, etc.). Let
        # resolve() raise its own error in that case.
        pass
    snip = _forge_resolver.resolve(snippet_id)
    meta = snip.get("meta") or {}
    declared = [str(i) for i in (meta.get("inputs") or [])]

    body = snip.get("body") or ""
    try:
        code = extract_python(body)
    except Exception:
        return declared
    if not code or not code.strip():
        return declared

    try:
        tree = _forge_ast.parse(code)
    except SyntaxError:
        return declared

    sig_args = None
    for node in _forge_ast.walk(tree):
        if isinstance(node, _forge_ast.FunctionDef) and node.name == "compute":
            sig_args = (
                [a.arg for a in node.args.args]
                + [a.arg for a in node.args.kwonlyargs]
            )
            break
    if sig_args is None:
        return declared

    sig_args = [a for a in sig_args if a != "context"]

    out = list(declared)
    for a in sig_args:
        if a not in out:
            out.append(a)
    return out

def _forge_preflight_then_inventory(snippet_id: str):
    """v0.2.19: pre-flight inventory helper. Refreshes the registry's
    cached entry for this snippet from current MEMFS state, then
    returns the inventory.

    Called from JS-side forgeSnippet BEFORE /generate to close the
    race between async vault.on('modify') and synchronous Forge-
    click. The JS caller is responsible for syncing fresh disk
    content INTO MEMFS first (via syncUserVaultFile); this helper
    handles the registry-refresh + inventory step in one atomic
    call.

    Path inference: V1 single-vault convention is that snippet_id
    maps to a relative path of "<snippet_id>.md". Qualified IDs
    like "forge-moda/setup" become "forge-moda/setup.md". For the
    user's authoring vault, snippets live at the root, so
    unqualified IDs work directly. For bundled libraries
    (forge-moda, forge-music), the qualified prefix matches the
    library subdir.

    Unknown / non-existent paths silently no-op the refresh, then
    let _forge_get_generate_inventory's own resolve() raise the
    canonical SnippetResolutionError. Matches the contract test
    (d) asserts."""
    relpath = f"/bundle/user-vault/{snippet_id}.md"
    try:
        _forge_registry.refresh_file(relpath)
    except Exception:
        # Path may not exist (bundle-only snippet, qualified-id
        # edge case). Defer to resolve()'s canonical error.
        pass
    return _forge_get_generate_inventory(snippet_id)

def _forge_sync_user_file(relpath: str, new_body: str):
    """v0.2.17 — sync a single user-vault file change into MEMFS AND
    refresh the SnippetRegistry's cached entry for it. Called from JS
    after writeGeneratedCode writes to disk via Obsidian's vault API.

    Without this, Pyodide compute reads from the MEMFS snapshot taken
    at plugin init — disk and MEMFS diverge silently and the user sees
    stale results. v0.2.16's diagnostic surfaced the issue;
    v0.2.17 closes it.

    relpath is relative to the user-vault root (e.g. "Greet.md",
    "forge-moda/setup.md"). Frontmatter strip + body re-parse happen
    inside SnippetRegistry.refresh_file. ~1ms per call — surgical, no
    full vault rescan.
    """
    import os as _forge_os
    target = f"/bundle/user-vault/{relpath}"
    parent = _forge_os.path.dirname(target)
    if parent:
        _forge_os.makedirs(parent, exist_ok=True)
    with open(target, "w") as f:
        f.write(new_body)
    _forge_registry.refresh_file(target)

def _forge_qualify_snippet_id(snippet_id: str) -> str:
    """v0.2.40: bare → qualified ID via registry lookup. The capture
    path writes snapshots keyed by qualified IDs ({vault}/{bare}, set
    in snippet_registry.py:213-220), so freeze requests that pass bare
    IDs (the natural user-facing form, and what ForgeFreezeModal
    collects) miss the file by walking the wrong path.

    Already-qualified IDs ('/' in id) pass through unchanged.
    Bare IDs that don't resolve in the registry pass through unchanged
    too — downstream raises the appropriate FileNotFoundError per F5.

    Match semantics follow registry resolution order — bare matches
    pick the first vault that has the snippet, same as
    `context.compute('bare_id')` from a top-level call site."""
    if '/' in snippet_id:
        return snippet_id
    snip = _forge_registry.get_bare(snippet_id)
    if snip:
        return snip['snippet_id']
    return snippet_id

def _forge_set_edge_state(caller_id: str, callee_id: str, state: str, vault_name: str = ""):
    """v0.2.30: flip an edge's snapshot state (live ↔ frozen) by
    calling the engine's set_snapshot_state directly. Routes the
    /freeze HTTP path through Pyodide so closed-beta users (no
    uvicorn) can actually freeze edges. Per constitution F4, F5, F6:
    freeze is a user gesture; this helper is the JS-callable entry
    point.

    state must be 'live' or 'frozen'. Raises FileNotFoundError if
    the snapshot doesn't exist (edge hasn't been traversed yet;
    can't freeze what hasn't been captured per F5).

    v0.2.40: bare IDs supplied by ForgeFreezeModal (e.g. 'hello_random'
    not 'authoring/hello_random') auto-qualify via the registry before
    routing to set_snapshot_state. Previously, bare IDs threaded
    through unchanged and missed the capture-written qualified path,
    producing the URGENT 2026-06-03-0000 FileNotFoundError.

    vault_name kept vestigial-but-accepted for symmetry with the
    other _forge_* helpers (the single-user-vault model resolves
    everything against _forge_user_vault).
    """
    _ = vault_name
    from forge.core.snapshots import set_snapshot_state
    caller_id = _forge_qualify_snippet_id(caller_id)
    callee_id = _forge_qualify_snippet_id(callee_id)
    set_snapshot_state(_forge_user_vault, caller_id, callee_id, state)

def _forge_list_snippets():
    """v0.2.6 — serve connectVault from Pyodide. Returns the engine's
    /connect inventory shape: {vault_name: [{id, type, inputs}, ...]}
    sorted by id. SnippetRegistry.list_snippets() already produces
    exactly this shape (engine source: forge/core/snippet_registry.py
    line ~96), so we delegate. Structured-clone-safe — plain dict,
    plain lists, plain strings."""
    return _forge_registry.list_snippets()

def _forge_get_resolver(vault_name=None):
    """vault_name is vestigial — kept for backward compat in
    moda-view.ts's engine-request dispatch, but V1's single
    user-vault registry handles everything. A4 resolves qualified
    ('forge-moda/setup') and unqualified ('setup') snippet IDs
    naturally; we always return the same registry+resolver pair."""
    _ = vault_name
    return _forge_registry, _forge_resolver

def _forge_run_snippet(snippet_id: str, args, inputs=None, vault_name=None):
    """Run a snippet and return (stdout, result). Action and data
    snippets dispatch via the same path the engine's /compute endpoint
    uses internally.

    v0.2.23: 'inputs' parameter added. Pre-v0.2.23 hardcoded '{}'
    into exec_python, silently dropping any kwargs threaded from the
    JS-side modal. The 'inputs=None' default keeps the moda-fast-path
    and iframe-protocol callers (which pass only positional args)
    compatible — they still get the empty-kwargs behavior."""
    if inputs is None:
        inputs = {}
    reg, resolver = _forge_get_resolver(vault_name)
    snip = resolver.resolve(snippet_id)
    snippet_type = snip.get("meta", {}).get("type")
    if snippet_type == "action":
        code = extract_python(snip["body"])
        # v0.2.16: diagnostic. The greet-snippet investigation in
        # prompt 2026-05-31-2345 couldn't reproduce the user's empty-
        # stdout bug at suite-time (the engine extracts + executes the
        # body correctly). Add a one-line trace so the user's next
        # attempt produces evidence about what the Pyodide engine
        # actually saw: snippet_id, body length, extracted-code length,
        # code preview. Goes to Pyodide's stdout (browser dev console),
        # not the exec_python capture buf.
        _body_len = len(snip.get("body", "") or "")
        _code_len = len(code) if code else 0
        _code_preview = (code or "<empty>")[:200].replace("\\n", " | ")
        print(
            f"Forge debug: run_snippet({snippet_id!r}) "
            f"body={_body_len}ch code={_code_len}ch preview={_code_preview!r}"
        )
        stdout, result = exec_python(
            code, inputs, resolver, args=tuple(args),
            vault_path=_forge_user_vault,
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
    third positional; v0.2.23 threads it through to _forge_run_snippet
    (pre-v0.2.23 silently discarded via '_ = inputs', which was the
    root cause of the Greet TypeError that v0.2.17-v0.2.22 chased).

    Mirrors the HTTP /compute endpoint's serialize_result step:
    raw Python return values (ParticleState dataclasses, music21
    Streams, etc.) become wire-shape dicts like
    {type: "moda_sim_state", content: {tick, particles: [...]}}.
    Without this, raw dataclasses leak through Pyodide's toJs as
    non-cloneable PyProxies, breaking the iframe's postMessage
    relay AND the structured rendering in Forge Output."""
    reg, resolver = _forge_get_resolver(vault_name)
    snip = resolver.resolve(snippet_id)
    stdout, raw_result = _forge_run_snippet(snippet_id, args, inputs, vault_name)
    result = serialize_result(raw_result, snip)
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
    "medium" (the slider's value takes over on the first compute).

    Resolves 'setup' via A4 against /bundle/user-vault/ — finds the
    bundled forge-moda copy, OR a user shadow at vault root if the
    student has authored one."""
    global _forge_moda_state, _forge_moda_session_id
    stdout, state = _forge_run_snippet("setup", ("medium",))
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
        "go", (_forge_moda_state, dt, temperature),
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
        "on_mouse_click", (_forge_moda_state, x, y),
    )
    _forge_moda_state = new_state
    return {"ack": True, "stdout": stdout}
`);
    // _PYTHON_BLOCK_END
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

/** Materialized inventory the hosted α `/generate` consumes. Plugin
 *  builds this from the local Pyodide registry; service uses it to
 *  construct the same prompt the engine's _build_prompt would. */
export interface GenerateInventory {
  snippet_id: string;
  description: string;
  english: string;
  inputs: string[];
  generation_notes: string;
  deps: Array<{ snippet_id: string; description: string; inputs: string[] }>;
}

/** v0.2.6 connect-handshake inventory shape. Mirrors what the engine's
 *  `/connect` returned so server.ts:connectVault's callers don't change.
 *  `snippets` is keyed by vault name; each entry's shape matches
 *  SnippetRegistry.list_snippets() in the engine. */
export interface ConnectInventory {
  status: string;
  vault_path: string;
  warnings: string[];
  snippets: Record<string, Array<{ id: string; type: string; inputs: string[] }>>;
}

/** The handle returned by `PyodideHost.getInstance()`. Generic compute
 *  + the moda fast-path live here; Phase 2 added the moda methods;
 *  v0.2.4 added `getGenerateInventory` for the hosted /generate swap. */
export interface PyodideHostInstance {
  // v0.2.9: vault_name dropped from the JS surface. Single-user-vault
  // model makes it vestigial — A4 + A5.1 resolve qualified and bare
  // ids against the same registry regardless. Python side still
  // accepts `vault_name=None` on its compute helpers (see
  // pyodide-host.ts Python block, "vestigial" comment); the JS↔Python
  // boundary call below feeds it `""` rather than dropping it
  // entirely, to keep the engine signature stable for a follow-up
  // server-side cleanup prompt.
  // v0.2.22: `inputs` (optional) carries modal-supplied kwargs across
  // the JS↔Python boundary. Pre-v0.2.22 dropped them silently — the
  // latent Greet TypeError. Existing callers that don't pass kwargs
  // (the moda fast-path, iframe protocol) still work via the default.
  computeViaEngine(snippet_id: string, args: unknown[], inputs?: Record<string, unknown>): Promise<ComputeResult>;
  modaInit(): Promise<ModaInitResult>;
  modaCompute(dt: number, temperature: string): Promise<ModaComputeResult>;
  modaClick(x: number, y: number): Promise<ModaClickResult>;
  /** Materialize the per-snippet inventory the hosted α service needs.
   *  Resolves the snippet via the in-Pyodide engine resolver — same
   *  A4 shadow + A5.1 library-subdir rules as the local compute path. */
  getGenerateInventory(snippet_id: string): Promise<GenerateInventory>;
  /** v0.2.6: serve the connect-handshake from the in-Pyodide registry.
   *  Replaces the engine's HTTP `/connect` for V1 closed-beta, where
   *  no uvicorn is running. Caller passes the vault path it would have
   *  POSTed; we echo it back for the response envelope. */
  getConnectInventory(vault_path: string): Promise<ConnectInventory>;
  /** v0.2.17: sync a single user-vault file change into MEMFS so the
   *  next compute sees the new content. Call after every disk write
   *  to a user-vault file (writeGeneratedCode, manual editor saves
   *  caught via file-modify event, etc.). `relPath` is vault-relative
   *  (no leading slash); content is the full file body including
   *  frontmatter. */
  syncUserVaultFile(relPath: string, content: string): Promise<void>;
  /** v0.2.30: flip an edge's snapshot state via Pyodide (closes the
   *  HTTP-only gap for `/freeze`). `state` is `'live'` or `'frozen'`.
   *  Raises if the snapshot file at `.forge/edges/<caller>/<callee>.md`
   *  doesn't exist (per constitution F5 — can't freeze what hasn't
   *  been captured). */
  setEdgeState(callerId: string, calleeId: string, state: 'live' | 'frozen'): Promise<void>;
  /** v0.2.19: synchronous pre-flight inventory. Refreshes the
   *  registry's cached entry for the snippet from current MEMFS
   *  state, then returns the inventory. Use after `syncUserVaultFile`
   *  to bypass the async `vault.on('modify')` race during fast
   *  Forge-clicks (Cmd-S → immediate Forge-click within ~100ms). */
  preflightThenInventory(snippetId: string): Promise<GenerateInventory>;
  /** v0.2.20: derive the inputs to request from the user by parsing
   *  the Python facet's compute() signature, unioned with the
   *  frontmatter-declared inputs list. Used by the Forge-click
   *  modal-open path to decide which inputs to ask for — the Python
   *  signature is the source of truth, so LLM-generated signatures
   *  with params not declared in frontmatter still surface to the
   *  user. */
  getInputNames(snippetId: string): Promise<string[]>;
}

class PyodideHostInstanceImpl implements PyodideHostInstance {
  private pyodide: PyodideInstance;

  constructor(pyodide: PyodideInstance) {
    this.pyodide = pyodide;
  }

  /** Generic compute via the engine's resolver + executor. Used by
   *  the plugin's Forge-click paths (Phase 1) and the iframe's
   *  featured-button via engine-request op="compute" (Phase 2). */
  async computeViaEngine(
    snippet_id: string,
    args: unknown[],
    inputs: Record<string, unknown> = {},
  ): Promise<ComputeResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.pyodide.globals.set("_forge_args_in", args as any);
    this.pyodide.globals.set("_forge_snippet_id", snippet_id);
    // v0.2.22: thread modal-supplied kwargs to the Python side. The
    // .to_py() cast is canonical Pyodide for JS object → Python dict;
    // a bare `dict(_forge_inputs_in)` fails because JsProxy isn't
    // dict-iterable. The latent bug fixed here goes back to v0.2.6
    // — the JS-side signature never accepted `inputs`, so modal
    // kwargs were silently dropped at this boundary.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.pyodide.globals.set("_forge_inputs_in", inputs as any);
    // v0.2.9: vault_name dropped from the JS surface. Python's
    // _forge_compute still has the parameter (engine-side cleanup is
    // a separate prompt); feed it the empty-string sentinel the
    // single-user-vault model already ignored.
    this.pyodide.globals.set("_forge_vault_name", "");
    const tuple = this.pyodide.runPython(`
_forge_compute(
    _forge_snippet_id,
    list(_forge_args_in or []),
    _forge_inputs_in.to_py() if _forge_inputs_in else {},
    _forge_vault_name,
)
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

  /** v0.2.4 α swap: materialize the snippet inventory the hosted
   *  /generate consumes. Goes through the same engine resolver the
   *  local compute path uses, so A4 shadows + A5.1 library subdirs
   *  resolve correctly. */
  async getGenerateInventory(snippet_id: string): Promise<GenerateInventory> {
    this.pyodide.globals.set("_forge_gen_id", snippet_id);
    const proxy = this.pyodide.runPython(`_forge_get_generate_inventory(_forge_gen_id)`);
    return this._unwrap(proxy) as GenerateInventory;
  }

  /** v0.2.6 — replace the HTTP /connect handshake. Engine-side warnings
   *  (registry load errors) would have surfaced at Pyodide init when
   *  the registry built; we return [] here rather than re-emitting them
   *  on every connect. content_types is intentionally omitted —
   *  ConnectResponse.content_types is optional and callers fall back to
   *  a hardcoded default (server.ts:32). */
  async getConnectInventory(vault_path: string): Promise<ConnectInventory> {
    const proxy = this.pyodide.runPython(`_forge_list_snippets()`);
    const snippets = this._unwrap(proxy) as Record<
      string,
      Array<{ id: string; type: string; inputs: string[] }>
    >;
    return {
      status: 'connected',
      vault_path,
      warnings: [],
      snippets,
    };
  }

  /** v0.2.17 — push a single user-vault file's new body into MEMFS +
   *  refresh the SnippetRegistry's cached entry. After v0.2.16's
   *  diagnostic confirmed the MEMFS-staleness bug, the only path to
   *  next-compute correctness is calling this after every disk write
   *  on a user-vault file. The Python helper handles parent-dir
   *  creation + frontmatter re-parse via SnippetRegistry.refresh_file. */
  async syncUserVaultFile(relPath: string, content: string): Promise<void> {
    this.pyodide.globals.set('_forge_sync_relpath', relPath);
    this.pyodide.globals.set('_forge_sync_body', content);
    this.pyodide.runPython(`_forge_sync_user_file(_forge_sync_relpath, _forge_sync_body)`);
  }

  async setEdgeState(
    callerId: string,
    calleeId: string,
    state: 'live' | 'frozen',
  ): Promise<void> {
    this.pyodide.globals.set('_forge_freeze_caller', callerId);
    this.pyodide.globals.set('_forge_freeze_callee', calleeId);
    this.pyodide.globals.set('_forge_freeze_state', state);
    this.pyodide.runPython(
      `_forge_set_edge_state(_forge_freeze_caller, _forge_freeze_callee, _forge_freeze_state, "")`,
    );
  }

  /** v0.2.19 — see interface doc. Atomically refreshes the registry's
   *  cached entry for snippet_id from MEMFS, then materializes the
   *  inventory. The combo replaces the v0.2.17 + v0.2.18 two-step
   *  (syncUserVaultFile → getGenerateInventory) at the Forge-click
   *  hot path where the race matters; the two-step still exists for
   *  callers that DON'T need the race-fix semantics. */
  async preflightThenInventory(snippetId: string): Promise<GenerateInventory> {
    this.pyodide.globals.set('_forge_preflight_snippet_id', snippetId);
    const proxy = this.pyodide.runPython(`_forge_preflight_then_inventory(_forge_preflight_snippet_id)`);
    return this._unwrap(proxy) as GenerateInventory;
  }

  /** v0.2.20 — see interface doc. Routes through the Python helper
   *  which parses ast → unions with frontmatter declared inputs. */
  async getInputNames(snippetId: string): Promise<string[]> {
    this.pyodide.globals.set('_forge_input_names_snippet_id', snippetId);
    const proxy = this.pyodide.runPython(
      `list(_forge_get_input_names(_forge_input_names_snippet_id))`,
    );
    return this._unwrap(proxy) as string[];
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
