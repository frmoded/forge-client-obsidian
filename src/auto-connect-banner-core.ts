// Drain 2450 — the auto-connect banner text, pure so the caller-integration test can exercise it without Obsidian in the loop.
//
// Drain 2026-10-22-1930: the degraded branch ("auto-connected (Pyodide only) ... Engine at <url> is unreachable") is GONE together with the thing that produced it. Start-up no longer sends
// any request to the HTTP engine (`serverUrl`), so there is no engine-reachability signal to translate: `connectVault` returns the in-process inventory and nothing else. What remains is the green
// success line and the terminal-failure banner (both reworded by drain 2026-10-22-2100: no URL, and the failure names what failed).

export type BannerKind = 'success' | 'warning' | 'error';

export interface BannerSignal {
  message: string;
  kind: BannerKind;
}

export interface BannerInputs {
  attempts: number;
}

/** Success-path banner. Called from `_autoConnectOnLoad` after `connectVault` resolved. Drain 2026-10-22-2100: it no longer names a URL — the connect is in-process and the HTTP engine is not
 *  contacted, so a line that said `auto-connected to http://localhost:8000` named a server nothing talked to. */
export function computeAutoConnectBanner(inputs: BannerInputs): BannerSignal {
  const suffix = inputs.attempts === 1 ? '' : ` (after ${inputs.attempts} attempts)`;
  return {
    message: `Forge: vault connected${suffix}.`,
    kind: 'success',
  };
}

/** Failure-path banner. Called from `_autoConnectOnLoad` after `connectVault` retried max attempts and threw on the last try. Drain 2026-10-22-2100: it says WHAT failed (the in-process connect's own
 *  reason), not "check that the engine is running" — there is no engine to start; the failure is the in-process one (e.g. the runtime is not hydrated yet). "failed" stays in the notice: that word is
 *  what routes a notice red into the Forge panel. */
export function computeAutoConnectFailureBanner(
  attempts: number,
  detail: string,
): { notice: string; panel: string } {
  const first = detail.split('\n')[0].trim();
  const short = first.length > 160 ? `${first.slice(0, 157)}...` : first;
  const times = attempts === 1 ? '1 attempt' : `${attempts} attempts`;
  return {
    notice: `Forge: vault connect failed after ${times}: ${short} (details in the Forge panel).`,
    panel: `Forge: vault connect failed after ${times}: ${detail}`,
  };
}
