// Tests for legacy-music-rename-core (v0.2.333 Phase 5 two-vault
// split, drain 2026-08-06-1800). New-feature discipline: every
// observable behavior in the decision table + the load-bearing Notice
// strings.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEGACY_MUSIC_DIR,
  LEGACY_MUSIC_BACKUP_DIR,
  LEGACY_MUSIC_VARIANT_DIR,
  decideLegacyMusicRename,
  legacyMusicRenameNotice,
  legacyVariantRenameNotice,
} from './legacy-music-rename-core.ts';

test('old dir present, backup slot free → rename', () => {
  assert.equal(
    decideLegacyMusicRename({ oldExists: true, backupExists: false }),
    'rename',
  );
});

test('no old dir, no backup → skip-no-old (fresh vault)', () => {
  assert.equal(
    decideLegacyMusicRename({ oldExists: false, backupExists: false }),
    'skip-no-old',
  );
});

test('no old dir, backup present → skip-no-old (idempotent re-load after park)', () => {
  assert.equal(
    decideLegacyMusicRename({ oldExists: false, backupExists: true }),
    'skip-no-old',
  );
});

test('BOTH old dir and backup present → skip-backup-exists (never clobber)', () => {
  assert.equal(
    decideLegacyMusicRename({ oldExists: true, backupExists: true }),
    'skip-backup-exists',
  );
});

// Drain 2026-08-08-1200 — driver's manual mid-migration rename left
// `forge-music.legacy/` (no `.bak.` segment) in three vaults; the
// engine's _BAK_DIR_PATTERN is a bare `\.bak\.` substring match, so
// that dir still registers at snippet discovery and collides with the
// music-theory bundle (AmbiguousSnippetResolutionError on same-basename
// notes). The variant must park to the same backup slot.

test('legacy .legacy variant present, backup slot free → rename-legacy-variant', () => {
  assert.equal(
    decideLegacyMusicRename({
      oldExists: false,
      backupExists: false,
      legacyVariantExists: true,
    }),
    'rename-legacy-variant',
  );
});

test('legacy .legacy variant present, backup taken → skip-backup-exists (never clobber)', () => {
  assert.equal(
    decideLegacyMusicRename({
      oldExists: false,
      backupExists: true,
      legacyVariantExists: true,
    }),
    'skip-backup-exists',
  );
});

test('BOTH forge-music and .legacy variant present, backup free → rename (original wins the slot)', () => {
  // The variant is left in place, neutralized by the pyodide-host
  // mount-skip entry. Never observed in a real vault.
  assert.equal(
    decideLegacyMusicRename({
      oldExists: true,
      backupExists: false,
      legacyVariantExists: true,
    }),
    'rename',
  );
});

test('variant parked on a prior load → skip-no-old (idempotent re-load)', () => {
  assert.equal(
    decideLegacyMusicRename({
      oldExists: false,
      backupExists: true,
      legacyVariantExists: false,
    }),
    'skip-no-old',
  );
});

test('variant dir-name constant: exactly the driver-observed name, and NOT .bak.-excluded', () => {
  assert.equal(LEGACY_MUSIC_VARIANT_DIR, 'forge-music.legacy');
  // The absence of a `.bak.` segment is the whole bug: the engine's
  // _BAK_DIR_PATTERN (bare `\.bak\.` substring) does not exclude it.
  assert.doesNotMatch(LEGACY_MUSIC_VARIANT_DIR, /\.bak\./);
});

test('variant notice names the parked dir, the backup, and music-theory', () => {
  const notice = legacyVariantRenameNotice();
  assert.ok(notice.includes(LEGACY_MUSIC_VARIANT_DIR));
  assert.ok(notice.includes(LEGACY_MUSIC_BACKUP_DIR));
  assert.ok(notice.includes('music-theory/'));
  assert.ok(notice.startsWith('Forge: '));
});

test('dir-name constants: backup rides the .bak. exclusion machinery', () => {
  assert.equal(LEGACY_MUSIC_DIR, 'forge-music');
  // The `.bak.` segment is load-bearing: it is what makes the parked
  // copy invisible to engine snippet discovery (v0.2.78
  // _BAK_DIR_PATTERN) and covered by the v0.2.82 read-only UX cues.
  assert.match(LEGACY_MUSIC_BACKUP_DIR, /\.bak\./);
  assert.equal(LEGACY_MUSIC_BACKUP_DIR, 'forge-music.bak.legacy');
});

test('notice text names both the parked dir and the new library dir', () => {
  const notice = legacyMusicRenameNotice();
  assert.ok(notice.includes(LEGACY_MUSIC_BACKUP_DIR));
  assert.ok(notice.includes('music-theory/'));
  assert.ok(notice.startsWith('Forge: '));
});
