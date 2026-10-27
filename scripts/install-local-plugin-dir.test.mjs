// 2026-10-26-1805: install-local.sh's default plugin folder is the manifest's plugin id (`forge-actions`), not the hard-coded `forge` that does not exist in a vault like music-playground.
// Runs the REAL resolver (scripts/resolve-plugin-dir.mjs, the one install-local.sh calls) against temp vaults.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const ID = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).id;
const resolve = (vault, env = {}) => spawnSync('node', [path.join(ROOT, 'scripts/resolve-plugin-dir.mjs')], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, PLUGIN_DIR: '', VAULT: vault, ...env } });
const vaultWith = (...dirs) => { const v = fs.mkdtempSync(path.join(os.tmpdir(), 'install-local-')); for (const d of dirs) fs.mkdirSync(path.join(v, '.obsidian/plugins', d), { recursive: true }); return v; };

test('the default plugin folder is the manifest id: a vault with plugins/forge-actions resolves to it', () => {
  assert.equal(ID, 'forge-actions');
  const v = vaultWith(ID);
  const r = resolve(v);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), path.join(v, '.obsidian/plugins', ID));
});

test('a vault without the plugin folder exits 1 naming BOTH the path it tried and the id', () => {
  const v = vaultWith('some-other-plugin');
  const r = resolve(v);
  assert.equal(r.status, 1);
  assert.ok(r.stderr.includes(path.join(v, '.obsidian/plugins', ID)), r.stderr);
  assert.ok(r.stderr.includes(`"${ID}"`), r.stderr);
  assert.match(r.stderr, /PLUGIN_DIR/, 'and says how to point at another folder');
});

test('PLUGIN_DIR still overrides (a vault that keeps the plugin under another folder name)', () => {
  const v = vaultWith('forge');
  const r = resolve(v, { PLUGIN_DIR: path.join(v, '.obsidian/plugins/forge') });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), path.join(v, '.obsidian/plugins/forge'));
  assert.equal(resolve(v, { PLUGIN_DIR: path.join(v, 'nope') }).status, 1);
});

test('install-local.sh asks the resolver instead of hard-coding a folder name', () => {
  const sh = fs.readFileSync(path.join(ROOT, 'scripts/install-local.sh'), 'utf8').split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  assert.match(sh, /resolve-plugin-dir\.mjs/);
  assert.doesNotMatch(sh, /plugins\/forge\b(?!-)/);
});
