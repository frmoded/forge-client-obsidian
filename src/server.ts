import { requestUrl } from 'obsidian';
import type { PyodideHost } from './pyodide-host.ts';

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
  // Drain 2450 — engine HTTP connect reachability signal. In Pyodide
  // mode we build the inventory in-process (see below) AND fire the
  // HTTP /connect side-effect so /sync_dependencies + /canonicalize
  // + /freeze (which stay on HTTP) find the vault_path registered.
  // Set to:
  //   'ok'             — HTTP /connect returned 2xx
  //   'unreachable'    — network error / connection refused
  //   'error'          — non-2xx HTTP response
  //   'not_attempted'  — HTTP-only path (already succeeded — no
  //                      separate side-effect needed)
  //   undefined        — back-compat pre-drain-2450 callers
  engine_http_status?: 'ok' | 'unreachable' | 'error' | 'not_attempted';
  // Populated with the underlying error message when
  // engine_http_status is 'unreachable' or 'error'.
  engine_http_error?: string;
}

export async function connectVault(serverUrl: string, vaultPath: string): Promise<ConnectResponse> {
  // V1: when Pyodide is wired, build the inventory from the in-process
  // resolver instead of round-tripping through uvicorn. Matches the
  // computeSnippet pattern (same _pyodideHost module-level var). Closed
  // beta needs this because the only HTTP endpoint reachable for those
  // users is the hosted α (which exposes /health + /generate only —
  // no /connect). Without this route the pre-compute handshake 404s.
  //
  // Drain 2450 — Pyodide's inventory build is the primary path (its
  // return value drives snippet lookups + palette), but /sync_dependencies,
  // /canonicalize, and /freeze all STAY on HTTP (see the sync_dependencies
  // comment below). Those endpoints check the engine's own
  // VaultSessionManager — which never sees the Pyodide-side connect. So
  // fire an ADDITIONAL best-effort HTTP /connect against the engine to
  // register vault_path server-side. Failure here does NOT invalidate
  // the Pyodide inventory (compute + palette still work); the plugin
  // signals engine reachability via `engine_http_status` for the auto-
  // connect banner to reflect actual sync-side connectability.
  if (_pyodideHost) {
    const host = await _pyodideHost.getInstance();
    const inv = await host.getConnectInventory(vaultPath);
    if (inv.warnings?.length) {
      console.warn('Forge Connect warnings:', inv.warnings);
    }
    const result: ConnectResponse = inv as ConnectResponse;
    // Best-effort HTTP /connect side-effect. `throw: false` so 400/500
    // don't propagate — the Pyodide inventory is what callers actually
    // use for the return value; HTTP is purely a side-effect to prime
    // the engine's VaultSessionManager.
    try {
      const httpRes = await requestUrl({
        url: `${serverUrl}/connect`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vault_path: vaultPath, force: true }),
        throw: false,
      });
      if (httpRes.status >= 200 && httpRes.status < 300) {
        result.engine_http_status = 'ok';
      } else {
        result.engine_http_status = 'error';
        result.engine_http_error = `HTTP ${httpRes.status}`;
        console.warn(
          'Forge Connect: engine HTTP /connect returned non-2xx — Pyodide path OK '
          + 'but HTTP endpoints (sync/canonicalize/freeze) will 400 until engine responds.',
          httpRes.status,
        );
      }
    } catch (e) {
      result.engine_http_status = 'unreachable';
      result.engine_http_error = e instanceof Error ? e.message : String(e);
      console.warn(
        'Forge Connect: engine HTTP /connect unreachable — Pyodide path OK '
        + 'but HTTP endpoints (sync/canonicalize/freeze) will 400 until engine responds.',
        e,
      );
    }
    return result;
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
  const result = res.json as ConnectResponse;
  // On the HTTP-only path we already hit /connect successfully (the
  // requestUrl above would have thrown on network failure or non-2xx),
  // so the engine has the vault registered — no separate side-effect
  // was needed.
  result.engine_http_status = 'not_attempted';
  return result;
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

// v0.2.30: freezeEdge routes through Pyodide. The engine's
// snapshots.py:set_snapshot_state has the right function; HTTP was
// just the legacy delivery path. Closed beta has no uvicorn, so the
// HTTP fallback effectively dead-codes for production — kept only for
// dev mode where uvicorn IS running. Pre-v0.2.30 closed-beta users
// who hit Freeze got a silent localhost:8000 failure; now they hit
// the in-Pyodide path that mirrors the engine's HTTP /freeze
// handler. Status-200 envelope mirrors what /freeze returns so
// main.ts callers branch on `status` unchanged.
export async function freezeEdge(
  serverUrl: string,
  vaultPath: string,
  caller: string,
  callee: string,
  state: 'frozen' | 'live',
): Promise<{ status: number; json: any }> {
  if (_pyodideHost) {
    try {
      const host = await _pyodideHost.getInstance();
      await host.setEdgeState(caller, callee, state);
      return {
        status: 200,
        json: { status: 'ok', caller, callee, state },
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Forge freeze failed:', e);
      return { status: 500, json: { detail: msg } };
    }
  }

  // HTTP fallback — dev mode only.
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
  // v0.2.182 — V2 /generate Phase 2. Optional; service defaults to
  // "python" when absent (back-compat with all V1 callers). Set
  // "emm" to ask for V2 E-- recipe output instead of Python source.
  // v0.2.192 — "recipe" is the canonical V2 dialect. "emm" remains as
  // back-compat alias for one release; the service maps both to the
  // same V2 prompt path.
  dialect?: 'python' | 'recipe' | 'emm';
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

/** v0.2.70 Phase 2 §1.3 — try to extract a SlotCacheMissError payload
 *  from a Python-via-Pyodide exception message. The Python exception
 *  encodes its missing list as JSON; if msg parses cleanly and
 *  contains a `slot_cache_miss` key, returns the array. Otherwise
 *  returns null (treat as a normal compute error). Tolerant of extra
 *  prefix/suffix text Pyodide may prepend to the error.
 *
 *  Exported for testing (slot-cache-miss-extract.test.ts). */
export function _maybeExtractSlotCacheMiss(msg: string): any[] | null {
  // Pyodide's error message often looks like:
  //   "SlotCacheMissError: {\"slot_cache_miss\": [...]}"
  // OR raw "{...}" depending on the call path.
  // Find the first `{` and try to parse from there to end.
  const open = msg.indexOf('{');
  if (open < 0) return null;
  // Try parsing different suffixes (some Pyodide error strings have
  // trailing context). Walk from the end backwards looking for a `}`.
  for (let end = msg.length; end > open; end--) {
    if (msg[end - 1] !== '}') continue;
    const candidate = msg.slice(open, end);
    try {
      const obj = JSON.parse(candidate);
      if (obj && Array.isArray(obj.slot_cache_miss)) {
        return obj.slot_cache_miss;
      }
    } catch {
      // try next suffix
    }
  }
  return null;
}

// v0.2.70 Phase 2 §1.3 — slot resolution hosted endpoint caller.
// Mirrors generateSnippetAlpha's bearer-token plumbing.

export interface SlotRequestPayload {
  slot_text: string;
  snippet_id: string;
  surrounding_context: string;
  domain_hints: string[];
}

export interface SlotResponsePayload {
  python_expr: string;
  cache_key: string;
}

export interface BatchedSlotResponse {
  status: number;
  json: {
    responses?: SlotResponsePayload[];
    detail?: any;
  };
}

/** POST a batch of slot requests to the hosted `/resolve-slot` endpoint.
 *  Single round-trip for N slots — the server resolves each via Anthropic
 *  haiku (model-pinned) and returns python_expr + cache_key for each in
 *  request order.
 *
 *  Empty token short-circuits with detail mirroring generateSnippetAlpha's
 *  shape — caller surfaces as a Notice without hitting the network. */
export async function resolveSlotsAlpha(
  serviceUrl: string,
  token: string,
  requests: SlotRequestPayload[],
): Promise<BatchedSlotResponse> {
  if (!token) {
    return {
      status: 0,
      json: {
        detail: 'Set your transpile token in Settings → Forge → Transpile token before resolving slots.',
      },
    };
  }
  const res = await requestUrl({
    url: `${serviceUrl}/resolve-slot`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
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
  inputs: Record<string, unknown> = {},
  slotResolutions?: Record<string, string>,
  // v0.2.252 drain 2026-07-03-1000 §3.3 (L45 impl) — plugin's
  // canonical-layer decision passed through to engine so
  // resolve_action_code short-circuits the V2 parse chain when the
  // plugin has already declared Python canonical.
  canonicalLayer?: 'description' | 'recipe' | 'python' | 'synced',
): Promise<ComputeResponse> {
  // V1: every compute routes through Pyodide. The mounted user-vault
  // contains the user's authoring snippets + bundled libraries as
  // subdirectories, so A4 resolves shadows naturally. HTTP fallback
  // only fires when no Pyodide host is wired (defensive — main.ts
  // wires one on plugin onload).
  if (_pyodideHost) {
    try {
      const host = await _pyodideHost.getInstance();
      // v0.2.72 — slotResolutions: second-pass argument supplied by
      // the plugin's handleSlotCacheMiss after /resolve-slot returns.
      // Engine uses the dict to satisfy every slot lookup; misses
      // still raise SlotCacheMissError per B7.3.
      const out = await host.computeViaEngine(
        snippetId, args, inputs, slotResolutions, canonicalLayer);
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
      // v0.2.70 Phase 2 §1.3 — detect SlotCacheMissError surfaced
      // from the engine. The Python exception's str() is a JSON
      // payload `{"slot_cache_miss": [...]}` (encoded in
      // forge.core.slot_cache.SlotCacheMissError.__init__). Pyodide
      // surfaces it as the JS Error's message. Parse it; if it
      // matches the cache-miss shape, return a structured 409
      // envelope main.ts can route to /resolve-slot.
      const msg = e instanceof Error ? e.message : String(e);
      const cacheMiss = _maybeExtractSlotCacheMiss(msg);
      if (cacheMiss !== null) {
        return {
          status: 409,
          json: {
            slot_cache_miss: cacheMiss,
          },
        };
      }
      // Surface the Pyodide failure with the same envelope the HTTP
      // path uses for non-2xx responses. main.ts inspects status and
      // json.detail; we shape ours to match.
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
