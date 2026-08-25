// TDD failing-test-first — drain 2026-08-25-1020 §2.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { shouldBlindRetry, attemptPrefix } from './blind-retry-core.ts';

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

test('1800 §2: the attempt marker leads the notice so a trim cannot eat it', () => {
  assert.equal(attemptPrefix(1), '', 'a single unremarkable roll needs no marker');
  assert.equal(attemptPrefix(2), '(attempt 2 of 2) ');
  // The whole point: it must sit at the FRONT. A reader who quotes only
  // the first few words still carries it.
  const notice = `Forge: ${attemptPrefix(2)}The generated Recipe uses \`scale\` without declaring it. And several more sentences follow.`;
  assert.ok(notice.startsWith('Forge: (attempt 2 of 2) '),
    'the marker must precede the message body, not trail it');
  assert.ok(notice.slice(0, 40).includes('attempt 2 of 2'),
    'it must survive a 40-character trim — the failure mode drain 1710 hit');
});
