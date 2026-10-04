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

test('libraryForActiveFilePath: music libraries are not bundled on the lean branch', () => {
  assert.equal(libraryForActiveFilePath('music-theory/lab.md'), null);
  assert.equal(libraryForActiveFilePath('music-core/sketch.md'), null);
  // Pre-split name is no longer a known library — a stale forge-music/
  // dir (or the parked forge-music.bak.legacy/) must not fold-group.
  assert.equal(libraryForActiveFilePath('forge-music/lab.md'), null);
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
    'forge-tutorial/01-hello/Hello.md',
    ['forge-tutorial', 'forge-moda', 'Moda library'],
  );
  // Active file's own library wins → only forge-tutorial expanded; Moda
  // library stays closed even though it's another known group.
  assert.deepEqual(Array.from(r), ['forge-tutorial']);
});

// ---------------------------------------------------------------------------
// Music-edition Phase 2 — both editions' expectations pinned EXPLICITLY. The tests above run against
// the ambient (lean) build; these pass each edition's bundled set so the music behavior the lean
// strip removed (787961d) is covered too, without needing a music build.
// ---------------------------------------------------------------------------
import { EDITION_VAULT_NAMES } from './edition-core.ts';

const LEAN_SET: ReadonlySet<string> = new Set(EDITION_VAULT_NAMES.lean);
const MUSIC_SET: ReadonlySet<string> = new Set(EDITION_VAULT_NAMES.music);

test('edition-explicit: lean does not recognize music libraries; music does (v0.2.333 split)', () => {
  assert.equal(libraryForActiveFilePath('music-theory/lab.md', LEAN_SET), null);
  assert.equal(libraryForActiveFilePath('music-core/sketch.md', LEAN_SET), null);
  assert.equal(libraryForActiveFilePath('music-theory/lab.md', MUSIC_SET), 'music-theory');
  assert.equal(libraryForActiveFilePath('music-core/sketch.md', MUSIC_SET), 'music-core');
  // Both editions: the pre-split name is never a library (stale forge-music/ must not fold-group).
  assert.equal(libraryForActiveFilePath('forge-music/lab.md', LEAN_SET), null);
  assert.equal(libraryForActiveFilePath('forge-music/lab.md', MUSIC_SET), null);
  // Both editions: moda and tutorial are libraries.
  for (const set of [LEAN_SET, MUSIC_SET]) {
    assert.equal(libraryForActiveFilePath('forge-moda/x.md', set), 'forge-moda');
    assert.equal(libraryForActiveFilePath('forge-tutorial/01-hello/x.md', set), 'forge-tutorial');
  }
});

test('edition-explicit (music): an active music-theory note expands only music-theory', () => {
  const r = initialExpandedLibraries(
    'music-theory/slow_burn/twelve_bar_blues_progression.md',
    ['music-theory', 'forge-moda', 'Music library'],
    MUSIC_SET,
  );
  // Music context wins -> only music-theory expanded; Music library stays closed even though it's the
  // semantically related group. (Pre-strip assertion, restored for the music edition.)
  assert.deepEqual(Array.from(r), ['music-theory']);
});

test('edition-explicit (lean): the same music-theory path has no library context, so every non-library group expands', () => {
  const r = initialExpandedLibraries(
    'music-theory/slow_burn/twelve_bar_blues_progression.md',
    ['music-theory', 'forge-moda', 'Music library'],
    LEAN_SET,
  );
  assert.deepEqual(Array.from(r).sort(), ['forge-moda', 'music-theory']);
});

test('edition-explicit: the ambient default equals the current edition (lean in the committed tree)', () => {
  assert.equal(libraryForActiveFilePath('music-theory/lab.md'), null);
  assert.equal(libraryForActiveFilePath('forge-moda/lab.md'), 'forge-moda');
});
