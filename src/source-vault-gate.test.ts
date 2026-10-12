// Drain 2026-10-12-1700 §3 — extraction landing inside the SOURCE vault.
//
// Observed: `~/projects/music-theory` (a vault whose root forge.toml says `name = "music-theory"`) holds untracked `forge-moda/`,
// `forge-tutorial/`, `music-core/`, `music-theory/` and `greet.md`, all created within one second on 2026-10-01 10:24.
//
// CAUSE (read from the build that did it, commit 93ed057, and from git): two DIFFERENT questions were answered from two different
// sources.
//   - "is this vault the source repo of a bundled library?" (the gate) compared the vault's `name` with BUNDLED_VAULT_NAME_SET — a
//     compile-time constant that, in that build, was ['forge-moda', 'forge-tutorial'];
//   - "which vaults do I extract?" came from LISTING the plugin folder's assets/vaults/ — which on that machine held all four, because
//     the folder was deployed wholesale from a tree that tracks every edition's vaults.
//   `music-theory` was in the second set and not in the first, so the gate returned null and the whole first-run extraction (and
//   greet.md) ran inside the library's own source repo. The same disagreement exists today for any LEAN build deployed beside a
//   music-bearing assets folder.
// FIX: the gate recognises a source vault by EVERY name any edition can bundle, plus whatever the plugin folder actually carries —
// never by the current edition's list alone.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { isSourceVault, shouldSkipBundledExtract } from './source-vault-core.ts';
import { BUNDLED_VAULT_NAME_SET, sourceVaultNames } from './bundled-vault-extraction-core.ts';
import { EDITION_VAULT_NAMES } from './edition-core.ts';

const toml = (name: string) => `name = "${name}"\nversion = "0.11.30"\ndomains = ["music"]\n`;

test('REPRO: the edition-only set does not recognise the music-theory source vault in a lean build (the old gate)', () => {
  // Node tests run with the committed LEAN edition, which is exactly the build shape that did it.
  assert.equal(BUNDLED_VAULT_NAME_SET.has('music-theory'), false, 'precondition: this build\'s edition list lacks music-theory');
  assert.equal(isSourceVault(toml('music-theory'), BUNDLED_VAULT_NAME_SET), null, 'old gate: not a source vault -> extraction ran');
});

test('the gate recognises every vault ANY edition can bundle, whatever edition this build is', () => {
  const names = sourceVaultNames([]);
  for (const edition of ['lean', 'music'] as const) {
    for (const n of EDITION_VAULT_NAMES[edition]) {
      assert.equal(isSourceVault(toml(n), names), n, `${n} (${edition} edition) is recognised as a source vault`);
    }
  }
  assert.equal(shouldSkipBundledExtract(isSourceVault(toml('music-theory'), names)), true, 'and extraction is skipped');
});

test('the gate also recognises a vault that only the plugin folder\'s listing names (a bundle the constant has never heard of)', () => {
  const names = sourceVaultNames(['.obsidian/plugins/forge-actions/assets/vaults/forge-poetry', '.obsidian/plugins/forge-actions/assets/vaults/.DS_Store']);
  assert.equal(isSourceVault(toml('forge-poetry'), names), 'forge-poetry');
  assert.equal(names.has('.DS_Store'), false, 'dotted entries are not vaults');
});

test('an ordinary user vault (or one with no name, or an unrelated name) is NOT a source vault — extraction still happens there', () => {
  const names = sourceVaultNames([]);
  assert.equal(isSourceVault(toml('my-notes'), names), null);
  assert.equal(isSourceVault('version = "1"\n', names), null);
  assert.equal(isSourceVault(null, names), null);
  assert.equal(isSourceVault('', names), null);
  assert.equal(shouldSkipBundledExtract(isSourceVault(toml('my-notes'), names)), false);
});

test('the set is the union, built from the same table the build scripts are pinned to (no second list)', () => {
  const union = new Set<string>([...EDITION_VAULT_NAMES.lean, ...EDITION_VAULT_NAMES.music]);
  assert.deepEqual([...sourceVaultNames([])].sort(), [...union].sort());
  const core = fs.readFileSync(path.resolve(process.cwd(), 'src/bundled-vault-extraction-core.ts'), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(!/['"]music-theory['"]|['"]music-core['"]/.test(core), 'no hand-spelled vault name in the extraction core');
});

test('wiring: welcome.ts decides "source vault?" with the union + the folder listing, never the edition-only constant', () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), 'src/welcome.ts'), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(src, /async function detectSourceVault\(adapter: DataAdapter, pluginDir: string\)/);
  assert.match(src, /isSourceVault\(body, sourceVaultNames\(/);
  assert.ok(!/isSourceVault\(body, BUNDLED_VAULT_NAME_SET\)/.test(src));
  assert.match(src, /detectSourceVault\(adapter, pluginDir\)/);
});

test('wiring: the domain-activation re-extract (ensureBundledFor) is gated too — it used to call the extraction with no gate at all', () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), 'src/welcome.ts'), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const fn = src.slice(src.indexOf('export async function ensureBundledFor('));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  const gate = body.indexOf('detectSourceVault(app.vault.adapter, pluginDir)');
  const skip = body.indexOf('shouldSkipBundledExtract(');
  const run = body.indexOf('ensureAllBundledVaults(app, pluginDir)');
  assert.ok(gate > 0 && skip > gate && run > skip, 'gate -> skip decision -> extraction, in that order');
});
