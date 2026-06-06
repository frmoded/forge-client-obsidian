// Pure-core tests for chips-walk-up-core. Runs under `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { walkUpChipsConfigs } from './chips-walk-up-core.ts';

test('walkUp: file in nested chapter under vault-root library → returns chapter then root + meta', () => {
  const existing = new Set([
    '01-hello/_chips.md',
    '_chips.md',
    '_meta/_chips.md',
  ]);
  const out = walkUpChipsConfigs('01-hello/hello.md', '', existing);
  assert.deepEqual(out, ['01-hello/_chips.md', '_chips.md', '_meta/_chips.md']);
});

test('walkUp: file at vault root → walks vault-root + meta only', () => {
  const existing = new Set(['_chips.md', '_meta/_chips.md']);
  const out = walkUpChipsConfigs('foo.md', '', existing);
  assert.deepEqual(out, ['_chips.md', '_meta/_chips.md']);
});

test('walkUp: deeply nested file (3 levels) → 4-step walk including root', () => {
  const existing = new Set([
    'a/b/c/_chips.md',
    'a/b/_chips.md',
    'a/_chips.md',
    '_chips.md',
  ]);
  const out = walkUpChipsConfigs('a/b/c/snippet.md', '', existing);
  assert.deepEqual(out, [
    'a/b/c/_chips.md',
    'a/b/_chips.md',
    'a/_chips.md',
    '_chips.md',
  ]);
});

test('walkUp: levels with no _chips.md are skipped (only existing files returned)', () => {
  const existing = new Set([
    'a/b/c/_chips.md',
    // no a/b/_chips.md
    'a/_chips.md',
    // no vault-root _chips.md
    '_meta/_chips.md',
  ]);
  const out = walkUpChipsConfigs('a/b/c/snippet.md', '', existing);
  assert.deepEqual(out, [
    'a/b/c/_chips.md',
    'a/_chips.md',
    '_meta/_chips.md',
  ]);
});

test('walkUp: respects library root boundary (never walks above libraryRoot)', () => {
  // File at forge-music/blues/song.md with libraryRoot=forge-music.
  // Walk should NOT include vault-root _chips.md.
  const existing = new Set([
    'forge-music/blues/_chips.md',
    'forge-music/_chips.md',
    'forge-music/_meta/_chips.md',
    '_chips.md',  // vault-root — must NOT be in the result
  ]);
  const out = walkUpChipsConfigs(
    'forge-music/blues/song.md',
    'forge-music',
    existing,
  );
  assert.deepEqual(out, [
    'forge-music/blues/_chips.md',
    'forge-music/_chips.md',
    'forge-music/_meta/_chips.md',
  ]);
});

test('walkUp: empty existingFiles → returns []', () => {
  const out = walkUpChipsConfigs('a/b/c.md', '', new Set());
  assert.deepEqual(out, []);
});

test('walkUp: idempotent (same input → same output)', () => {
  const existing = new Set(['a/_chips.md', '_meta/_chips.md']);
  const a = walkUpChipsConfigs('a/x.md', '', existing);
  const b = walkUpChipsConfigs('a/x.md', '', existing);
  assert.deepEqual(a, b);
});

test('walkUp: file directly at library root (no subdir) → library-root level only', () => {
  // forge-music/song.md with libraryRoot=forge-music.
  const existing = new Set([
    'forge-music/_chips.md',
    'forge-music/_meta/_chips.md',
  ]);
  const out = walkUpChipsConfigs(
    'forge-music/song.md',
    'forge-music',
    existing,
  );
  assert.deepEqual(out, [
    'forge-music/_chips.md',
    'forge-music/_meta/_chips.md',
  ]);
});

test('walkUp: meta location appears only at library root, NOT at subdirs', () => {
  // Sub-chapter `_meta/_chips.md` should NOT be discovered — meta is the
  // library-root convention only, not a per-chapter pattern.
  const existing = new Set([
    '01-hello/_meta/_chips.md',  // unusual; should NOT be picked up
    '_meta/_chips.md',
  ]);
  const out = walkUpChipsConfigs('01-hello/hello.md', '', existing);
  // Only vault-root _meta/_chips.md (library-root level).
  assert.deepEqual(out, ['_meta/_chips.md']);
});

test('walkUp: walk-up via the no-_chips.md path still terminates correctly', () => {
  const existing = new Set<string>();
  const out = walkUpChipsConfigs('a/b/c/d.md', '', existing);
  assert.deepEqual(out, []);
});
