// Drain 2026-09-09-0930 (BYOK Phase 1) — resolveUserAnthropicKey.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveUserAnthropicKey } from './byok-key-resolution-core.ts';

test('toggle off → undefined, regardless of what the key field holds', () => {
  assert.equal(
    resolveUserAnthropicKey({ useOwnAnthropicKey: false, ownAnthropicKey: 'sk-ant-real-looking-key' }),
    undefined,
  );
  assert.equal(
    resolveUserAnthropicKey({ useOwnAnthropicKey: false, ownAnthropicKey: '' }),
    undefined,
  );
});

test('toggle on + a real-looking key → that key, on the wire verbatim', () => {
  assert.equal(
    resolveUserAnthropicKey({ useOwnAnthropicKey: true, ownAnthropicKey: 'sk-ant-real-looking-key' }),
    'sk-ant-real-looking-key',
  );
});

test('toggle on + EMPTY key field → undefined, not an empty string', () => {
  // The hard requirement from §2's own Tests list: the two sides
  // (this plugin, the hosted service) must agree on what "no key"
  // looks like on the wire — an empty string is NOT that shape.
  const result = resolveUserAnthropicKey({ useOwnAnthropicKey: true, ownAnthropicKey: '' });
  assert.equal(result, undefined);
  assert.notEqual(result, '', 'must not send an empty string — the service treats that differently from absent');
});

// ---------------------------------------------------------------------
// Wiring — pinned at the source. Proves both /generate payload
// construction sites in main.ts actually call the pure-core function,
// not a re-inlined copy of the same ternary (which would silently
// diverge from this file's own coverage the next time either changes).

const MAIN = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');

test('both AlphaGenerateRequest payload sites call resolveUserAnthropicKey', () => {
  const callSites = MAIN.split('\n').filter((l) => l.includes('resolveUserAnthropicKey(')).length;
  assert.equal(
    callSites, 2,
    'expected exactly two payload-construction call sites (python-dialect + recipe-dialect) '
    + 'to route the BYOK key decision through the pure-core function',
  );
});

test('no payload site re-inlines the toggle/empty-key ternary instead of calling the helper', () => {
  const offenders = MAIN.split('\n').filter(
    (l) => /useOwnAnthropicKey\s*&&\s*settings\.ownAnthropicKey/.test(l),
  );
  assert.deepEqual(
    offenders, [],
    'the toggle+empty-key decision must live only in byok-key-resolution-core.ts',
  );
});
