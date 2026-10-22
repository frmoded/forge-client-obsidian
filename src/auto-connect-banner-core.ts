// Drain 2450 — the auto-connect banner text, pure so the caller-integration test can exercise it without Obsidian in the loop.
//
// Drain 2026-10-22-1930: the degraded branch ("auto-connected (Pyodide only) ... Engine at <url> is unreachable") is GONE together with the thing that produced it. Start-up no longer sends
// any request to the HTTP engine (`serverUrl`), so there is no engine-reachability signal to translate: `connectVault` returns the in-process inventory and nothing else. What remains is the green
// success line (unchanged) and the terminal-failure banner (unchanged).

export type BannerKind = 'success' | 'warning' | 'error';

export interface BannerSignal {
  message: string;
  kind: BannerKind;
}

export interface BannerInputs {
  serverUrl: string;
  attempts: number;
}

/** Success-path banner. Called from `_autoConnectOnLoad` after `connectVault` resolved. */
export function computeAutoConnectBanner(inputs: BannerInputs): BannerSignal {
  const suffix = inputs.attempts === 1 ? '' : ` (after ${inputs.attempts} attempts)`;
  return {
    message: `Forge: vault auto-connected to ${inputs.serverUrl}${suffix}.`,
    kind: 'success',
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
      + `check that the engine is running (see Forge panel for details).`,
    panel: `Forge auto-connect: ${serverUrl} — ${detail}`,
  };
}
