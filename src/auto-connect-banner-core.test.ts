// Drain 2450 — banner text pure-core tests. Drain 2026-10-22-1930 removed the degraded branch; drain 2026-10-22-2100 reworded the two lines that remain: the success line names no URL (the HTTP
// server is no longer contacted) and the terminal-failure banner says what failed instead of "check that the engine is running".

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  computeAutoConnectBanner,
  computeAutoConnectFailureBanner,
} from './auto-connect-banner-core.ts';

describe('computeAutoConnectBanner', () => {
  it('a first-attempt connect is "Forge: vault connected." — no URL', () => {
    assert.deepEqual(computeAutoConnectBanner({ attempts: 1 }), { message: 'Forge: vault connected.', kind: 'success' });
  });

  it('multi-attempt success mentions the attempt count', () => {
    assert.equal(computeAutoConnectBanner({ attempts: 3 }).message, 'Forge: vault connected (after 3 attempts).');
  });

  it('it never names a server, whatever else is passed in', () => {
    const b = computeAutoConnectBanner({ attempts: 1, serverUrl: 'http://localhost:8000', engineHttpStatus: 'unreachable' } as never);
    assert.doesNotMatch(b.message, /localhost|http|Pyodide only|unreachable|auto-connected/);
  });
});

describe('computeAutoConnectFailureBanner', () => {
  it('says WHAT failed, in a notice that still contains "failed" (the word that routes it red into the Forge panel), and the full reason in the panel', () => {
    const b = computeAutoConnectFailureBanner(3, 'Forge runtime is not hydrated: the binary assets are missing.\nsecond line of a traceback');
    assert.equal(b.notice, 'Forge: vault connect failed after 3 attempts: Forge runtime is not hydrated: the binary assets are missing. (details in the Forge panel).');
    assert.equal(b.panel, 'Forge: vault connect failed after 3 attempts: Forge runtime is not hydrated: the binary assets are missing.\nsecond line of a traceback');
    assert.match(b.notice, /failed/);
  });

  it('no longer tells anyone to start an engine, and names no URL', () => {
    const b = computeAutoConnectFailureBanner(3, 'inventory exploded');
    for (const t of [b.notice, b.panel]) assert.doesNotMatch(t, /engine is running|localhost|http:/);
  });

  it('one attempt reads "1 attempt"; a long reason is shortened in the notice only', () => {
    assert.match(computeAutoConnectFailureBanner(1, 'x').notice, /after 1 attempt:/);
    const long = 'y'.repeat(300);
    const b = computeAutoConnectFailureBanner(3, long);
    assert.ok(b.notice.length < 240 && b.notice.includes('...'));
    assert.ok(b.panel.includes(long));
  });
});
