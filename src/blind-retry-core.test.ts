// TDD failing-test-first — drain 2026-08-25-1020 §2.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { shouldBlindRetry, attemptSuffix } from './blind-retry-core.ts';

test('the two wobble verdicts get exactly one silent retry', () => {
  assert.equal(shouldBlindRetry(1, 'free-variable-fail'), true);
  assert.equal(shouldBlindRetry(1, 'closure-fail'), true);
});

test('a second failure is surfaced — one retry, never a loop', () => {
  assert.equal(shouldBlindRetry(2, 'free-variable-fail'), false);
  assert.equal(shouldBlindRetry(2, 'closure-fail'), false);
  // Defence against an off-by-one turning this into an unbounded loop.
  for (const n of [3, 4, 10, 100]) {
    assert.equal(shouldBlindRetry(n, 'free-variable-fail'), false);
  }
});

test('the success path never retries', () => {
  assert.equal(shouldBlindRetry(1, 'ok'), false);
  assert.equal(shouldBlindRetry(2, 'ok'), false);
});

test('verdicts a second roll cannot help are not retried', () => {
  // Prose / missing-chip: the Description usually cannot be satisfied
  // with the chips on hand, so a retry buys the same explanation twice.
  assert.equal(shouldBlindRetry(1, 'no-statement'), false);
  // Nothing was generated — retrying hides a missing token or an outage.
  assert.equal(shouldBlindRetry(1, 'call-failed'), false);
});

test('the notice says "after 2 attempts" only once a retry was spent', () => {
  assert.equal(attemptSuffix(1), '');
  assert.equal(attemptSuffix(2), ' (after 2 attempts)');
});
