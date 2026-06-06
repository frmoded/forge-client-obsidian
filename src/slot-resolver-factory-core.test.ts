import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeSlotCacheKey,
  makeForgeSlotResolver,
} from './slot-resolver-factory-core.ts';
import type {
  HostedResolveSlot,
  SlotRequest,
  SlotResponse,
} from './slot-resolver-factory-core.ts';

// v0.2.69-design (Phase 1 §1.3) — pure-core tests for the plugin-side
// slot resolver factory. New-feature shape per cc-prompt-queue.md
// §120-129; coverage target: every observable behavior in the helper
// spec.

function makeHosted(
  responses: Record<string, string> = {},
  callsTracker: SlotRequest[] = [],
): HostedResolveSlot {
  return async (req: SlotRequest): Promise<SlotResponse> => {
    callsTracker.push(req);
    const key = await computeSlotCacheKey(
      req.slot_text, req.snippet_id, req.surrounding_context);
    return {
      python_expr: responses[req.slot_text] ?? `RESOLVED(${req.slot_text})`,
      cache_key: key,
    };
  };
}

// ---------------------------------------------------------------------
// computeSlotCacheKey
// ---------------------------------------------------------------------

test('computeSlotCacheKey: returns 64-hex-char sha256', async () => {
  const k = await computeSlotCacheKey('text', 'snippet', 'context');
  assert.strictEqual(k.length, 64);
  assert.match(k, /^[0-9a-f]{64}$/);
});

test('computeSlotCacheKey: same input → same output (deterministic)', async () => {
  const k1 = await computeSlotCacheKey('text', 'snippet', 'context');
  const k2 = await computeSlotCacheKey('text', 'snippet', 'context');
  assert.strictEqual(k1, k2);
});

test('computeSlotCacheKey: distinguishes slot_text', async () => {
  const k1 = await computeSlotCacheKey('text_a', 'snippet', 'context');
  const k2 = await computeSlotCacheKey('text_b', 'snippet', 'context');
  assert.notStrictEqual(k1, k2);
});

test('computeSlotCacheKey: distinguishes snippet_id', async () => {
  const k1 = await computeSlotCacheKey('text', 'snippet_a', 'context');
  const k2 = await computeSlotCacheKey('text', 'snippet_b', 'context');
  assert.notStrictEqual(k1, k2);
});

test('computeSlotCacheKey: distinguishes surrounding_context', async () => {
  const k1 = await computeSlotCacheKey('text', 'snippet', 'context_a');
  const k2 = await computeSlotCacheKey('text', 'snippet', 'context_b');
  assert.notStrictEqual(k1, k2);
});

test('computeSlotCacheKey: no concatenation collision via null-byte separator', async () => {
  const k1 = await computeSlotCacheKey('c', 'ab', '');
  const k2 = await computeSlotCacheKey('bc', 'a', '');
  assert.notStrictEqual(k1, k2);
});

test('computeSlotCacheKey: default empty context same as explicit empty', async () => {
  const k1 = await computeSlotCacheKey('text', 'snippet');
  const k2 = await computeSlotCacheKey('text', 'snippet', '');
  assert.strictEqual(k1, k2);
});

test('computeSlotCacheKey: rejects non-string input', async () => {
  await assert.rejects(
    // @ts-expect-error — intentionally pass wrong type
    () => computeSlotCacheKey(123, 'snippet'),
    TypeError);
  await assert.rejects(
    // @ts-expect-error — intentionally pass wrong type
    () => computeSlotCacheKey('text', 456),
    TypeError);
});

test('computeSlotCacheKey: matches Python helper byte-for-byte (cross-language determinism)', async () => {
  // Computed via Python:
  //   compute_slot_cache_key("the answer", "forge-moda/demo", "")
  //   → "07e931d8c9c59770f5bb8d3105d270e7fc4fcd5b323cb49964ef7d2c2f71c98d"
  // We assert the same output here. If this assertion ever fails, the
  // engine and plugin disagree on the cache key — diagnostic gold.
  const k = await computeSlotCacheKey('the answer', 'forge-moda/demo', '');
  assert.strictEqual(
    k,
    '07e931d8c9c59770f5bb8d3105d270e7fc4fcd5b323cb49964ef7d2c2f71c98d');
});

// ---------------------------------------------------------------------
// makeForgeSlotResolver — cache behavior
// ---------------------------------------------------------------------

test('makeForgeSlotResolver: cache hit returns cached value without calling hosted', async () => {
  const calls: SlotRequest[] = [];
  const hosted = makeHosted({}, calls);

  // Pre-populate cache with the value that should be returned.
  const cacheKey = await computeSlotCacheKey('the answer', 'snippet', '');
  const cache: Record<string, string> = { [cacheKey]: '42' };

  const resolver = makeForgeSlotResolver('snippet', cache, hosted);
  const result = await resolver('the answer');

  assert.strictEqual(result, '42');
  assert.strictEqual(calls.length, 0, 'hosted should not have been called');
});

test('makeForgeSlotResolver: cache miss calls hosted + writes to cache', async () => {
  const calls: SlotRequest[] = [];
  const hosted = makeHosted({ 'the answer': '42' }, calls);
  const cache: Record<string, string> = {};

  const resolver = makeForgeSlotResolver('snippet', cache, hosted);
  const result = await resolver('the answer');

  assert.strictEqual(result, '42');
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].slot_text, 'the answer');
  assert.strictEqual(calls[0].snippet_id, 'snippet');

  // Cache should be populated by side-effect.
  const cacheKey = await computeSlotCacheKey('the answer', 'snippet', '');
  assert.strictEqual(cache[cacheKey], '42');
});

test('makeForgeSlotResolver: second call after miss returns cached value (mutable cache)', async () => {
  const calls: SlotRequest[] = [];
  const hosted = makeHosted({ 'the answer': '42' }, calls);
  const cache: Record<string, string> = {};

  const resolver = makeForgeSlotResolver('snippet', cache, hosted);
  await resolver('the answer');   // populates cache
  await resolver('the answer');   // should be a cache hit

  assert.strictEqual(calls.length, 1, 'hosted should be called once total');
});

test('makeForgeSlotResolver: distinct snippets isolate caches', async () => {
  const calls: SlotRequest[] = [];
  const hosted = makeHosted({ 'the answer': '42' }, calls);

  const cacheA: Record<string, string> = {};
  const cacheB: Record<string, string> = {};

  const resolverA = makeForgeSlotResolver('snippet_a', cacheA, hosted);
  const resolverB = makeForgeSlotResolver('snippet_b', cacheB, hosted);

  await resolverA('the answer');
  await resolverB('the answer');

  // Both should hit the hosted endpoint (different snippet_id =
  // different cache key, so cacheA's entry doesn't satisfy cacheB).
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(Object.keys(cacheA).length, 1);
  assert.strictEqual(Object.keys(cacheB).length, 1);

  // The cache keys themselves are distinct.
  const keysA = Object.keys(cacheA);
  const keysB = Object.keys(cacheB);
  assert.notStrictEqual(keysA[0], keysB[0]);
});

test('makeForgeSlotResolver: hosted error propagates to caller', async () => {
  const hosted: HostedResolveSlot = async () => {
    throw new Error('LLM upstream 503');
  };
  const cache: Record<string, string> = {};

  const resolver = makeForgeSlotResolver('snippet', cache, hosted);

  await assert.rejects(
    () => resolver('the answer'),
    (err: Error) => err.message.includes('LLM upstream 503'));

  // Cache should NOT have been populated.
  assert.strictEqual(Object.keys(cache).length, 0);
});

test('makeForgeSlotResolver: server cache_key mismatch raises', async () => {
  // Defense-in-depth: server returns a cache_key that disagrees with
  // the client-computed key. Indicates protocol drift; the resolver
  // refuses to write a value under a key that may not be retrievable.
  const hosted: HostedResolveSlot = async () => ({
    python_expr: '42',
    cache_key: 'BAD_SERVER_KEY',
  });
  const cache: Record<string, string> = {};

  const resolver = makeForgeSlotResolver('snippet', cache, hosted);
  await assert.rejects(
    () => resolver('the answer'),
    (err: Error) => err.message.includes('cache_key') &&
                    err.message.includes('does not match'));
});

test('makeForgeSlotResolver: idempotent — same slot_text returns same value across calls', async () => {
  const hosted = makeHosted({ 'the answer': '42' });
  const cache: Record<string, string> = {};

  const resolver = makeForgeSlotResolver('snippet', cache, hosted);
  const v1 = await resolver('the answer');
  const v2 = await resolver('the answer');
  const v3 = await resolver('the answer');

  assert.strictEqual(v1, '42');
  assert.strictEqual(v2, '42');
  assert.strictEqual(v3, '42');
});

test('makeForgeSlotResolver: distinct slot_text within same snippet → separate cache entries', async () => {
  const hosted = makeHosted({
    'the answer': '42',
    'a calm blue': '"#3366cc"',
  });
  const cache: Record<string, string> = {};

  const resolver = makeForgeSlotResolver('snippet', cache, hosted);
  await resolver('the answer');
  await resolver('a calm blue');

  // Cache holds both, under distinct keys.
  assert.strictEqual(Object.keys(cache).length, 2);
  const values = Object.values(cache).sort();
  assert.deepStrictEqual(values, ['"#3366cc"', '42']);
});

test('makeForgeSlotResolver: no-op idempotence — re-resolving same slot does not change cache size', async () => {
  // The "no-op should remain no-op" assertion per cc-prompt-queue.md §131.
  const hosted = makeHosted({ 'the answer': '42' });
  const cache: Record<string, string> = {};
  const resolver = makeForgeSlotResolver('snippet', cache, hosted);

  await resolver('the answer');
  const sizeAfterFirst = Object.keys(cache).length;

  // Re-resolve — should be a cache hit; cache size should not grow.
  await resolver('the answer');
  const sizeAfterSecond = Object.keys(cache).length;

  assert.strictEqual(sizeAfterFirst, sizeAfterSecond);
});
