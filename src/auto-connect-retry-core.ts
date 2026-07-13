/**
 * Drain 2030 — auto-connect retry helper.
 *
 * Wraps an arbitrary `connect` async call with a bounded retry loop
 * so the plugin's onload can call `/connect` optimistically without
 * blocking or leaking unhandled rejections. Sleep is injected so
 * tests can drive backoff without wall-clock latency.
 *
 * Contract:
 *   - Call `connectFn` up to `maxAttempts` times.
 *   - Between attempts, sleep `backoffMs` (constant, not exponential —
 *     the drain caps total wait at ~5s so 1s×2gaps=2s of sleep is well
 *     inside budget).
 *   - Return `{ ok:true, value, attempts }` on first success.
 *   - Return `{ ok:false, error, attempts }` after all attempts fail.
 *   - `connectFn` throwing is caught and counted as a failed attempt.
 */

// NOTE: tsconfig has `strict: false`, so a proper discriminated union
// (`{ok:true; value: T} | {ok:false; error}`) does NOT narrow at
// callsites — TS treats `ok: true` and `ok: false` both as `boolean`
// without strictNullChecks. A single flat shape with optional `value`
// and `error` sidesteps the narrowing requirement and keeps callers
// simple. Callers read `ok` first and then whichever field is relevant.
export interface ConnectAttempt<T> {
  ok: boolean;
  value?: T;
  error?: unknown;
  attempts: number;
}

export interface ConnectWithRetryOpts {
  maxAttempts: number;
  backoffMs: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function connectWithRetry<T>(
  connectFn: () => Promise<T>,
  opts: ConnectWithRetryOpts,
): Promise<ConnectAttempt<T>> {
  const sleep = opts.sleep ?? defaultSleep;
  let lastError: unknown = undefined;
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      const value = await connectFn();
      return { ok: true, value, attempts: attempt };
    } catch (e) {
      lastError = e;
      if (attempt < opts.maxAttempts) {
        await sleep(opts.backoffMs);
      }
    }
  }
  return { ok: false, error: lastError, attempts: opts.maxAttempts };
}
