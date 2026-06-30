// v0.2.218 — Pure-core tests for the ForgeSpinner grace-period state
// machine. Uses fake-timer-style injection so tests can verify the
// grace period exactly without real wall-clock waits.

import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { ForgeSpinner } from './forge-spinner-core.ts';

/** Minimal fake-timer harness: records setTimeout calls and lets the
 *  test fire them on demand. */
function makeFakeTimers() {
  const pending: Array<{ id: number; cb: () => void; ms: number }> = [];
  let nextId = 1;
  return {
    pending,
    setTimeout(cb: () => void, ms: number): number {
      const id = nextId++;
      pending.push({ id, cb, ms });
      return id;
    },
    clearTimeout(handle: unknown): void {
      const idx = pending.findIndex(p => p.id === handle);
      if (idx >= 0) pending.splice(idx, 1);
    },
    /** Fire all pending timers in order. */
    fireAll(): void {
      const snapshot = pending.slice();
      pending.length = 0;
      for (const t of snapshot) t.cb();
    },
  };
}

function makeSpinner(gracePeriodMs = 200) {
  const calls: string[] = [];
  const timers = makeFakeTimers();
  const spinner = new ForgeSpinner({
    gracePeriodMs,
    setText: s => calls.push(s),
    setTimeout: timers.setTimeout.bind(timers),
    clearTimeout: timers.clearTimeout.bind(timers),
  });
  return { spinner, calls, timers };
}

describe('ForgeSpinner', () => {
  test('start then immediate stop → setText NEVER called (under grace)', () => {
    const { spinner, calls } = makeSpinner();
    spinner.start('Forge: 🔥 running …');
    spinner.stop();
    assert.deepEqual(calls, []);
  });

  test('start then grace expires then stop → setText called twice (label, empty)', () => {
    const { spinner, calls, timers } = makeSpinner();
    spinner.start('Forge: 🔥 generating…');
    timers.fireAll(); // grace expires
    spinner.stop();
    assert.deepEqual(calls, ['Forge: 🔥 generating…', '']);
  });

  test('start labelA then start labelB before grace expires → pending replaced', () => {
    const { spinner, calls, timers } = makeSpinner();
    spinner.start('Forge: 🔥 A');
    spinner.start('Forge: 🔥 B');
    timers.fireAll();
    assert.deepEqual(calls, ['Forge: 🔥 B']);
  });

  test('start labelA, expire grace, then start labelB → replaces visible text', () => {
    const { spinner, calls, timers } = makeSpinner();
    spinner.start('Forge: 🔥 A');
    timers.fireAll();
    spinner.start('Forge: 🔥 B');
    assert.deepEqual(calls, ['Forge: 🔥 A', 'Forge: 🔥 B']);
    spinner.stop();
    assert.deepEqual(calls, ['Forge: 🔥 A', 'Forge: 🔥 B', '']);
  });

  test('stop() with nothing pending → no-op', () => {
    const { spinner, calls } = makeSpinner();
    spinner.stop();
    spinner.stop();
    assert.deepEqual(calls, []);
  });

  test('multiple start/stop cycles work independently', () => {
    const { spinner, calls, timers } = makeSpinner();
    spinner.start('Forge: 🔥 first');
    timers.fireAll();
    spinner.stop();
    spinner.start('Forge: 🔥 second');
    timers.fireAll();
    spinner.stop();
    assert.deepEqual(calls, [
      'Forge: 🔥 first', '', 'Forge: 🔥 second', '',
    ]);
  });

  test('wrap(label, op) → spinner starts before op, stops after (success)', async () => {
    const { spinner, calls, timers } = makeSpinner();
    const result = spinner.wrap('Forge: 🔥 running …', async () => {
      timers.fireAll();  // simulate grace expiring during the op
      return 42;
    });
    assert.equal(await result, 42);
    assert.deepEqual(calls, ['Forge: 🔥 running …', '']);
  });

  test('wrap(label, op) → spinner still stops on error', async () => {
    const { spinner, calls, timers } = makeSpinner();
    await assert.rejects(
      async () => spinner.wrap('Forge: 🔥 generating…', async () => {
        timers.fireAll();
        throw new Error('LLM failed');
      }),
      /LLM failed/,
    );
    assert.deepEqual(calls, ['Forge: 🔥 generating…', '']);
  });

  test('wrap short-runs (under grace) → no spinner flash even on success', async () => {
    const { spinner, calls } = makeSpinner();
    const result = await spinner.wrap('Forge: 🔥 running …', async () => 7);
    assert.equal(result, 7);
    // Fast path: op completed before the grace timer fired, so no
    // setText calls at all.
    assert.deepEqual(calls, []);
  });
});
