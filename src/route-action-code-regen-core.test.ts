// v0.2.121 — tests for routeActionCodeRegen.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  routeActionCodeRegen,
  type RoutingResult,
} from './route-action-code-regen-core.ts';

test('routeActionCodeRegen: E-- success path returns code via e--', async () => {
  const r = await routeActionCodeRegen('forge-tutorial/hello', {
    resolveActionCode: async () => 'def compute(context):\n    print("hi")',
    hasToken: true,
    generate: async () => { throw new Error('should not be called'); },
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.via, 'e--');
    assert.ok(r.code.includes('print'));
  }
});

test('routeActionCodeRegen: empty E-- result with token → falls back to /generate', async () => {
  let generateCalled = false;
  const r = await routeActionCodeRegen('forge-tutorial/free-text', {
    resolveActionCode: async () => null,
    hasToken: true,
    generate: async () => {
      generateCalled = true;
      return 'def compute(context):\n    print("from LLM")';
    },
  });
  assert.equal(generateCalled, true);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.via, 'generate');
    assert.ok(r.code.includes('from LLM'));
  }
});

test('routeActionCodeRegen: whitespace-only E-- result → falls back to /generate', async () => {
  const r = await routeActionCodeRegen('forge-tutorial/foo', {
    resolveActionCode: async () => '   \n  \n',
    hasToken: true,
    generate: async () => 'def compute(context):\n    pass',
  });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.via, 'generate');
});

test('routeActionCodeRegen: empty E-- without token → no-token error', async () => {
  const r = await routeActionCodeRegen('forge-tutorial/free-text', {
    resolveActionCode: async () => null,
    hasToken: false,
    generate: async () => { throw new Error('should not be called'); },
  });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, 'no-token');
    assert.ok(r.message.includes('Transpile token'));
  }
});

test('routeActionCodeRegen: E-- throws → engine-error result', async () => {
  const r = await routeActionCodeRegen('forge-tutorial/foo', {
    resolveActionCode: async () => { throw new Error('Pyodide not ready'); },
    hasToken: true,
    generate: async () => { throw new Error('should not be called'); },
  });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, 'engine-error');
    assert.ok(r.message.includes('Pyodide not ready'));
  }
});

test('routeActionCodeRegen: /generate throws → http-error result', async () => {
  const r = await routeActionCodeRegen('forge-tutorial/foo', {
    resolveActionCode: async () => null,
    hasToken: true,
    generate: async () => { throw new Error('HTTP 502'); },
  });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, 'http-error');
    assert.ok(r.message.includes('HTTP 502'));
  }
});

test('routeActionCodeRegen: short-circuits when E-- succeeds (no LLM call)', async () => {
  let generateCalled = false;
  const r = await routeActionCodeRegen('forge-tutorial/foo', {
    resolveActionCode: async () => 'def compute(context):\n    pass',
    hasToken: true,
    generate: async () => {
      generateCalled = true;
      return 'should not be reached';
    },
  });
  assert.equal(generateCalled, false, 'generate must NOT be called when E-- succeeds');
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.via, 'e--');
});

// Type-level test: the discriminated union covers all reasons.
test('routeActionCodeRegen: result type union has all 3 failure reasons', () => {
  const reasons: Array<'no-token' | 'http-error' | 'engine-error'> = [
    'no-token', 'http-error', 'engine-error',
  ];
  for (const reason of reasons) {
    const r: RoutingResult = { ok: false, reason, message: 'test' };
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, reason);
  }
});
