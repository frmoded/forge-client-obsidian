// Drain 2026-08-14-0350 §5(b) — notice() must swallow its own render failures.
//
// `notice()` is declared `: void` and dispatches an async `forgeOutput(...)`
// with a `void` operator, discarding the promise. When forgeOutput rejects —
// exactly what happened in the onload crash drain 0300 fixed — the rejection
// becomes an unhandled promise rejection, and a caller's own try/catch around
// `this.notice(...)` can never see it. That made every one of the ~34 notice
// call sites silently unsafe, not just the one 0300 patched.
//
// These tests drive the shared helper both concerns now route through.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { NOTICE_PREFIX, prefixed, swallowRenderFailure } from './notice-core.ts';

// -- (b) failure swallowing -------------------------------------------------

test('swallowRenderFailure: a rejecting promise does not escape', async () => {
  const seen: unknown[] = [];
  const rejected = Promise.reject(new Error('getRightLeaf exploded'));

  // Must not throw synchronously.
  assert.doesNotThrow(() => swallowRenderFailure(rejected, (e) => seen.push(e)));

  // Flush microtasks + a macrotask so any unhandled rejection would surface.
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(seen.length, 1, 'the failure should have been reported once');
  assert.match(String(seen[0]), /getRightLeaf exploded/);
});

test('swallowRenderFailure: no unhandled rejection reaches the process', async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (e: unknown) => unhandled.push(e);
  process.on('unhandledRejection', onUnhandled);
  try {
    swallowRenderFailure(Promise.reject(new Error('boom')), () => {});
    await new Promise((r) => setTimeout(r, 10));
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
  assert.deepEqual(unhandled, [], 'nothing should reach unhandledRejection');
});

test('swallowRenderFailure: the success path is untouched', async () => {
  const seen: unknown[] = [];
  let resolvedWith: string | undefined;
  const ok = Promise.resolve('rendered').then((v) => {
    resolvedWith = v;
  });
  swallowRenderFailure(ok, (e) => seen.push(e));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(resolvedWith, 'rendered');
  assert.deepEqual(seen, [], 'the error reporter must not fire on success');
});

test('swallowRenderFailure: does not retry (reporter called exactly once)', () => {
  // §8 — log and stop. A retry inside the catch risks looping the same
  // failure that just occurred.
  let calls = 0;
  swallowRenderFailure(Promise.reject(new Error('x')), () => {
    calls += 1;
  });
  return new Promise<void>((r) =>
    setTimeout(() => {
      assert.equal(calls, 1);
      r();
    }, 10),
  );
});

// -- (a) single point of control for the prefix -----------------------------

test('prefixed: applies the prefix exactly once', () => {
  assert.equal(prefixed('no active note to copy.'), 'Forge: no active note to copy.');
});

test('NOTICE_PREFIX is the unchanged text', () => {
  // §8 — this drain must NOT change the prefix text itself. If someone
  // edits the constant, this is the test that says "that was a decision".
  assert.equal(NOTICE_PREFIX, 'Forge: ');
});

test('prefixed: empty message still carries the prefix', () => {
  assert.equal(prefixed(''), 'Forge: ');
});
