// v0.2.91 — tests for restoreInlinedAssets. Uses a minimal in-memory
// DataAdapter stub matching only the methods restoreInlinedAssets
// calls (exists, mkdir, write).

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Mock the obsidian module imports by structural typing only.
// restoreInlinedAssets takes (app, pluginId) and uses
// app.vault.adapter.{exists, mkdir, write}. We don't need actual
// obsidian types here.

interface StubAdapter {
  files: Map<string, string>;
  dirs: Set<string>;
  exists(p: string): Promise<boolean>;
  mkdir(p: string): Promise<void>;
  write(p: string, content: string): Promise<void>;
  read(p: string): Promise<string>;
}

function makeStubAdapter(): StubAdapter {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  return {
    files,
    dirs,
    async exists(p: string) {
      return files.has(p) || dirs.has(p);
    },
    async mkdir(p: string) {
      if (dirs.has(p)) {
        // Mimic Obsidian's "Folder already exists" throw.
        throw new Error('Folder already exists');
      }
      dirs.add(p);
    },
    async write(p: string, content: string) {
      files.set(p, content);
    },
    async read(p: string) {
      // v0.2.98 — restore-inlined-assets reads the .bundle-version
      // sentinel for the fast-path skip.
      const v = files.get(p);
      if (v === undefined) throw new Error(`ENOENT: ${p}`);
      return v;
    },
  };
}

function makeApp(adapter: StubAdapter) {
  return { vault: { adapter } } as any;
}

test('restoreInlinedAssets: writes all inlined assets to plugin/assets/ on fresh install', async () => {
  const adapter = makeStubAdapter();
  const app = makeApp(adapter);
  const { restoreInlinedAssets } = await import('./restore-inlined-assets.ts');
  const { BUNDLED_ASSETS } = await import('./bundled-assets.generated.ts');

  const written = await restoreInlinedAssets(app, 'forge-client-obsidian');
  const expectedCount = Object.keys(BUNDLED_ASSETS).length;
  assert.equal(written, expectedCount,
    `Fresh install must write all ${expectedCount} inlined assets; got ${written}.`);

  // Spot-check that a known file landed at the expected path.
  const hellopath = '.obsidian/plugins/forge-client-obsidian/assets/vaults/forge-tutorial/01-hello/Hello.md';
  assert.equal(adapter.files.has(hellopath), true,
    `Expected ${hellopath} to be written.`);
  assert.equal(adapter.files.has(
    '.obsidian/plugins/forge-client-obsidian/assets/engine/forge/__init__.py'
  ), true, 'Expected engine __init__.py to be written.');
  assert.equal(adapter.files.has(
    '.obsidian/plugins/forge-client-obsidian/assets/manifest.json'
  ), true, 'Expected top-level manifest.json to be written.');
});

test('restoreInlinedAssets: idempotent — second run writes nothing', async () => {
  const adapter = makeStubAdapter();
  const app = makeApp(adapter);
  const { restoreInlinedAssets } = await import('./restore-inlined-assets.ts');

  const firstRun = await restoreInlinedAssets(app, 'forge-client-obsidian');
  assert.ok(firstRun > 0, 'First run must write at least one file.');

  const secondRun = await restoreInlinedAssets(app, 'forge-client-obsidian');
  assert.equal(secondRun, 0,
    `Second run must be idempotent — all files already exist; expected 0 writes, got ${secondRun}.`);
});

test('restoreInlinedAssets: version mismatch forces overwrite of all files (v0.2.98)', async () => {
  const adapter = makeStubAdapter();
  const app = makeApp(adapter);
  // Simulate a prior plugin version having left files on disk +
  // a stale sentinel. The stale iframe scenario that prompted
  // v0.2.98: BRAT updates main.js to v0.2.97 but leaves the
  // v0.2.96 iframe HTML untouched — version stamp catches this.
  const stalePath = '.obsidian/plugins/forge-client-obsidian/assets/iframe/index.html';
  adapter.files.set(stalePath, '<html>STALE v0.2.96 iframe</html>');
  const sentinelPath = '.obsidian/plugins/forge-client-obsidian/assets/.bundle-version';
  adapter.files.set(sentinelPath, '0.2.96');

  const { restoreInlinedAssets } = await import('./restore-inlined-assets.ts');
  const { BUNDLED_ASSETS, BUNDLED_ASSETS_VERSION } = await import('./bundled-assets.generated.ts');

  const written = await restoreInlinedAssets(app, 'forge-client-obsidian');
  const expectedCount = Object.keys(BUNDLED_ASSETS).length;
  assert.equal(written, expectedCount,
    `Stale sentinel must force-overwrite all ${expectedCount} files; got ${written}.`);
  assert.notEqual(adapter.files.get(stalePath), '<html>STALE v0.2.96 iframe</html>',
    'Stale iframe content MUST be overwritten on version mismatch.');
  assert.equal(adapter.files.get(sentinelPath), BUNDLED_ASSETS_VERSION,
    'Sentinel must be updated to the current bundle version after restore.');
});

test('restoreInlinedAssets: creates intermediate directories', async () => {
  const adapter = makeStubAdapter();
  const app = makeApp(adapter);
  const { restoreInlinedAssets } = await import('./restore-inlined-assets.ts');

  await restoreInlinedAssets(app, 'forge-client-obsidian');

  // Verify some directories were created.
  assert.equal(adapter.dirs.has(
    '.obsidian/plugins/forge-client-obsidian/assets'), true);
  assert.equal(adapter.dirs.has(
    '.obsidian/plugins/forge-client-obsidian/assets/vaults'), true);
  assert.equal(adapter.dirs.has(
    '.obsidian/plugins/forge-client-obsidian/assets/vaults/forge-tutorial'), true);
});

test('BUNDLED_ASSETS: contains expected top-level keys', async () => {
  const { BUNDLED_ASSETS } = await import('./bundled-assets.generated.ts');
  const keys = Object.keys(BUNDLED_ASSETS);
  // At least one vault, one engine, one iframe file present.
  assert.ok(keys.some(k => k.startsWith('vaults/forge-tutorial/')),
    'BUNDLED_ASSETS must contain forge-tutorial vault files.');
  assert.ok(keys.some(k => k.startsWith('engine/forge/')),
    'BUNDLED_ASSETS must contain engine forge/ files.');
  assert.ok(keys.some(k => k.startsWith('iframe/')),
    'BUNDLED_ASSETS must contain iframe files.');
  assert.ok(keys.some(k => k.startsWith('welcome/')),
    'BUNDLED_ASSETS must contain welcome files.');
  assert.ok(keys.includes('manifest.json'),
    'BUNDLED_ASSETS must contain top-level manifest.json.');
});
