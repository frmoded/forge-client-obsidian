import { Notice, requestUrl } from 'obsidian';
import { spawn } from 'child_process';
import type { PyodideHost } from './pyodide-host';

// V1 Phase 1: plugin-side Pyodide host for engine-compute paths.
// Set once at plugin init (main.ts wires it). When non-null, the
// engine-compute path (`computeSnippet` below) prefers Pyodide over
// HTTP for the bundled forge-moda library. LLM endpoints
// (/generate, /canonicalize), iframe endpoints (/moda/*), and
// freeze/sync_dependencies/connect stay on the HTTP path for now —
// Phase 2 routes /moda/*, the transpile-service prompt routes
// /generate, and freeze/sync_dependencies are moved in a follow-up
// because they need the same vault-resolution decision as compute.
let _pyodideHost: PyodideHost | null = null;
const BUNDLED_LIBRARY = 'forge-moda';  // The only library V1 Phase 1 ships.

export function setPyodideHost(host: PyodideHost | null): void {
  _pyodideHost = host;
}

/** Heuristic: should this snippet be resolved against the bundled
 *  Pyodide library? V1 Phase 1 answers yes if the snippet ID matches
 *  a known bundled moda snippet basename. Anything else falls
 *  through to HTTP for compatibility with user-vault snippets that
 *  the user authored in their own vault root. This intentionally
 *  drops user-shadowing of moda library snippets — a documented V1
 *  Phase 1 regression; see prompt 0800 feedback for the rationale. */
const _BUNDLED_MODA_SNIPPETS = new Set<string>([
  // Auto-generated from `ls assets/vaults/forge-moda/*.md` at the
  // time of V1 Phase 1 bundling (forge-moda v0.4.16). Update by
  // re-running `npm run build-manifest` + lifting this list when the
  // bundled vault version changes.
  'ask_all_particles', 'ask_water_particles', 'bounce_off_particle',
  'bounce_off_wall', 'create_ink_particles', 'create_water_particles',
  'go', 'if_particle_then_bounce', 'if_temp_high_set_speed',
  'if_temp_low_set_speed', 'if_temp_medium_set_speed',
  'if_temp_zero_set_speed', 'if_wall_then_bounce', 'interact',
  'move', 'on_mouse_click', 'sample_clicks', 'sample_state',
  'set_ink_mass', 'set_ink_speed', 'set_speed_high',
  'set_speed_low', 'set_speed_medium', 'set_speed_zero',
  'set_water_mass', 'set_water_speed', 'setup', 'simulation',
  'speed_for_temperature',
]);

function _isBundledLibrarySnippet(snippetId: string): boolean {
  // Snippet IDs in plugin code take the form "snippet_name" (just
  // the basename, no path). Engine-side qualified IDs like
  // "forge-moda/setup" would also resolve, but the plugin's call
  // sites pass basenames. Drop a leading "forge-moda/" prefix if
  // present for robustness.
  const bare = snippetId.startsWith('forge-moda/')
    ? snippetId.slice('forge-moda/'.length)
    : snippetId;
  return _BUNDLED_MODA_SNIPPETS.has(bare);
}

export interface ConnectResponse {
  status: string;
  vault_path: string;
  warnings: string[];
  // The snippets payload is intentionally untyped here — its shape (a
  // map of vault → list of {id, type}) is consumed by several call sites
  // that still treat it as Record<string, string[]>. Tightening it is a
  // separate cleanup.
  snippets: any;
  // Backend-supplied list of content_types accepted by deserialize_from_wire.
  // Optional so the plugin remains compatible with older backends — callers
  // should fall back to a hardcoded default when missing.
  content_types?: string[];
}

export async function connectVault(serverUrl: string, vaultPath: string): Promise<ConnectResponse> {
  const res = await requestUrl({
    url: `${serverUrl}/connect`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vault_path: vaultPath, force: true }),
  });
  if (res.json?.warnings?.length) {
    console.warn('Forge Connect warnings:', res.json.warnings);
  }
  return res.json as ConnectResponse;
}

export async function syncDependencies(
  serverUrl: string,
  vaultPath: string,
  snippetId: string,
): Promise<{ status: number; json: any }> {
  const res = await requestUrl({
    url: `${serverUrl}/sync_dependencies`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vault_path: vaultPath, snippet_id: snippetId }),
    throw: false,
  });
  return { status: res.status, json: res.json };
}

// Phase 6.5: reverse direction of /generate. Server reads the snippet's
// python facet, asks the LLM for a canonical English description, returns
// it as plain text. The plugin owns the file write.
export async function canonicalizeSnippet(
  serverUrl: string,
  vaultPath: string,
  snippetId: string,
): Promise<{ status: number; json: any }> {
  const res = await requestUrl({
    url: `${serverUrl}/canonicalize`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vault_path: vaultPath, snippet_id: snippetId }),
    throw: false,
  });
  return { status: res.status, json: res.json };
}

export async function freezeEdge(
  serverUrl: string,
  vaultPath: string,
  caller: string,
  callee: string,
  state: 'frozen' | 'live',
): Promise<{ status: number; json: any }> {
  const res = await requestUrl({
    url: `${serverUrl}/freeze`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vault_path: vaultPath, caller, callee, state }),
    throw: false,
  });
  return { status: res.status, json: res.json };
}

export interface GenerateResponse {
  status: number;
  json: any;
}

export async function generateSnippet(
  serverUrl: string,
  vaultPath: string,
  snippetId: string,
  recursive: boolean,
): Promise<GenerateResponse> {
  // Pass `throw: false` so non-2xx responses come back with their
  // status + body intact instead of Obsidian's HTTP layer throwing
  // a generic Error. The caller branches on status to render the
  // right Notice — particularly for the 503/502 Anthropic-error
  // path, where the engine's structured detail body carries a
  // `retryable` flag the user wants to see.
  const res = await requestUrl({
    url: `${serverUrl}/generate`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vault_path: vaultPath, snippet_id: snippetId, recursive }),
    throw: false,
  });
  return { status: res.status, json: res.json };
}

export interface ComputeResponse {
  status: number;
  json: any;
}

export async function computeSnippet(
  serverUrl: string,
  vaultPath: string,
  snippetId: string,
  args: unknown[] = [],
  inputs: Record<string, unknown> = {}
): Promise<ComputeResponse> {
  // V1 Phase 1: route bundled-library compute through Pyodide. Falls
  // through to the HTTP path when (a) no Pyodide host is wired or
  // (b) the snippet isn't a bundled moda snippet (e.g., a user-
  // authored snippet in their own vault root, or any future library
  // that hasn't been bundled yet).
  if (_pyodideHost && _isBundledLibrarySnippet(snippetId)) {
    try {
      const host = await _pyodideHost.getInstance();
      const out = await host.computeViaEngine(snippetId, args, BUNDLED_LIBRARY);
      // Shape the response to match the existing /compute return
      // contract (status + json envelope, json carries result + stdout).
      // The engine's /compute server returns `{type, result, stdout}`
      // for generic action snippets; the plugin's downstream code
      // tolerates the simpler `{result, stdout}` we emit here. See
      // main.ts's compute-result handlers.
      return {
        status: 200,
        json: {
          type: 'action',
          result: out.result,
          stdout: out.stdout,
        },
      };
    } catch (e) {
      // Surface the Pyodide failure with the same envelope the HTTP
      // path uses for non-2xx responses. main.ts inspects status and
      // json.detail; we shape ours to match.
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Forge Pyodide compute failed:', e);
      return {
        status: 500,
        json: { detail: msg },
      };
    }
  }

  // HTTP fallback — user-vault snippets, non-bundled libraries, or
  // any path that needs the running uvicorn (today: anything not
  // bundled, until follow-up prompts widen the Pyodide scope).
  const res = await requestUrl({
    url: `${serverUrl}/compute`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vault_path: vaultPath, snippet_id: snippetId, args, inputs }),
    throw: false,
  });
  return { status: res.status, json: res.json };
}

export async function pingServer(serverUrl: string) {
  try {
    const res = await requestUrl({ url: `${serverUrl}/test`, method: 'GET' });
    console.log('Forge API Result:', res.json);
    new Notice('Forge: Data retrieved');
  } catch {
    console.log('Forge API Error: Server offline');
  }
}

export async function ensureServerRunning(serverUrl: string) {
  try {
    const res = await requestUrl({ url: `${serverUrl}/test`, method: 'GET' });
    if (res.status === 200) {
      console.log('Forge: Server heartbeat detected');
      return;
    }
  } catch {
    console.log('Forge: Server offline, attempting to spawn...');
    spawnForgeServer(serverUrl);
  }
}

function spawnForgeServer(url: string) {
  const port = new URL(url).port || '8000';
  // TODO: Make the Python path and working directory configurable
  const pythonPath = '/Users/odedfuhrmann/projects/forge/.venv/bin/python';
  const serverProcess = spawn(pythonPath, [
    '-m', 'uvicorn',
    'forge.api.server:app',
    '--host', '127.0.0.1',
    '--port', port,
  ], {
    cwd: '/Users/odedfuhrmann/projects/forge',
    detached: true,
    stdio: 'ignore',
  });

  serverProcess.unref();

  console.log(`Forge: Spawning server on port ${port}...`);
  new Notice('Forge: Starting background server');
}
