import { requestUrl } from 'obsidian';
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
  // V1: when Pyodide is wired, build the inventory from the in-process
  // resolver instead of round-tripping through uvicorn. Matches the
  // computeSnippet pattern (same _pyodideHost module-level var). Closed
  // beta needs this because the only HTTP endpoint reachable for those
  // users is the hosted α (which exposes /health + /generate only —
  // no /connect). Without this route the pre-compute handshake 404s.
  if (_pyodideHost) {
    const host = await _pyodideHost.getInstance();
    const inv = await host.getConnectInventory(vaultPath);
    if (inv.warnings?.length) {
      console.warn('Forge Connect warnings:', inv.warnings);
    }
    return inv as ConnectResponse;
  }

  // HTTP fallback — pre-V1 / no-Pyodide path. Kept defensively so a
  // future regression in main.ts's Pyodide wiring doesn't immediately
  // break local-uvicorn dev workflows.
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

// NOTE (v0.2.6): syncDependencies stays on HTTP. It IS called on the
// post-/generate write path (main.ts writeGeneratedCode line ~1248) so
// closed-beta users will see it fail; the call is wrapped in try/catch
// with console.warn and is non-fatal — the Python facet is already
// written by then, and compute proceeds without the # Dependencies
// section being refreshed. Migrating B7 dep-sync to Pyodide requires
// mirroring the engine's full body-rewrite logic and is deferred to
// v1.1 alongside the forge.core.llm centralization.
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
//
// NOTE (v0.2.6): canonicalize stays on HTTP per prompt 2026-05-26-0000 §6.
// The hosted α service doesn't expose /canonicalize yet — adding it is
// v1.1 work. Closed-beta users invoking the canonicalize flow will hit
// ECONNREFUSED against the default localhost:8000; that's the documented
// closed-beta behavior. Only the English→Python direction is supported.
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

// NOTE (v0.2.6): freezeEdge stays on HTTP. Only reachable via the
// explicit "Freeze edge"/"Unfreeze edge" command palette entries
// (main.ts openFreezeModal line ~1026) — not on the Forge-click path.
// Closed-beta users who don't run uvicorn simply can't freeze edges,
// which is fine for the seminar scope.
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

// v0.2.4 α swap: /generate moves from the local engine
// (vault_path-based, server-side registry walk) to the hosted
// service (stateless, client materializes the inventory). The
// request shape mirrors forge-transpile/main.py's GenerateRequest.
export interface AlphaDependencyInfo {
  snippet_id: string;
  description: string;
  inputs: string[];
}

export interface AlphaGenerateRequest {
  snippet_id: string;
  description: string;
  english: string;
  inputs: string[];
  generation_notes: string;
  deps: AlphaDependencyInfo[];
  active_domains: string[] | null;
}

export interface GenerateResponse {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any;
}

/** POST the materialized snippet inventory to the hosted α service.
 *  Auth via Authorization: Bearer <token>; token comes from settings.
 *
 *  Returns the same {status, json} envelope the engine's /generate
 *  did so callers can keep their existing status-branch handling.
 *  Empty token short-circuits to status=0 with an actionable detail
 *  — caller surfaces it as a Notice without hitting the network. */
export async function generateSnippetAlpha(
  serviceUrl: string,
  token: string,
  payload: AlphaGenerateRequest,
): Promise<GenerateResponse> {
  if (!token) {
    return {
      status: 0,
      json: {
        detail: 'Set your transpile token in Settings → Forge → Transpile token before using /generate.',
      },
    };
  }
  const res = await requestUrl({
    url: `${serviceUrl}/generate`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
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

// v0.2.8: pingServer, ensureServerRunning, and spawnForgeServer were
// removed here. The auto-spawn path used a hardcoded venv path that
// only worked on the original dev machine and, after v0.2.6 routed
// connectVault through Pyodide + v0.2.7 silenced post-/generate
// dep-sync noise, the entire dev-convenience auto-spawn was dead
// code on the click path. The plugin now never invokes child_process;
// uvicorn is a hand-managed dev tool only.
