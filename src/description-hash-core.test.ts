// Tests for description-hash-core.ts.
//
// Mirrors english-hash-core.test.ts shape. Verifies the SHA-256 +
// whitespace-normalization contract is stable so cohort vaults don't
// see false-positive stale indicators after benign edits like a
// trailing newline being added.

import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { computeDescriptionHash } from './description-hash-core.ts';

describe('computeDescriptionHash', () => {
  test('returns hex sha256 (64 chars, lowercase)', async () => {
    const hash = await computeDescriptionHash('Print hello.');
    assert.match(hash, /^[0-9a-f]{64}$/);
  });

  test('empty string yields the sha256 of empty bytes', async () => {
    // sha256('') = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    const hash = await computeDescriptionHash('');
    assert.equal(
      hash,
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  test('null and undefined hash like empty string', async () => {
    const empty = await computeDescriptionHash('');
    assert.equal(await computeDescriptionHash(null), empty);
    assert.equal(await computeDescriptionHash(undefined), empty);
  });

  test('stable across same input', async () => {
    const a = await computeDescriptionHash('Print "hello".');
    const b = await computeDescriptionHash('Print "hello".');
    assert.equal(a, b);
  });

  test('different inputs yield different hashes', async () => {
    const a = await computeDescriptionHash('Print "hello".');
    const b = await computeDescriptionHash('Print "world".');
    assert.notEqual(a, b);
  });

  test('trailing newlines do not affect the hash', async () => {
    const a = await computeDescriptionHash('Print hello.');
    const b = await computeDescriptionHash('Print hello.\n\n\n');
    assert.equal(a, b);
  });

  test('leading blank lines do not affect the hash', async () => {
    const a = await computeDescriptionHash('Print hello.');
    const b = await computeDescriptionHash('\n\nPrint hello.');
    assert.equal(a, b);
  });

  test('trailing whitespace per line is stripped', async () => {
    const a = await computeDescriptionHash('Print hello.');
    const b = await computeDescriptionHash('Print hello.   \t');
    assert.equal(a, b);
  });

  test('internal blank lines are preserved (different from no blank)', async () => {
    const a = await computeDescriptionHash('Line one.\n\nLine two.');
    const b = await computeDescriptionHash('Line one.\nLine two.');
    assert.notEqual(a, b);
  });

  test('throws on non-string non-null input', async () => {
    await assert.rejects(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      computeDescriptionHash(42 as any),
      /must be string or null/,
    );
  });
});
