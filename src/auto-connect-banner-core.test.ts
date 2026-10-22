// Drain 2450 — banner text pure-core tests. Drain 2026-10-22-1930: the degraded ("Pyodide only ... engine unreachable") branch was removed with the start-up HTTP request that produced it,
// so its tests are gone; what remains pins the green success line and the terminal-failure banner, both unchanged.

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  computeAutoConnectBanner,
  computeAutoConnectFailureBanner,
} from './auto-connect-banner-core.ts';

describe('computeAutoConnectBanner', () => {
  it('a first-attempt connect is the green success line, exactly the old message and kind', () => {
    assert.deepEqual(
      computeAutoConnectBanner({ serverUrl: 'http://localhost:8000', attempts: 1 }),
      { message: 'Forge: vault auto-connected to http://localhost:8000.', kind: 'success' },
    );
  });

  it('multi-attempt success mentions the attempt count', () => {
    const b = computeAutoConnectBanner({ serverUrl: 'http://localhost:8000', attempts: 3 });
    assert.equal(b.kind, 'success');
    assert.equal(b.message, 'Forge: vault auto-connected to http://localhost:8000 (after 3 attempts).');
  });

  it('there is no engine-reachability input and no warning kind produced any more: whatever else is passed, the line is the success line', () => {
    const b = computeAutoConnectBanner({ serverUrl: 'http://localhost:8000', attempts: 1, engineHttpStatus: 'unreachable', engineHttpError: 'ECONNREFUSED' } as never);
    assert.equal(b.kind, 'success');
    assert.doesNotMatch(b.message, /Pyodide only|unreachable|ECONNREFUSED/);
  });
});

describe('computeAutoConnectFailureBanner (drain 2450)', () => {
  it('produces the retryable-exhausted notice + panel pair', () => {
    const b = computeAutoConnectFailureBanner(
      'http://localhost:8000',
      3,
      'ECONNREFUSED',
    );
    assert.match(b.notice, /failed after 3 attempts/);
    assert.match(b.notice, /engine is running/);
    assert.match(b.panel, /http:\/\/localhost:8000/);
    assert.match(b.panel, /ECONNREFUSED/);
  });
});
