import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  libraryForActiveFilePath,
  initialExpandedLibraries,
} from './chip-folding-core.ts';

test('libraryForActiveFilePath: forge-moda match', () => {
  assert.equal(libraryForActiveFilePath('forge-moda/simulation.md'), 'forge-moda');
  assert.equal(libraryForActiveFilePath('forge-moda/sub/file.md'), 'forge-moda');
});

test('libraryForActiveFilePath: forge-music match', () => {
  assert.equal(libraryForActiveFilePath('forge-music/lab.md'), 'forge-music');
});

test('libraryForActiveFilePath: forge-tutorial match', () => {
  assert.equal(libraryForActiveFilePath('forge-tutorial/01-hello/x.md'), 'forge-tutorial');
});

test('libraryForActiveFilePath: vault root file → null', () => {
  assert.equal(libraryForActiveFilePath('hello.md'), null);
  assert.equal(libraryForActiveFilePath('welcome.md'), null);
});

test('libraryForActiveFilePath: null input', () => {
  assert.equal(libraryForActiveFilePath(null), null);
});

test('libraryForActiveFilePath: case-sensitive (forge-Moda does not match)', () => {
  assert.equal(libraryForActiveFilePath('Forge-Moda/x.md'), null);
});

test('initialExpandedLibraries: active in moda + all three present → only moda', () => {
  const r = initialExpandedLibraries(
    'forge-moda/simulation.md',
    ['forge-moda', 'forge-music', 'forge-tutorial'],
  );
  assert.deepEqual(Array.from(r).sort(), ['forge-moda']);
});

test('initialExpandedLibraries: active in tutorial → only tutorial', () => {
  const r = initialExpandedLibraries(
    'forge-tutorial/01-hello/hello.md',
    ['forge-moda', 'forge-music', 'forge-tutorial'],
  );
  assert.deepEqual(Array.from(r).sort(), ['forge-tutorial']);
});

test('initialExpandedLibraries: vault root → all expanded', () => {
  const r = initialExpandedLibraries(
    'hello.md',
    ['forge-moda', 'forge-music', 'forge-tutorial'],
  );
  assert.deepEqual(Array.from(r).sort(), ['forge-moda', 'forge-music', 'forge-tutorial']);
});

test('initialExpandedLibraries: null active → all expanded', () => {
  const r = initialExpandedLibraries(null, ['forge-moda', 'forge-tutorial']);
  assert.deepEqual(Array.from(r).sort(), ['forge-moda', 'forge-tutorial']);
});

test('initialExpandedLibraries: active in moda but moda not present in loaded chips → fall back to all', () => {
  // Edge case: user is in a moda snippet but the chip palette only
  // has tutorial/music chips loaded. Expand what's there.
  const r = initialExpandedLibraries(
    'forge-moda/simulation.md',
    ['forge-music', 'forge-tutorial'],
  );
  assert.deepEqual(Array.from(r).sort(), ['forge-music', 'forge-tutorial']);
});

// Drain 2330 — library-note groups (source name ends " library") start
// collapsed by default because they're secondary discovery surface;
// user-authored vault content wins visual priority.
test('initialExpandedLibraries: vault root → library-note groups excluded from default-open', () => {
  const r = initialExpandedLibraries(
    'hello.md',
    ['forge-moda', 'forge-music', 'Music library', 'Moda library'],
  );
  // Vault groups expanded; library groups collapsed.
  assert.deepEqual(
    Array.from(r).sort(),
    ['forge-moda', 'forge-music'],
  );
});

test('initialExpandedLibraries: null active + only library groups → nothing expanded', () => {
  // Fresh vault with no vault content, just library chips → palette
  // opens with everything collapsed. User can expand a library group
  // if they want to browse.
  const r = initialExpandedLibraries(
    null,
    ['Music library', 'Moda library'],
  );
  assert.equal(r.size, 0);
});

test('initialExpandedLibraries: active in known lib still expands only that one (library groups stay closed)', () => {
  const r = initialExpandedLibraries(
    'forge-music/slow_burn/twelve_bar_blues_progression.md',
    ['forge-music', 'forge-moda', 'Music library'],
  );
  // Music context wins → only forge-music expanded; Music library
  // stays closed even though it's the semantically related group.
  assert.deepEqual(Array.from(r), ['forge-music']);
});
