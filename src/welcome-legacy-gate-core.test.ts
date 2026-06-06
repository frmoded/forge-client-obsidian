import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldCreateLegacyWelcomeMd } from './welcome-legacy-gate-core.ts';

// v0.2.69 — Bug 1 regression coverage. The matrix in the prompt's
// §2.1 maps directly onto these cases.

test('legacy Welcome.md gate: fresh vault, no sentinel, not a source repo → create', () => {
  assert.strictEqual(shouldCreateLegacyWelcomeMd(false, null), true);
});

test('legacy Welcome.md gate: forge-music source vault → skip (Bug 1 fix)', () => {
  assert.strictEqual(shouldCreateLegacyWelcomeMd(false, 'forge-music'), false);
});

test('legacy Welcome.md gate: forge-moda source vault → skip (Bug 1 fix, symmetric)', () => {
  assert.strictEqual(shouldCreateLegacyWelcomeMd(false, 'forge-moda'), false);
});

test('legacy Welcome.md gate: sentinel already exists → skip regardless (idempotency, normal vault)', () => {
  assert.strictEqual(shouldCreateLegacyWelcomeMd(true, null), false);
});

test('legacy Welcome.md gate: sentinel + forge-music source vault → skip (idempotency, source vault)', () => {
  assert.strictEqual(shouldCreateLegacyWelcomeMd(true, 'forge-music'), false);
});

test('legacy Welcome.md gate: sentinel + forge-moda source vault → skip (idempotency, source vault)', () => {
  assert.strictEqual(shouldCreateLegacyWelcomeMd(true, 'forge-moda'), false);
});

test('legacy Welcome.md gate: future bundled library would also gate (forward-compat)', () => {
  // Forward-compat case — if KNOWN_BUNDLED_LIBRARIES grows to include
  // another library, the gate already handles it via the truthiness
  // of sourceVaultName. The gate doesn't hard-code the library names.
  assert.strictEqual(shouldCreateLegacyWelcomeMd(false, 'forge-future'), false);
});
