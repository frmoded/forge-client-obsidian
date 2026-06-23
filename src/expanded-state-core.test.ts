// v0.2.138 — failing-first TDD tests for expanded-state-core.
//
// Covers the per-snippet persistence contract per v0338 §3.1 +
// defensive paths around localStorage unavailability + malformed
// data.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readExpandedState,
  writeExpandedState,
  toggleExpanded,
  expandedStorageKey,
  type ExpandedStateStorage,
} from './expanded-state-core.ts';

/** Minimal in-memory storage for tests. */
function makeStorage(): ExpandedStateStorage & { _data: Map<string, string> } {
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

test('expandedStorageKey: stable shape per snippet path', () => {
  assert.equal(
    expandedStorageKey('forge-moda/simulation.md'),
    'forge:expanded:' + encodeURIComponent('forge-moda/simulation.md'),
  );
});

test('expandedStorageKey: URL-encodes special chars (defensive)', () => {
  // A path with `:` (e.g. Windows drive) or `?` shouldn't collide
  // with sibling keys.
  const key = expandedStorageKey('weird:path?with#chars.md');
  assert.equal(key.indexOf('forge:expanded:'), 0);
  // The encoded suffix doesn't contain unencoded `:` after the prefix.
  const suffix = key.slice('forge:expanded:'.length);
  assert.ok(!suffix.includes(':'), 'colon should be encoded');
});

test('readExpandedState: null storage → expanded:false', () => {
  const r = readExpandedState(null, 'forge-moda/simulation.md');
  assert.equal(r.expanded, false);
});

test('readExpandedState: undefined storage → expanded:false', () => {
  const r = readExpandedState(undefined, 'forge-moda/simulation.md');
  assert.equal(r.expanded, false);
});

test('readExpandedState: missing key → expanded:false', () => {
  const storage = makeStorage();
  const r = readExpandedState(storage, 'forge-moda/simulation.md');
  assert.equal(r.expanded, false);
});

test('readExpandedState: valid JSON {expanded:true} → expanded:true', () => {
  const storage = makeStorage();
  storage._data.set(
    expandedStorageKey('forge-moda/simulation.md'),
    JSON.stringify({ expanded: true }),
  );
  const r = readExpandedState(storage, 'forge-moda/simulation.md');
  assert.equal(r.expanded, true);
});

test('readExpandedState: valid JSON {expanded:false} → expanded:false', () => {
  const storage = makeStorage();
  storage._data.set(
    expandedStorageKey('forge-moda/simulation.md'),
    JSON.stringify({ expanded: false }),
  );
  const r = readExpandedState(storage, 'forge-moda/simulation.md');
  assert.equal(r.expanded, false);
});

test('readExpandedState: malformed JSON → expanded:false', () => {
  const storage = makeStorage();
  storage._data.set(
    expandedStorageKey('forge-moda/simulation.md'),
    'not valid json {{{{',
  );
  const r = readExpandedState(storage, 'forge-moda/simulation.md');
  assert.equal(r.expanded, false);
});

test('readExpandedState: non-object JSON (array) → expanded:false', () => {
  const storage = makeStorage();
  storage._data.set(
    expandedStorageKey('forge-moda/simulation.md'),
    JSON.stringify([true]),
  );
  const r = readExpandedState(storage, 'forge-moda/simulation.md');
  assert.equal(r.expanded, false);
});

test('readExpandedState: object with expanded as non-boolean → expanded:false', () => {
  const storage = makeStorage();
  storage._data.set(
    expandedStorageKey('forge-moda/simulation.md'),
    JSON.stringify({ expanded: 'true' }),
  );
  const r = readExpandedState(storage, 'forge-moda/simulation.md');
  assert.equal(r.expanded, false);
});

test('writeExpandedState + readExpandedState: roundtrip preserves true', () => {
  const storage = makeStorage();
  writeExpandedState(storage, 'forge-moda/simulation.md', { expanded: true });
  const r = readExpandedState(storage, 'forge-moda/simulation.md');
  assert.equal(r.expanded, true);
});

test('writeExpandedState + readExpandedState: roundtrip preserves false', () => {
  const storage = makeStorage();
  writeExpandedState(storage, 'forge-moda/simulation.md', { expanded: false });
  const r = readExpandedState(storage, 'forge-moda/simulation.md');
  assert.equal(r.expanded, false);
});

test('writeExpandedState: null storage → no-op (no throw)', () => {
  // Should not throw even if storage isn't available.
  writeExpandedState(null, 'forge-moda/simulation.md', { expanded: true });
});

test('toggleExpanded: from missing → expanded:true (and persisted)', () => {
  const storage = makeStorage();
  const after = toggleExpanded(storage, 'forge-moda/simulation.md');
  assert.equal(after.expanded, true);
  // Persisted.
  assert.equal(
    readExpandedState(storage, 'forge-moda/simulation.md').expanded,
    true,
  );
});

test('toggleExpanded: from true → false', () => {
  const storage = makeStorage();
  writeExpandedState(storage, 'forge-moda/simulation.md', { expanded: true });
  const after = toggleExpanded(storage, 'forge-moda/simulation.md');
  assert.equal(after.expanded, false);
});

test('toggleExpanded: from false → true', () => {
  const storage = makeStorage();
  writeExpandedState(storage, 'forge-moda/simulation.md', { expanded: false });
  const after = toggleExpanded(storage, 'forge-moda/simulation.md');
  assert.equal(after.expanded, true);
});

test('readExpandedState: storage that throws on getItem → expanded:false (defensive)', () => {
  const storage: ExpandedStateStorage = {
    getItem(): string | null { throw new Error('SecurityError'); },
    setItem(): void {},
  };
  const r = readExpandedState(storage, 'forge-moda/simulation.md');
  assert.equal(r.expanded, false);
});

test('writeExpandedState: storage that throws on setItem → no-op (no throw)', () => {
  const storage: ExpandedStateStorage = {
    getItem(): string | null { return null; },
    setItem(): void { throw new Error('QuotaExceededError'); },
  };
  // Should not throw.
  writeExpandedState(storage, 'forge-moda/simulation.md', { expanded: true });
});

test('per-path isolation: state for path A does not affect path B', () => {
  const storage = makeStorage();
  writeExpandedState(storage, 'forge-moda/simulation.md', { expanded: true });
  const a = readExpandedState(storage, 'forge-moda/simulation.md');
  const b = readExpandedState(storage, 'forge-tutorial/hello_world.md');
  assert.equal(a.expanded, true);
  assert.equal(b.expanded, false);
});
