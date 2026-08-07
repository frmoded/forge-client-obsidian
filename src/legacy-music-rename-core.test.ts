// Tests for legacy-music-rename-core (v0.2.333 Phase 5 two-vault
// split, drain 2026-08-06-1800). New-feature discipline: every
// observable behavior in the decision table + the load-bearing Notice
// strings.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEGACY_MUSIC_DIR,
  LEGACY_MUSIC_BACKUP_DIR,
  decideLegacyMusicRename,
  legacyMusicRenameNotice,
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
