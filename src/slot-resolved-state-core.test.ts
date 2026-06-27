// v0.2.210 — pure-core tests for Slot Phase 3.5 helpers.

import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  extractSlotCacheKeys,
  matchSlotToResolution,
} from './slot-resolved-state-core.ts';

const HEX64 = 'a'.repeat(64);
const HEX64_B = 'b'.repeat(64);

const BLOCK_FORM = `---
type: action
slot_cache:
  ${HEX64}:
    resolved_expression: '"hello world"'
    ts: '2026-06-29T00:00:00Z'
  ${HEX64_B}:
    resolved_expression: '"goodbye"'
    ts: '2026-06-29T00:00:01Z'
---

# Description
...
`;

const FLAT_FORM = `---
type: action
slot_cache: { "${HEX64}": "x", "${HEX64_B}": "y" }
---

# Description
...
`;

const NO_CACHE = `---
type: action
---

# Description
...
`;

describe('extractSlotCacheKeys', () => {
  test('block-mapping form parses all hex keys', () => {
    const keys = extractSlotCacheKeys(BLOCK_FORM);
    assert.equal(keys.size, 2);
    assert.ok(keys.has(HEX64));
    assert.ok(keys.has(HEX64_B));
  });

  test('flat single-line form parses both keys', () => {
    const keys = extractSlotCacheKeys(FLAT_FORM);
    assert.equal(keys.size, 2);
    assert.ok(keys.has(HEX64));
    assert.ok(keys.has(HEX64_B));
  });

  test('no slot_cache → empty set', () => {
    const keys = extractSlotCacheKeys(NO_CACHE);
    assert.equal(keys.size, 0);
  });

  test('no frontmatter → empty set', () => {
    const keys = extractSlotCacheKeys('# Description\n...');
    assert.equal(keys.size, 0);
  });

  test('malformed frontmatter (no close ---) → empty set', () => {
    const keys = extractSlotCacheKeys(
      '---\nslot_cache:\n  ' + HEX64 + ':\n');
    assert.equal(keys.size, 0);
  });

  test('block form: another top-level key after slot_cache stops scan', () => {
    const body = `---
type: action
slot_cache:
  ${HEX64}:
    resolved_expression: '"x"'
other_field: value
---

`;
    const keys = extractSlotCacheKeys(body);
    assert.equal(keys.size, 1);
    assert.ok(keys.has(HEX64));
  });

  test('block form ignores non-hex lines (defensive)', () => {
    const body = `---
type: action
slot_cache:
  invalid-not-hex: nope
  ${HEX64}:
    resolved_expression: '"ok"'
---

`;
    const keys = extractSlotCacheKeys(body);
    // Strict matcher: only 64-char lowercase hex.
    assert.equal(keys.size, 1);
    assert.ok(keys.has(HEX64));
  });
});

describe('matchSlotToResolution', () => {
  const hasher = async (slotText: string, snippetId: string, _ctx?: string) => {
    // Stable fake: hex64 = first letter of slotText repeated.
    const ch = slotText.charAt(0).toLowerCase() || 'z';
    return ch.repeat(64);
  };

  test('key in cache → resolved', async () => {
    const cache = new Set(['a'.repeat(64)]);
    const state = await matchSlotToResolution(
      'apple', 'my/snippet', cache, hasher);
    assert.equal(state, 'resolved');
  });

  test('key not in cache → unresolved', async () => {
    const cache = new Set(['x'.repeat(64)]);
    const state = await matchSlotToResolution(
      'apple', 'my/snippet', cache, hasher);
    assert.equal(state, 'unresolved');
  });

  test('empty cache → unresolved', async () => {
    const state = await matchSlotToResolution(
      'apple', 'my/snippet', new Set(), hasher);
    assert.equal(state, 'unresolved');
  });
});
