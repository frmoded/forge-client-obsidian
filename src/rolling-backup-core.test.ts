// TDD failing-test-first — drain 2026-08-25-0120.
//
// Driver adjudicated 1620 as option (b): re-extract keeps ONE rolling
// backup per vault, overwritten each time. Not delete-on-extract
// (v0.2.106, superseded) and not the v0.2.39 `.bak.<version>` litter
// that 1620 found the two stale docstrings describing.
//
// Two things this suite has to prove that a naive implementation gets
// wrong:
//
//   1. NAME CONSTRAINT (cc-prompt-queue ~648). A bare `<vault>.bak/`
//      does NOT match the engine's `\.bak\.` exclusion — the pattern
//      needs the TRAILING dot. Asserted against the vendored engine
//      source and against the plugin's own mount-skip mirror, so the
//      name cannot quietly stop being excluded.
//
//   2. `sweepLegacyBakDirs` runs on EVERY onload and rmdir's any vault-
//      root folder starting with `forge-moda.bak.` / `forge-tutorial
//      .bak.`. A rolling backup named `<vault>.bak.previous` is exactly
//      that shape, so without an explicit carve-out the sweep destroys
//      the backup on the next plugin load and the feature silently
//      ships as delete-on-extract with extra steps.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ROLLING_BACKUP_SUFFIX,
  rollingBackupDirFor,
  isRollingBackupDir,
  planRollingBackup,
  shouldSweepLegacyBakDir,
  countBackupDirsFor,
} from './rolling-backup-core.ts';
import { BAK_DIR_PATTERN, isReservedDirName } from './vault-mount-exclusions-core.ts';
import { isBakPath } from './bak-path-core.ts';

test('one fixed backup dir per vault, derived from the vault name', () => {
  assert.equal(rollingBackupDirFor('forge-moda'), 'forge-moda.bak.previous');
  assert.equal(rollingBackupDirFor('music-theory'), 'music-theory.bak.previous');
  // No version, no timestamp, no collision suffix — that is the whole
  // point of "exactly one backup exists at any time".
  assert.equal(rollingBackupDirFor('forge-moda'), rollingBackupDirFor('forge-moda'));
});

test('NAME CONSTRAINT: the backup name is invisible to the ENGINE walk', () => {
  const engine = readFileSync(
    join(import.meta.dirname, '..', 'assets', 'engine', 'forge', 'core',
         'snippet_registry.py'), 'utf8');
  const m = engine.match(/_BAK_DIR_PATTERN\s*=\s*re\.compile\(r"([^"]+)"\)/);
  assert.ok(m, 'vendored engine no longer defines _BAK_DIR_PATTERN as expected');
  const enginePattern = new RegExp(m![1]);

  assert.equal(enginePattern.test(rollingBackupDirFor('forge-moda')), true);

  // Non-vacuity: the trailing dot is load-bearing. If someone "tidies"
  // the suffix to `.bak`, this is the assertion that fires.
  assert.equal(enginePattern.test('forge-moda.bak'), false);
  assert.ok(ROLLING_BACKUP_SUFFIX.startsWith('.bak.'),
    'suffix must carry the trailing dot the engine pattern requires');
});

test('NAME CONSTRAINT: the backup name is invisible to the plugin MOUNT', () => {
  assert.equal(BAK_DIR_PATTERN.test(rollingBackupDirFor('forge-moda')), true);
  assert.equal(isReservedDirName(rollingBackupDirFor('music-core')), true);
  assert.equal(isReservedDirName('forge-moda.bak'), false); // non-vacuity
});

test('the backup name reads as a .bak path to the click-through Notice', () => {
  assert.equal(isBakPath('forge-moda.bak.previous/01-hello/Hello.md'), true);
});

test('planRollingBackup: first re-extract creates, second REPLACES', () => {
  const first = planRollingBackup('forge-moda', []);
  assert.equal(first.backupDir, 'forge-moda.bak.previous');
  assert.equal(first.removeExistingFirst, false);

  const second = planRollingBackup('forge-moda', ['forge-moda', 'forge-moda.bak.previous']);
  assert.equal(second.backupDir, 'forge-moda.bak.previous');
  assert.equal(second.removeExistingFirst, true);

  // A DIFFERENT vault's backup must not make this one think it has one.
  const other = planRollingBackup('forge-moda', ['music-theory.bak.previous']);
  assert.equal(other.removeExistingFirst, false);
});

test('the onload sweep must NOT eat the rolling backup', () => {
  const candidates = ['forge-moda', 'forge-tutorial'];
  // Legacy versioned litter — still swept.
  assert.equal(shouldSweepLegacyBakDir('forge-moda.bak.0.1.0', candidates), true);
  assert.equal(shouldSweepLegacyBakDir('forge-tutorial.bak.0.2.5.1', candidates), true);
  // The rolling backup — never swept.
  assert.equal(shouldSweepLegacyBakDir('forge-moda.bak.previous', candidates), false);
  assert.equal(shouldSweepLegacyBakDir('forge-tutorial.bak.previous', candidates), false);
  // Unrelated user dirs — untouched, as before.
  assert.equal(shouldSweepLegacyBakDir('my-notes.bak.2020', candidates), false);
  assert.equal(shouldSweepLegacyBakDir('forge-music.bak.legacy', candidates), false);
});

test('at-most-one guard fires on a deliberately planted second backup', () => {
  // Non-vacuity for §3: the detector must actually detect.
  assert.equal(countBackupDirsFor('forge-moda', [
    'forge-moda', 'forge-moda.bak.previous',
  ]), 1);
  assert.equal(countBackupDirsFor('forge-moda', [
    'forge-moda', 'forge-moda.bak.previous', 'forge-moda.bak.0.1.0',
  ]), 2);
  assert.equal(countBackupDirsFor('forge-moda', ['forge-moda']), 0);
  // Another vault's backups don't count toward this vault's total.
  assert.equal(countBackupDirsFor('forge-moda', ['music-theory.bak.previous']), 0);
});

test('isRollingBackupDir is exact, not a prefix match', () => {
  assert.equal(isRollingBackupDir('forge-moda.bak.previous'), true);
  assert.equal(isRollingBackupDir('forge-moda.bak.previous.1'), false);
  assert.equal(isRollingBackupDir('forge-moda.bak.0.1.0'), false);
  assert.equal(isRollingBackupDir('forge-moda'), false);
});

// ---------------------------------------------------------------
// End-to-end over an in-memory adapter.
//
// This runs the SAME three calls the manual re-extract command makes
// (planRollingBackup → rmdir-if-present → the real copyDirRecursive),
// so it proves the sequence, not a paraphrase of it. The auto path
// differs only in using rename where this uses copy — asserted
// separately below.
// ---------------------------------------------------------------

import { copyDirRecursive } from './copy-dir-core.ts';

function makeAdapter(seed: Record<string, string> = {}) {
  const files = new Map<string, string>(Object.entries(seed));
  const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
  const dec = (b: ArrayBuffer) => new TextDecoder().decode(new Uint8Array(b));
  const dirsUnder = (path: string) => {
    const f = new Set<string>(), d = new Set<string>();
    for (const k of files.keys()) {
      if (path !== '/' && !k.startsWith(`${path}/`)) continue;
      const rest = path === '/' ? k : k.slice(path.length + 1);
      const slash = rest.indexOf('/');
      if (slash === -1) f.add(path === '/' ? rest : `${path}/${rest}`);
      else d.add(path === '/' ? rest.slice(0, slash) : `${path}/${rest.slice(0, slash)}`);
    }
    return { files: [...f].sort(), folders: [...d].sort() };
  };
  return {
    files,
    mkdir: async () => {},
    list: async (p: string) => dirsUnder(p),
    readBinary: async (p: string) => enc(files.get(p)!),
    writeBinary: async (p: string, b: ArrayBuffer) => { files.set(p, dec(b)); },
    rmdir: async (p: string) => {
      for (const k of [...files.keys()]) if (k === p || k.startsWith(`${p}/`)) files.delete(k);
    },
    rename: async (from: string, to: string) => {
      for (const k of [...files.keys()]) {
        if (k === from || k.startsWith(`${from}/`)) {
          files.set(to + k.slice(from.length), files.get(k)!);
          files.delete(k);
        }
      }
    },
  };
}

/** The manual command's sequence, verbatim. */
async function snapshot(a: ReturnType<typeof makeAdapter>, root: string) {
  const plan = planRollingBackup(root, (await a.list('/')).folders);
  if (plan.removeExistingFirst) await a.rmdir(plan.backupDir);
  await copyDirRecursive(a, root, plan.backupDir);
}

test('restored-from-backup content matches the pre-extract state', async () => {
  const a = makeAdapter({
    'forge-moda/01-hello/Hello.md': 'COHORT EDIT — the thing worth keeping',
    'forge-moda/forge.toml': 'version = "0.1.0"',
  });
  await snapshot(a, 'forge-moda');
  // The re-extract then overwrites the live tree with bundled content.
  a.files.set('forge-moda/01-hello/Hello.md', 'bundled canonical');
  a.files.set('forge-moda/forge.toml', 'version = "0.2.0"');

  assert.equal(a.files.get('forge-moda.bak.previous/01-hello/Hello.md'),
    'COHORT EDIT — the thing worth keeping');
  assert.equal(a.files.get('forge-moda.bak.previous/forge.toml'), 'version = "0.1.0"');
});

test('a second re-extract REPLACES the backup — count stays 1', async () => {
  const a = makeAdapter({ 'forge-moda/a.md': 'v1' });
  await snapshot(a, 'forge-moda');
  a.files.set('forge-moda/a.md', 'v2');
  a.files.set('forge-moda/only-in-v2.md', 'new');
  await snapshot(a, 'forge-moda');

  assert.equal(countBackupDirsFor('forge-moda', (await a.list('/')).folders), 1);
  // The backup holds the state going IN to the second re-extract...
  assert.equal(a.files.get('forge-moda.bak.previous/a.md'), 'v2');
  // ...and nothing from the first backup survives underneath it.
  assert.equal([...a.files.keys()].filter(k => k.includes('.bak.')).sort().join(','),
    'forge-moda.bak.previous/a.md,forge-moda.bak.previous/only-in-v2.md');
});

test('the AUTO path moves rather than copies — the outgoing tree is gone', async () => {
  const a = makeAdapter({ 'forge-moda/a.md': 'v1', 'forge-moda/sub/b.md': 'v1b' });
  const plan = planRollingBackup('forge-moda', (await a.list('/')).folders);
  assert.equal(plan.removeExistingFirst, false);
  await a.rename('forge-moda', plan.backupDir);

  assert.equal([...a.files.keys()].some(k => k.startsWith('forge-moda/')), false);
  assert.equal(a.files.get('forge-moda.bak.previous/sub/b.md'), 'v1b');
});

test('planted second backup: the sweep clears the legacy one, keeps the rolling one', async () => {
  // The §3 non-vacuity case. Two `.bak` dirs coexist (a v0.2.39-era
  // leftover plus the rolling backup); the every-onload sweep is what
  // enforces at-most-one, and it must clear the right one.
  const folders = ['forge-moda', 'forge-moda.bak.previous', 'forge-moda.bak.0.1.0'];
  assert.equal(countBackupDirsFor('forge-moda', folders), 2, 'detector must see both');
  const candidates = ['forge-moda', 'forge-tutorial'];
  const survivors = folders.filter(f => !shouldSweepLegacyBakDir(f, candidates));
  assert.deepEqual(survivors, ['forge-moda', 'forge-moda.bak.previous']);
  assert.equal(countBackupDirsFor('forge-moda', survivors), 1);
});
