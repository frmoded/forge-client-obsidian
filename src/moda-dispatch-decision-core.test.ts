// Drain 2570 — pure-core tests for moda dispatch routing.

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { decideModaDispatch } from './moda-dispatch-decision-core.ts';

describe('decideModaDispatch (drain 2570)', () => {
  it('moda_sim_state payload → sidebar', () => {
    const result = {
      type: 'moda_sim_state',
      content: { tick: 300, particles: [] },
    };
    assert.equal(decideModaDispatch(result), 'sidebar');
  });

  it('moda_sim_state without content still routes to sidebar (sidebar renders empty)', () => {
    const result = { type: 'moda_sim_state' };
    assert.equal(decideModaDispatch(result), 'sidebar');
  });

  it('null result → output', () => {
    assert.equal(decideModaDispatch(null), 'output');
  });

  it('undefined result → output', () => {
    assert.equal(decideModaDispatch(undefined), 'output');
  });

  it('string result → output (music-domain scoreblob)', () => {
    assert.equal(decideModaDispatch('some music xml'), 'output');
  });

  it('number result → output (tutorial-domain scalar)', () => {
    assert.equal(decideModaDispatch(42), 'output');
  });

  it('array result → output (music-domain multi-part list)', () => {
    assert.equal(decideModaDispatch([1, 2, 3]), 'output');
  });

  it('plain object without type marker → output', () => {
    // Music-domain chord dict, tutorial-domain result envelope, etc.
    assert.equal(
      decideModaDispatch({ tonic: 'E', mode: 'major' }),
      'output',
    );
  });

  it('object with a different type marker → output (defensive)', () => {
    assert.equal(
      decideModaDispatch({ type: 'music_score', content: 'xml' }),
      'output',
    );
  });

  it('object with type: "moda_sim_state" and stringly-typed content → sidebar', () => {
    // Engine sometimes sends structured content; sometimes it's a
    // serialized blob. Both should route to sidebar.
    assert.equal(
      decideModaDispatch({ type: 'moda_sim_state', content: '{"tick":0}' }),
      'sidebar',
    );
  });
});
