// Drain 2026-08-10-1430 (Phase 4b plugin mount) — pure-core tests for
// the TS-side [imports] handling: minimal local-form parser (needed
// BEFORE Pyodide boots, so the canonical Python parser can't serve it),
// host-path resolution and mount-file filtering. (The palette group
// builder for imported-vault chips was removed with the palette, 2026-10-07.)

import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  parseLocalImports,
  resolveImportHostPath,
  shouldMountImportFile,
} from './vault-imports-local-core.ts';

const MUSIC_THEORY_TOML = `name = "music-theory"
version = "0.11.1"
description = "Forge vault for music theory pedagogy."
domains = ["music"]

# Cross-vault imports — must stay LAST in this file.

[imports]
music-core = { local = "../music-core" }
`;

describe('parseLocalImports', () => {
  test('parses the live music-theory shape', () => {
    assert.deepEqual(parseLocalImports(MUSIC_THEORY_TOML), [
      { name: 'music-core', local: '../music-core' },
    ]);
  });

  test('no [imports] section → empty', () => {
    assert.deepEqual(parseLocalImports('name = "x"\nversion = "1.0.0"\n'), []);
  });

  test('git-only declarations are skipped (local-form only, like engine Phase 2)', () => {
    const toml = '[imports]\nfoo = { git = "https://x", sha = "abc" }\n';
    assert.deepEqual(parseLocalImports(toml), []);
  });

  test('reserved name `local` is skipped', () => {
    const toml = '[imports]\nlocal = { local = "../x" }\nok = { local = "../y" }\n';
    assert.deepEqual(parseLocalImports(toml), [{ name: 'ok', local: '../y' }]);
  });

  test('stops at the next [section] header', () => {
    const toml = '[imports]\na = { local = "../a" }\n[other]\nb = { local = "../b" }\n';
    assert.deepEqual(parseLocalImports(toml), [{ name: 'a', local: '../a' }]);
  });

  test('commented-out block parses to empty (pre-activation forge.tomls)', () => {
    const toml = '# [imports]\n# music-core = { local = "../music-core" }\n';
    assert.deepEqual(parseLocalImports(toml), []);
  });
});

describe('resolveImportHostPath', () => {
  test('relative local resolves against the vault base path', () => {
    assert.equal(
      resolveImportHostPath('/Users/o/projects/music-theory', '../music-core'),
      '/Users/o/projects/music-core',
    );
  });

  test('nested relative', () => {
    assert.equal(
      resolveImportHostPath('/a/b/c', '../../d/e'),
      '/a/d/e',
    );
  });

  test('absolute local passes through normalized', () => {
    assert.equal(
      resolveImportHostPath('/a/b', '/x/y/../z'),
      '/x/z',
    );
  });
});

describe('shouldMountImportFile', () => {
  test('markdown + forge.toml are mounted', () => {
    assert.equal(shouldMountImportFile('rhythmic_line.md'), true);
    assert.equal(shouldMountImportFile('sub/deep/note.md'), true);
    assert.equal(shouldMountImportFile('forge.toml'), true);
  });

  test('dot-dirs, bak dirs, and non-md assets are excluded', () => {
    assert.equal(shouldMountImportFile('.obsidian/workspace.json'), false);
    assert.equal(shouldMountImportFile('.git/HEAD'), false);
    assert.equal(shouldMountImportFile('.forge/edges/x.md'), false);
    assert.equal(shouldMountImportFile('lib.bak.0.1.0/x.md'), false);
    assert.equal(shouldMountImportFile('resources/audio/a.mp3'), false);
    assert.equal(shouldMountImportFile('README.md'), true);
  });
});
