// [runSnippet-bare-id-collision-plus-english-hash-empty] (drain
// 2026-08-05-2100, mechanism b) — no writer may stamp a
// present-but-empty english_hash.
//
// Absent beats empty: executor.py's cache contract returns cached
// # Python when english_hash is ABSENT, but a present sha256("")
// fails the equality check and ends in `SnippetExecError: Empty or
// missing Python code` (main.ts:3705's "second independent cause").
// Drain 2230 guarded writeGeneratedCode; writeSourcePythonBack and
// handleSlotCacheMiss kept stamping empty hashes — 11 affected notes
// in ClaudeQA at drain time (test3.md among them).
//
// Two layers of protection:
//  1. Truth-table tests for `englishHashForStamp` (the single guarded
//     stamping decision).
//  2. A drift guard: main.ts must contain ZERO direct
//     `computeEnglishHash(` call sites — every writer routes through
//     the helper, so a future writer cannot silently reintroduce the
//     unguarded pattern. (Failing-first: 3 direct sites pre-fix.)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { computeEnglishHash, englishHashForStamp } from './english-hash-core.ts';

const SHA_EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

test('englishHashForStamp: null / undefined / empty / whitespace all decline to stamp', async () => {
  assert.equal(await englishHashForStamp(null), null);
  assert.equal(await englishHashForStamp(undefined), null);
  assert.equal(await englishHashForStamp(''), null);
  assert.equal(await englishHashForStamp('   \n\t '), null);
});

test('englishHashForStamp: non-empty English hashes identically to computeEnglishHash', async () => {
  const english = '  print "hello 999"';
  assert.equal(await englishHashForStamp(english), await computeEnglishHash(english));
});

test('englishHashForStamp: never returns the empty-string SHA', async () => {
  for (const input of [null, undefined, '', '  ']) {
    const got = await englishHashForStamp(input as string | null);
    assert.notEqual(got, SHA_EMPTY);
  }
});

test('drift guard: main.ts has no direct computeEnglishHash call sites', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'src', 'main.ts'), 'utf8');
  const direct = src.match(/computeEnglishHash\(/g) ?? [];
  assert.equal(
    direct.length,
    0,
    `main.ts has ${direct.length} direct computeEnglishHash call site(s); `
      + 'every english_hash writer must route through englishHashForStamp '
      + '(absent beats empty — see english-hash-core.ts).',
  );
});
