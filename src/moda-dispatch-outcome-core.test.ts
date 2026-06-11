// v0.2.126 — failing-first TDD tests for decideModaDispatchOutcome.
//
// Per the v0326 prompt §3.3: 4 integration tests for the moda
// branch behavior. Per the v0325 precedent + the harness Obsidian-
// shim being indefinitely deferred, we land the tests at the
// pure-core decision boundary instead. 5 tests covering the
// RoutingResult → ModaDispatchOutcome truth table.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideModaDispatchOutcome } from './moda-dispatch-outcome-core.ts';

test('decideModaDispatchOutcome: E-- success → write-and-open with code', () => {
  const result = decideModaDispatchOutcome({
    ok: true,
    code: 'def compute(context):\n  return 1\n',
    via: 'e--',
  });
  assert.equal(result.kind, 'write-and-open');
  if (result.kind === 'write-and-open') {
    assert.equal(result.code, 'def compute(context):\n  return 1\n');
  }
});

test('decideModaDispatchOutcome: /generate success → open (no write)', () => {
  // generate() writes Python to disk + MEMFS internally per
  // v0.2.121 semantics; the moda branch does NOT write again.
  const result = decideModaDispatchOutcome({
    ok: true,
    code: '<generate-write-completed>',
    via: 'generate',
  });
  assert.equal(result.kind, 'open');
});

test('decideModaDispatchOutcome: no-token failure → notice-and-open with reason in notice', () => {
  const result = decideModaDispatchOutcome({
    ok: false,
    reason: 'no-token',
    message: 'Set a Transpile Service Token in Forge settings.',
  });
  assert.equal(result.kind, 'notice-and-open');
  if (result.kind === 'notice-and-open') {
    assert.match(result.notice, /no-token/);
    assert.match(result.notice, /Set a Transpile Service Token/);
  }
});

test('decideModaDispatchOutcome: http-error failure → notice-and-open with http message', () => {
  const result = decideModaDispatchOutcome({
    ok: false,
    reason: 'http-error',
    message: '/generate returned 503',
  });
  assert.equal(result.kind, 'notice-and-open');
  if (result.kind === 'notice-and-open') {
    assert.match(result.notice, /http-error/);
    assert.match(result.notice, /503/);
  }
});

test('decideModaDispatchOutcome: engine-error failure → notice-and-open with engine message', () => {
  const result = decideModaDispatchOutcome({
    ok: false,
    reason: 'engine-error',
    message: 'Pyodide host not ready',
  });
  assert.equal(result.kind, 'notice-and-open');
  if (result.kind === 'notice-and-open') {
    assert.match(result.notice, /engine-error/);
    assert.match(result.notice, /Pyodide host not ready/);
  }
});

test('decideModaDispatchOutcome: notice text mentions "current Python" for user UX clarity', () => {
  // Per v0326 §2.4: the notice should tell the user the iframe is
  // going to run with whatever Python is currently on disk, so
  // they understand the stale-state surface they're seeing.
  const result = decideModaDispatchOutcome({
    ok: false,
    reason: 'no-token',
    message: 'token missing',
  });
  assert.equal(result.kind, 'notice-and-open');
  if (result.kind === 'notice-and-open') {
    assert.match(result.notice, /current Python/);
  }
});
