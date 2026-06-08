// v0.2.82 Item B — tests for bak-path-core helpers.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isBakPath, bakDedupKey, baseLibraryName } from './bak-path-core.ts';

// --- isBakPath -------------------------------------------------------

test('isBakPath: path inside a `.bak.<version>` dir → true', () => {
  assert.equal(
    isBakPath('forge-tutorial.bak.0.1.0/01-hello/Hello.md'), true);
});

test('isBakPath: path in a regular library dir → false', () => {
  assert.equal(isBakPath('forge-tutorial/01-hello/Hello.md'), false);
});

test('isBakPath: backup dir is nested under another dir → true', () => {
  assert.equal(
    isBakPath('archive/forge-music.bak.0.3.5/blues/song.md'), true);
});

test('isBakPath: vault-root file with `.bak.` in basename only → false', () => {
  // `.bak.` in the file basename (not a directory segment) is not the
  // v0.2.78 auto-re-extract pattern. Don't false-positive on user
  // notes named like `mybackup.bak.md` or similar.
  assert.equal(isBakPath('mybackup.bak.md'), false);
});

test('isBakPath: empty / null / undefined → false', () => {
  assert.equal(isBakPath(''), false);
  assert.equal(isBakPath(null), false);
  assert.equal(isBakPath(undefined), false);
});

test('isBakPath: top-level bak dir with single nested file → true', () => {
  assert.equal(isBakPath('forge-tutorial.bak.0.1.0/forge.toml'), true);
});

test('isBakPath: collision-suffix `.bak.<ver>.<n>` shape → true', () => {
  // v0.2.78 collision suffix pattern.
  assert.equal(
    isBakPath('forge-music.bak.0.3.5.2/percussion/wake.md'), true);
});

// --- bakDedupKey -----------------------------------------------------

test('bakDedupKey: returns the first matching bak dir prefix', () => {
  assert.equal(
    bakDedupKey('forge-tutorial.bak.0.1.0/01-hello/Hello.md'),
    'forge-tutorial.bak.0.1.0');
});

test('bakDedupKey: nested bak dir returns the full path prefix', () => {
  assert.equal(
    bakDedupKey('archive/forge-music.bak.0.3.5/blues/song.md'),
    'archive/forge-music.bak.0.3.5');
});

test('bakDedupKey: no bak segment → null', () => {
  assert.equal(bakDedupKey('forge-tutorial/01-hello/Hello.md'), null);
});

test('bakDedupKey: empty path → null', () => {
  assert.equal(bakDedupKey(''), null);
  assert.equal(bakDedupKey(null), null);
});

test('bakDedupKey: two distinct backup dirs produce distinct keys', () => {
  // Different .bak versions → distinct Notice fires for each.
  const k1 = bakDedupKey('forge-tutorial.bak.0.1.0/a.md');
  const k2 = bakDedupKey('forge-tutorial.bak.0.1.1/b.md');
  assert.notEqual(k1, k2);
  assert.equal(k1, 'forge-tutorial.bak.0.1.0');
  assert.equal(k2, 'forge-tutorial.bak.0.1.1');
});

// --- baseLibraryName -------------------------------------------------

test('baseLibraryName: simple bak dir → base name', () => {
  assert.equal(baseLibraryName('forge-tutorial.bak.0.1.0'), 'forge-tutorial');
});

test('baseLibraryName: collision-suffix bak dir → base name', () => {
  assert.equal(
    baseLibraryName('forge-music.bak.0.3.5.2'), 'forge-music');
});

test('baseLibraryName: non-bak dir → unchanged', () => {
  assert.equal(baseLibraryName('forge-tutorial'), 'forge-tutorial');
});

test('baseLibraryName: empty → unchanged', () => {
  assert.equal(baseLibraryName(''), '');
});
