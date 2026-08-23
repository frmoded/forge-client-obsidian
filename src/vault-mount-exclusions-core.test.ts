// TDD failing-test-first — drain 2026-08-23-1400 (plugin half).
//
// The engine's scan excludes Forge-managed state dirs; the plugin's
// MEMFS mount and its per-file sync did not. That divergence is a
// second ingestion path for the entries behind the
// create_water_particles failure (the first, and the one that actually
// produced CCQA's observed ids, was the engine's own library walk —
// fixed in forge this drain).
//
// The exclusion rules are MIRRORED here rather than re-invented, and
// the mirror is checked against the vendored engine source, so the two
// cannot drift apart silently.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  RESERVED_DIRS,
  BAK_DIR_PATTERN,
  isReservedDirName,
  isExcludedFromVaultMount,
} from './vault-mount-exclusions-core.ts';

test('Forge-managed state dirs are excluded at any depth', () => {
  assert.equal(isExcludedFromVaultMount('.forge/edges/a/b/create_water_particles.md'), true);
  assert.equal(isExcludedFromVaultMount('forge-moda/.forge/edges/a/b/x.md'), true);
  assert.equal(isExcludedFromVaultMount('deep/nested/.obsidian/plugins/x.md'), true);
  assert.equal(isExcludedFromVaultMount('.git/objects/x.md'), true);
});

test('backup dirs are excluded at any depth', () => {
  assert.equal(isExcludedFromVaultMount('forge-moda.bak.0.5.3/go.md'), true);
  assert.equal(isExcludedFromVaultMount('a/forge-moda.bak.0.5.3/go.md'), true);
});

test('non-vacuity: ordinary notes are NOT excluded', () => {
  // Without this, an exclusion that returned true unconditionally would
  // pass every assertion above while mounting nothing at all.
  assert.equal(isExcludedFromVaultMount('go.md'), false);
  assert.equal(isExcludedFromVaultMount('forge-moda/simulation.md'), false);
  assert.equal(isExcludedFromVaultMount('deep/nested/note.md'), false);
});

test('a file whose own NAME looks reserved is still mounted', () => {
  // Only path SEGMENTS above the file are directories. `.forge.md` is a
  // (strangely named) note, not a state dir.
  assert.equal(isExcludedFromVaultMount('.forge.md'), false);
  assert.equal(isExcludedFromVaultMount('notes/.git.md'), false);
});

test('the mirror matches the vendored engine definition', () => {
  // The derived-sets rule: this is a mirror, so it gets a drift test
  // against the source it mirrors — the engine bundled in this plugin.
  const engine = readFileSync(
    join(import.meta.dirname, '..', 'assets', 'engine', 'forge', 'core',
         'snippet_registry.py'), 'utf8');

  const reserved = engine.match(/_RESERVED_DIRS\s*=\s*\{([^}]*)\}/);
  assert.ok(reserved, '_RESERVED_DIRS not found in the vendored engine');
  const enginesDirs = [...reserved[1].matchAll(/"([^"]+)"/g)].map(m => m[1]).sort();
  assert.deepEqual([...RESERVED_DIRS].sort(), enginesDirs,
    'plugin mirror has drifted from the engine\'s _RESERVED_DIRS');

  const bak = engine.match(/_BAK_DIR_PATTERN\s*=\s*re\.compile\(r"([^"]+)"\)/);
  assert.ok(bak, '_BAK_DIR_PATTERN not found in the vendored engine');
  assert.equal(BAK_DIR_PATTERN.source, bak[1],
    'plugin mirror has drifted from the engine\'s _BAK_DIR_PATTERN');
});

test('non-vacuity: the drift check reads a real definition', () => {
  // A regex that silently matched nothing would make the drift test
  // vacuous, so pin what it found.
  assert.ok(RESERVED_DIRS.has('.forge'));
  assert.ok(RESERVED_DIRS.size >= 4);
  assert.ok(isReservedDirName('.forge'));
  assert.ok(isReservedDirName('x.bak.1.2.3'));
  assert.ok(!isReservedDirName('forge-moda'));
});

test('both plugin ingestion points apply the exclusion', () => {
  // The mount loop and the per-file sync are two doors into the same
  // registry; guarding one is not guarding it.
  const host = readFileSync(join(import.meta.dirname, 'pyodide-host.ts'), 'utf8');
  const mountIdx = host.indexOf('getMarkdownFiles()');
  const syncIdx = host.indexOf('async syncUserVaultFile');
  assert.ok(mountIdx > 0 && syncIdx > 0, 'anchors moved; re-verify at HEAD');
  const uses = [...host.matchAll(/isExcludedFromVaultMount\(/g)].length;
  assert.ok(uses >= 2,
    `expected the exclusion at both the mount and the sync; found ${uses}`);
});
