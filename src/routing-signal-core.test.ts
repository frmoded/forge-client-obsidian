// v0.2.252 drain 2026-07-03-1000 §3.3 (L45 impl) — routingSignalFor tests.
// Truth table lives in routing-signal-core.ts; assert every canonical
// value's signal shape.

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { routingSignalFor } from './routing-signal-core.ts';

describe('routingSignalFor', () => {
  it('description → transpile + generate BOTH run', () => {
    const s = routingSignalFor('description');
    assert.equal(s.canonical_layer, 'description');
    assert.equal(s.skip_transpile, false);
    assert.equal(s.skip_generate, false);
  });

  it('recipe → transpile runs; generate skipped', () => {
    const s = routingSignalFor('recipe');
    assert.equal(s.canonical_layer, 'recipe');
    assert.equal(s.skip_transpile, false);
    assert.equal(s.skip_generate, true);
  });

  it('python → both skipped (Python is source, engine runs as-is)', () => {
    const s = routingSignalFor('python');
    assert.equal(s.canonical_layer, 'python');
    assert.equal(s.skip_transpile, true);
    assert.equal(s.skip_generate, true);
  });

  it('synced → transpile allowed; generate skipped', () => {
    const s = routingSignalFor('synced');
    assert.equal(s.canonical_layer, 'synced');
    assert.equal(s.skip_transpile, false);
    assert.equal(s.skip_generate, true);
  });
});
