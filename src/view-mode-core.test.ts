// v0.2.143 — failing-first tests for view-mode-core.
//
// Mirrors v0.2.138 expanded-state-core.test.ts shape. Covers the
// per-snippet persistence contract for the kit-notation toggle:
// missing/malformed/disabled-storage paths default to 'multi_staff'
// (or caller-supplied default); roundtrip + toggle work cleanly.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readScoreViewMode,
  writeScoreViewMode,
  toggleScoreViewMode,
  scoreViewModeKey,
  type ScoreViewMode,
  type ScoreViewModeStorage,
} from './view-mode-core.ts';

function makeStorage(): ScoreViewModeStorage & { _data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    _data: data,
    getItem(key: string): string | null {
      return data.has(key) ? (data.get(key) ?? null) : null;
    },
    setItem(key: string, value: string): void {
      data.set(key, value);
    },
  };
}

test('scoreViewModeKey: stable prefix + URL-encoded path', () => {
  assert.equal(
    scoreViewModeKey('forge-music/murmuration.md'),
    'forge:scoreView:' + encodeURIComponent('forge-music/murmuration.md'),
  );
});

test('scoreViewModeKey: encodes special chars defensively', () => {
  const key = scoreViewModeKey('weird:path?with#chars.md');
  assert.equal(key.indexOf('forge:scoreView:'), 0);
  const suffix = key.slice('forge:scoreView:'.length);
  assert.ok(!suffix.includes(':'), 'colon should be encoded');
});

test('readScoreViewMode: null storage → multi_staff default', () => {
  assert.equal(readScoreViewMode(null, 'forge-music/murmuration.md'), 'multi_staff');
});

test('readScoreViewMode: missing key → multi_staff default', () => {
  const storage = makeStorage();
  assert.equal(readScoreViewMode(storage, 'forge-music/murmuration.md'), 'multi_staff');
});

test('readScoreViewMode: respects custom default mode', () => {
  assert.equal(
    readScoreViewMode(null, 'forge-music/murmuration.md', 'kit'),
    'kit',
  );
});

test('readScoreViewMode: valid kit → kit', () => {
  const storage = makeStorage();
  storage._data.set(
    scoreViewModeKey('forge-music/murmuration.md'),
    JSON.stringify({ mode: 'kit' }),
  );
  assert.equal(readScoreViewMode(storage, 'forge-music/murmuration.md'), 'kit');
});

test('readScoreViewMode: valid multi_staff → multi_staff', () => {
  const storage = makeStorage();
  storage._data.set(
    scoreViewModeKey('forge-music/murmuration.md'),
    JSON.stringify({ mode: 'multi_staff' }),
  );
  assert.equal(readScoreViewMode(storage, 'forge-music/murmuration.md'), 'multi_staff');
});

test('readScoreViewMode: malformed JSON → default', () => {
  const storage = makeStorage();
  storage._data.set(
    scoreViewModeKey('forge-music/murmuration.md'),
    'not valid {{{{',
  );
  assert.equal(readScoreViewMode(storage, 'forge-music/murmuration.md'), 'multi_staff');
});

test('readScoreViewMode: unknown mode string → default', () => {
  const storage = makeStorage();
  storage._data.set(
    scoreViewModeKey('forge-music/murmuration.md'),
    JSON.stringify({ mode: 'orchestra' }),
  );
  assert.equal(readScoreViewMode(storage, 'forge-music/murmuration.md'), 'multi_staff');
});

test('readScoreViewMode: non-object JSON → default', () => {
  const storage = makeStorage();
  storage._data.set(
    scoreViewModeKey('forge-music/murmuration.md'),
    JSON.stringify(['kit']),
  );
  assert.equal(readScoreViewMode(storage, 'forge-music/murmuration.md'), 'multi_staff');
});

test('readScoreViewMode: storage throws on getItem → default (defensive)', () => {
  const storage: ScoreViewModeStorage = {
    getItem(): string | null { throw new Error('SecurityError'); },
    setItem(): void {},
  };
  assert.equal(readScoreViewMode(storage, 'forge-music/murmuration.md'), 'multi_staff');
});

test('writeScoreViewMode + readScoreViewMode: roundtrip kit', () => {
  const storage = makeStorage();
  writeScoreViewMode(storage, 'forge-music/murmuration.md', 'kit');
  assert.equal(readScoreViewMode(storage, 'forge-music/murmuration.md'), 'kit');
});

test('writeScoreViewMode + readScoreViewMode: roundtrip multi_staff', () => {
  const storage = makeStorage();
  writeScoreViewMode(storage, 'forge-music/murmuration.md', 'multi_staff');
  assert.equal(readScoreViewMode(storage, 'forge-music/murmuration.md'), 'multi_staff');
});

test('writeScoreViewMode: invalid mode → no-op', () => {
  const storage = makeStorage();
  writeScoreViewMode(
    storage,
    'forge-music/murmuration.md',
    'bogus' as ScoreViewMode,
  );
  // Storage stayed empty.
  assert.equal(storage._data.size, 0);
});

test('writeScoreViewMode: null storage → no-op (no throw)', () => {
  writeScoreViewMode(null, 'forge-music/murmuration.md', 'kit');
});

test('writeScoreViewMode: throwing setItem → no-op (no throw)', () => {
  const storage: ScoreViewModeStorage = {
    getItem(): string | null { return null; },
    setItem(): void { throw new Error('QuotaExceededError'); },
  };
  writeScoreViewMode(storage, 'forge-music/murmuration.md', 'kit');
});

test('toggleScoreViewMode: from missing → kit (and persisted)', () => {
  const storage = makeStorage();
  const after = toggleScoreViewMode(storage, 'forge-music/murmuration.md');
  assert.equal(after, 'kit');
  assert.equal(readScoreViewMode(storage, 'forge-music/murmuration.md'), 'kit');
});

test('toggleScoreViewMode: from multi_staff → kit', () => {
  const storage = makeStorage();
  writeScoreViewMode(storage, 'forge-music/murmuration.md', 'multi_staff');
  assert.equal(toggleScoreViewMode(storage, 'forge-music/murmuration.md'), 'kit');
});

test('toggleScoreViewMode: from kit → multi_staff', () => {
  const storage = makeStorage();
  writeScoreViewMode(storage, 'forge-music/murmuration.md', 'kit');
  assert.equal(toggleScoreViewMode(storage, 'forge-music/murmuration.md'), 'multi_staff');
});

test('per-path isolation: writing path A does not affect path B', () => {
  const storage = makeStorage();
  writeScoreViewMode(storage, 'forge-music/murmuration.md', 'kit');
  assert.equal(readScoreViewMode(storage, 'forge-music/murmuration.md'), 'kit');
  assert.equal(readScoreViewMode(storage, 'forge-music/percussion_lab.md'), 'multi_staff');
});
