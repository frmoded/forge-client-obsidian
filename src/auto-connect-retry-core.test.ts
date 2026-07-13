// Drain 2030 — connectWithRetry pure-core tests. Node --test style so
// `npm test` picks them up alongside the other 1150+ tests.

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { connectWithRetry } from './auto-connect-retry-core.ts';

// Deterministic sleep stub — records call durations, resolves synchronously
// so retry-loop wall-clock stays test-execution-bound rather than backoff-bound.
function makeSleepRecorder() {
  const calls: number[] = [];
  const sleep = (ms: number) => {
    calls.push(ms);
    return Promise.resolve();
  };
  return { sleep, calls };
}

describe('connectWithRetry (drain 2030)', () => {
  it('returns ok:true on first attempt when connectFn resolves', async () => {
    const { sleep, calls } = makeSleepRecorder();
    const result = await connectWithRetry(async () => 'inv', {
      maxAttempts: 3,
      backoffMs: 1000,
      sleep,
    });
    assert.equal(result.ok, true);
    assert.equal(result.value, 'inv');
    assert.equal(result.attempts, 1);
    // No retries → no sleep.
    assert.deepEqual(calls, []);
  });

  it('retries then succeeds — 1st attempt fails, 2nd attempt resolves', async () => {
    const { sleep, calls } = makeSleepRecorder();
    let n = 0;
    const result = await connectWithRetry(
      async () => {
        n++;
        if (n === 1) throw new Error('boom');
        return { status: 'ok' };
      },
      { maxAttempts: 3, backoffMs: 1000, sleep },
    );
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, { status: 'ok' });
    assert.equal(result.attempts, 2);
    // One inter-attempt sleep of 1000ms between attempt 1 and 2.
    assert.deepEqual(calls, [1000]);
  });

  it('returns ok:false with the last error after all attempts fail', async () => {
    const { sleep, calls } = makeSleepRecorder();
    let n = 0;
    const errors: string[] = [];
    const result = await connectWithRetry(
      async () => {
        n++;
        const msg = `fail-${n}`;
        errors.push(msg);
        throw new Error(msg);
      },
      { maxAttempts: 3, backoffMs: 1000, sleep },
    );
    assert.equal(result.ok, false);
    assert.ok(result.error instanceof Error);
    assert.equal((result.error as Error).message, 'fail-3');
    assert.equal(result.attempts, 3);
    // 2 inter-attempt sleeps (not 3 — no sleep after the terminal failure).
    assert.deepEqual(calls, [1000, 1000]);
    assert.deepEqual(errors, ['fail-1', 'fail-2', 'fail-3']);
  });

  it('uses default setTimeout-based sleep when opts.sleep is omitted', async () => {
    // Success path so the default sleep is never actually invoked; the point
    // is that opts.sleep can be omitted without a TypeError.
    const result = await connectWithRetry(async () => 'ok', {
      maxAttempts: 3,
      backoffMs: 0,
    });
    assert.equal(result.ok, true);
    assert.equal(result.value, 'ok');
    assert.equal(result.attempts, 1);
  });
});
