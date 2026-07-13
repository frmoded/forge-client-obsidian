// Drain 2450 — compute the auto-connect banner text + kind from the
// ConnectResponse. Pure so the L60 caller-integration test can
// exercise every state without Obsidian in the loop.
//
// Bug 1 shape after drain 2030: `_autoConnectOnLoad` always said
// "Forge: vault auto-connected to <url>." even when connectVault
// short-circuited to Pyodide and the engine's VaultSessionManager
// never received the vault_path. Cohort users then hit Sync edges
// and got HTTP 400 "vault not connected" — banner-vs-reality gap.
//
// Fix (drain 2450): server.ts::connectVault now attaches an
// `engine_http_status` field. This core translates that field into
// the banner shape the auto-connect helper renders.

export type BannerKind = 'success' | 'warning' | 'error';

export interface BannerSignal {
  message: string;
  kind: BannerKind;
}

export interface BannerInputs {
  serverUrl: string;
  attempts: number;
  /** Whatever connectVault stashed into `engine_http_status`.
   *  `undefined` is treated as `'ok'` for back-compat with any pre-
   *  drain-2450 callers that produce a ConnectResponse without the
   *  field. */
  engineHttpStatus?: 'ok' | 'unreachable' | 'error' | 'not_attempted';
  engineHttpError?: string;
}

/** Success-path banner. Called from `_autoConnectOnLoad` after
 *  `connectVault` resolved with `ok: true`. Encodes:
 *
 *  - engineHttpStatus is 'ok' or 'not_attempted' or absent
 *    → green "vault auto-connected" line.
 *  - engineHttpStatus is 'unreachable' or 'error'
 *    → WARNING line: Pyodide-only connected; engine unreachable.
 *      Sync/canonicalize/freeze will fail against this engine URL.
 */
export function computeAutoConnectBanner(inputs: BannerInputs): BannerSignal {
  const suffix = inputs.attempts === 1 ? '' : ` (after ${inputs.attempts} attempts)`;
  const status = inputs.engineHttpStatus ?? 'ok';
  if (status === 'ok' || status === 'not_attempted') {
    return {
      message: `Forge: vault auto-connected to ${inputs.serverUrl}${suffix}.`,
      kind: 'success',
    };
  }
  // Degraded — Pyodide compute path works, HTTP engine endpoints don't.
  const detail = inputs.engineHttpError
    ? ` (${inputs.engineHttpError})`
    : '';
  return {
    message:
      `Forge: vault auto-connected (Pyodide only)${suffix}. Engine at `
      + `${inputs.serverUrl} is unreachable${detail} — Sync edges, `
      + `canonicalize, and freeze will fail until the engine responds.`,
    kind: 'warning',
  };
}

/** Failure-path banner. Called from `_autoConnectOnLoad` after
 *  `connectVault` retried max attempts and threw on the last try. */
export function computeAutoConnectFailureBanner(
  serverUrl: string,
  attempts: number,
  detail: string,
): { notice: string; panel: string } {
  return {
    notice:
      `Forge: vault auto-connect failed after ${attempts} attempts — `
      + `check that the engine is running (see Forge Output for details).`,
    panel: `Forge auto-connect: ${serverUrl} — ${detail}`,
  };
}
