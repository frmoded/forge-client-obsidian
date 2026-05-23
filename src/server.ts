import { Notice, requestUrl } from 'obsidian';
import { spawn } from 'child_process';
import type { PyodideHost } from './pyodide-host';

// V1: plugin-side Pyodide host for engine-compute paths.
// Set once at plugin init (main.ts wires it). When non-null, the
// engine-compute path (`computeSnippet` below) routes every snippet
// resolution through Pyodide against the mounted user-vault. The
// resolver's A4 + A5.1 handles user shadows vs. bundled libraries.
// HTTP fallback remains in place for the case where Pyodide isn't
// wired yet (defensive) and for endpoints we haven't migrated:
// LLM-driven (/generate, /canonicalize), freeze/sync_dependencies/
// connect — those stay on uvicorn until follow-up prompts.
let _pyodideHost: PyodideHost | null = null;

export function setPyodideHost(host: PyodideHost | null): void {
  _pyodideHost = host;
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
  // V1: every compute routes through Pyodide. The mounted user-vault
  // contains the user's authoring snippets + bundled libraries as
  // subdirectories, so A4 resolves shadows naturally. HTTP fallback
  // only fires when no Pyodide host is wired (defensive — main.ts
  // wires one on plugin onload).
  if (_pyodideHost) {
    try {
      const host = await _pyodideHost.getInstance();
      // vault_name is vestigial under the single-user-vault model
      // but kept on the API surface for the iframe's engine-request
      // dispatch shape. Any value works; the Python side ignores it.
      const out = await host.computeViaEngine(snippetId, args, '');
      // Shape the response to match the existing /compute return
      // contract (status + json envelope, json carries result + stdout).
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

  // HTTP fallback — fires when Pyodide isn't yet initialized.
  // Pre-V1 code path; rarely hit in production.
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
