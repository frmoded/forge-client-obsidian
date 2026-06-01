// Pure-core tests for shouldSkipForMemfsSync. Catches the v0.2.18
// path-filter contract at suite time. The skip set is small but
// load-bearing — a missed skip on `.obsidian/plugins/.../assets/`
// would push plugin-install files into the user-vault registry on
// every modify, which would corrupt the resolver's view of the
// vault.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldSkipForMemfsSync } from './memfs-sync-paths.ts';

test('shouldSkipForMemfsSync: regular vault note is NOT skipped', () => {
  // The load-bearing positive case: a top-level user note must sync.
  assert.equal(shouldSkipForMemfsSync('Greet.md'), false);
  assert.equal(shouldSkipForMemfsSync('hello.md'), false);
});

test('shouldSkipForMemfsSync: forge-moda and forge-music vault entries sync', () => {
  // After v0.2.13's auto-extract, bundled-vault subdirs live at the
  // user-vault root. Edits to those are user-side modifications and
  // MUST sync so the resolver sees them.
  assert.equal(shouldSkipForMemfsSync('forge-moda/setup.md'), false);
  assert.equal(shouldSkipForMemfsSync('forge-music/form.md'), false);
});

test('shouldSkipForMemfsSync: .obsidian/ is skipped', () => {
  // Workspace state, plugin install, plugin data, app preferences.
  // None of these belong in the user-vault registry. Critically,
  // the plugin's own asset dir (.obsidian/plugins/.../assets/) is
  // covered by this skip — editing files there is a developer
  // operation, not a vault-side change.
  assert.equal(shouldSkipForMemfsSync('.obsidian/workspace.json'), true);
  assert.equal(shouldSkipForMemfsSync('.obsidian/plugins/forge-client-obsidian/data.json'), true);
  assert.equal(shouldSkipForMemfsSync('.obsidian/plugins/forge-client-obsidian/assets/vaults/forge-moda/setup.md'), true);
});

test('shouldSkipForMemfsSync: .forge/ is skipped', () => {
  // Sentinel + future cache files Forge manages.
  assert.equal(shouldSkipForMemfsSync('.forge/initialized'), true);
  assert.equal(shouldSkipForMemfsSync('.forge/cache/foo.md'), true);
});

test('shouldSkipForMemfsSync: .trash/ is skipped', () => {
  // Obsidian moves deleted notes here when "Move to .trash folder"
  // is the delete behavior. Pushing trashed notes into the registry
  // would resurrect them as authorable snippets.
  assert.equal(shouldSkipForMemfsSync('.trash/note.md'), true);
});

test('shouldSkipForMemfsSync: non-markdown is skipped', () => {
  // The vault.on('modify') hook also fires for non-md files
  // (images, json, etc.). The SnippetRegistry only cares about
  // markdown, so syncing other formats is wasted work.
  assert.equal(shouldSkipForMemfsSync('forge-moda/setup.txt'), true);
  assert.equal(shouldSkipForMemfsSync('image.png'), true);
  assert.equal(shouldSkipForMemfsSync('forge.toml'), true);
});

test('shouldSkipForMemfsSync: paths with similar but distinct prefixes are NOT skipped', () => {
  // Defensive boundary: a hypothetical user note named ".obsidiana.md"
  // or under a folder named ".obsidian-backup/" must NOT be skipped.
  // The predicate uses startsWith with the trailing slash, so these
  // pass through correctly.
  assert.equal(shouldSkipForMemfsSync('.obsidiana.md'), false);
  assert.equal(shouldSkipForMemfsSync('.obsidian-backup/note.md'), false);
  assert.equal(shouldSkipForMemfsSync('.forgery/note.md'), false);
  assert.equal(shouldSkipForMemfsSync('.trashtalk/note.md'), false);
});
