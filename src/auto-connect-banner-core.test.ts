// Drain 2450 — banner text pure-core tests.

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  computeAutoConnectBanner,
  computeAutoConnectFailureBanner,
} from './auto-connect-banner-core.ts';

describe('computeAutoConnectBanner (drain 2450)', () => {
  it('engine_http_status = "ok" → green success banner', () => {
    const b = computeAutoConnectBanner({
      serverUrl: 'http://localhost:8000',
      attempts: 1,
      engineHttpStatus: 'ok',
    });
    assert.equal(b.kind, 'success');
    assert.equal(
      b.message,
      'Forge: vault auto-connected to http://localhost:8000.',
    );
  });

  it('engine_http_status = "not_attempted" → also green (HTTP-only path)', () => {
    const b = computeAutoConnectBanner({
      serverUrl: 'http://localhost:8000',
      attempts: 1,
      engineHttpStatus: 'not_attempted',
    });
    assert.equal(b.kind, 'success');
    assert.match(b.message, /auto-connected/);
  });

  it('undefined engine_http_status → back-compat green success', () => {
    // Pre-drain-2450 callers may produce a ConnectResponse without
    // engine_http_status; treat as OK to avoid a regression false-warn.
    const b = computeAutoConnectBanner({
      serverUrl: 'http://localhost:8000',
      attempts: 1,
    });
    assert.equal(b.kind, 'success');
  });

  it('engine_http_status = "unreachable" → warning banner mentions Sync will fail', () => {
    const b = computeAutoConnectBanner({
      serverUrl: 'http://localhost:8000',
      attempts: 1,
      engineHttpStatus: 'unreachable',
      engineHttpError: 'ECONNREFUSED',
    });
    assert.equal(b.kind, 'warning');
    // Banner MUST mention Sync edges + engine URL so the user knows
    // what to check.
    assert.match(b.message, /Pyodide only/);
    assert.match(b.message, /http:\/\/localhost:8000/);
    assert.match(b.message, /Sync edges/);
    assert.match(b.message, /ECONNREFUSED/);
  });

  it('engine_http_status = "error" → warning banner without error suffix if no message', () => {
    const b = computeAutoConnectBanner({
      serverUrl: 'http://localhost:8000',
      attempts: 1,
      engineHttpStatus: 'error',
    });
    assert.equal(b.kind, 'warning');
    assert.match(b.message, /Pyodide only/);
    // No error suffix when engineHttpError is absent.
    assert.doesNotMatch(b.message, /\(\)/);
  });

  it('multi-attempt success mentions attempt count', () => {
    const b = computeAutoConnectBanner({
      serverUrl: 'http://localhost:8000',
      attempts: 3,
      engineHttpStatus: 'ok',
    });
    assert.match(b.message, /after 3 attempts/);
  });

  it('multi-attempt warning ALSO mentions attempt count', () => {
    const b = computeAutoConnectBanner({
      serverUrl: 'http://localhost:8000',
      attempts: 2,
      engineHttpStatus: 'unreachable',
      engineHttpError: 'network error',
    });
    assert.equal(b.kind, 'warning');
    assert.match(b.message, /after 2 attempts/);
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
