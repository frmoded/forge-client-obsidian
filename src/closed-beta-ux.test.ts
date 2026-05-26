// Tests for the v0.2.7 closed-beta polish helpers. Pure-core (no
// obsidian dep) so node --test runs without a shim.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNetRefusalError, welcomeMessage } from './closed-beta-ux.ts';

test('isNetRefusalError: ERR_CONNECTION_REFUSED (Chromium fetch)', () => {
  assert.equal(
    isNetRefusalError('net::ERR_CONNECTION_REFUSED at http://localhost:8000/sync_dependencies'),
    true,
  );
});

test('isNetRefusalError: ECONNREFUSED (Node net stack)', () => {
  assert.equal(
    isNetRefusalError('Error: connect ECONNREFUSED 127.0.0.1:8000'),
    true,
  );
});

test('isNetRefusalError: ENOTFOUND (DNS miss — user typo)', () => {
  assert.equal(
    isNetRefusalError('Error: getaddrinfo ENOTFOUND nonexistent.local'),
    true,
  );
});

test('isNetRefusalError: ENETUNREACH (no route)', () => {
  assert.equal(
    isNetRefusalError('Error: connect ENETUNREACH 10.0.0.1:8000'),
    true,
  );
});

test('isNetRefusalError: case-insensitive', () => {
  assert.equal(isNetRefusalError('err_connection_refused'), true);
  assert.equal(isNetRefusalError('econnrefused'), true);
});

test('isNetRefusalError: HTTP 5xx surfaces as a real bug, not a refusal', () => {
  // After the v0.2.6 connect-handshake migration, a real-bug 500 from
  // a misbehaving local uvicorn is the kind of thing console.warn
  // SHOULD surface. Verify the predicate rejects it.
  assert.equal(
    isNetRefusalError('Request failed, status 500'),
    false,
  );
});

test('isNetRefusalError: HTTP 404 is not a refusal', () => {
  assert.equal(isNetRefusalError('Request failed, status 404'), false);
});

test('isNetRefusalError: plain TypeError is not a refusal', () => {
  assert.equal(
    isNetRefusalError("TypeError: Cannot read property 'foo' of undefined"),
    false,
  );
});

test('isNetRefusalError: empty string is not a refusal', () => {
  assert.equal(isNetRefusalError(''), false);
});

test('welcomeMessage: no-token branch nudges to Settings → Forge → Transpile token', () => {
  const msg = welcomeMessage(false);
  // Must mention Settings and the token field explicitly so closed-
  // beta students know exactly where to act. These three substrings
  // are the load-bearing parts of the message.
  assert.ok(msg.includes('Welcome to Forge'), `missing greeting: ${msg}`);
  assert.ok(msg.includes('Settings'), `missing Settings reference: ${msg}`);
  assert.ok(msg.toLowerCase().includes('token'), `missing token reference: ${msg}`);
});

test('welcomeMessage: with-token branch is the shorter acknowledgement', () => {
  const msg = welcomeMessage(true);
  assert.ok(msg.includes('Forge is ready'), `missing ready ack: ${msg}`);
  assert.ok(msg.includes('Settings'), `missing Settings reference: ${msg}`);
  // The with-token branch should NOT include the "paste your transpile
  // token" nudge — that would be confusing for a user who already has
  // one set.
  assert.ok(
    !msg.toLowerCase().includes('paste your'),
    `with-token branch should not include the no-token nudge: ${msg}`,
  );
});

test('welcomeMessage: both branches are non-empty', () => {
  assert.ok(welcomeMessage(true).length > 0);
  assert.ok(welcomeMessage(false).length > 0);
});
