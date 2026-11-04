// 2026-11-03-1165 - the bundle sync reads ONLY committed content (since 2026-08-16, vault-head-snapshot.mjs: `git archive HEAD`), and now SAYS what it is leaving out: before it copies, it prints every path of the vault's working tree that is
// modified, staged-but-uncommitted or untracked (and in scope: not `.obsidian/`, not an excluded name) as "not synced", so a person sees "not synced: monochord.md ..." instead of wondering. Real temp git repos and the real script run in a
// scratch client layout (<tmp>/client/scripts, <tmp>/client/assets/vaults/music-theory, <tmp>/music-theory): there is no honest way to test "reads HEAD" against a fake git.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { uncommittedPaths } from './vault-head-snapshot.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf-8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@e.x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@e.x' } });

/** A scratch layout: a vault repo with one commit (`committed.md`, `edited.md`, `.obsidian/app.json`) and a client with the sync script and an empty bundle. */
function layout() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-ignored-'));
  const vault = path.join(tmp, 'music-theory');
  fs.mkdirSync(path.join(vault, '.obsidian'), { recursive: true });
  fs.writeFileSync(path.join(vault, 'committed.md'), 'committed body\n');
  fs.writeFileSync(path.join(vault, 'edited.md'), 'committed edited body\n');
  fs.writeFileSync(path.join(vault, '.obsidian', 'app.json'), '{}\n');
  git(tmp, 'init', '-q', 'music-theory'); git(vault, 'add', '-A'); git(vault, 'commit', '-q', '-m', 'first');
  const client = path.join(tmp, 'client');
  fs.mkdirSync(path.join(client, 'scripts'), { recursive: true });
  for (const f of ['sync-bundled-vault.mjs', 'exclusions.mjs', 'vault-head-snapshot.mjs', 'vaults.mjs', 'vaults.txt', 'vaults.music.txt', 'editions.mjs']) fs.copyFileSync(path.join(HERE, f), path.join(client, 'scripts', f));
  fs.mkdirSync(path.join(client, 'assets', 'vaults', 'music-theory'), { recursive: true });
  const sync = () => spawnSync('node', [path.join(client, 'scripts', 'sync-bundled-vault.mjs'), 'music-theory'], { encoding: 'utf-8', env: { ...process.env, FORGE_EDITION: 'music' } });
  const bundled = (rel) => { const p = path.join(client, 'assets', 'vaults', 'music-theory', rel); return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null; };
  return { tmp, vault, client, sync, bundled, done: () => fs.rmSync(tmp, { recursive: true, force: true }) };
}

test('uncommittedPaths: a modified file, a staged-but-uncommitted new file and an untracked file are listed with their state; .obsidian and excluded names are not; a clean vault lists nothing', () => {
  const l = layout();
  try {
    assert.deepEqual(uncommittedPaths(l.vault), [], 'clean');
    fs.writeFileSync(path.join(l.vault, 'edited.md'), 'EDITED, NOT COMMITTED\n');
    fs.writeFileSync(path.join(l.vault, 'staged-new.md'), 'staged\n'); git(l.vault, 'add', 'staged-new.md');
    fs.mkdirSync(path.join(l.vault, 'tuning', 'resources'), { recursive: true });
    fs.writeFileSync(path.join(l.vault, 'tuning', 'resources', 'fig.svg'), '<svg/>\n');
    fs.writeFileSync(path.join(l.vault, '.obsidian', 'app.json'), '{"changed":true}\n');
    fs.writeFileSync(path.join(l.vault, '.DS_Store'), 'x');
    const got = uncommittedPaths(l.vault).map((x) => `${x.state}:${x.path}`).sort();
    assert.deepEqual(got, ['modified:edited.md', 'staged:staged-new.md', 'untracked:tuning/resources/fig.svg']);
  } finally { l.done(); }
});

test('the sync: a modified, a staged-not-committed and an untracked file NEVER reach the bundle, and each is printed as "not synced" BEFORE anything is copied; the committed content is what ships', () => {
  const l = layout();
  try {
    fs.writeFileSync(path.join(l.vault, 'edited.md'), 'EDITED, NOT COMMITTED\n');
    fs.writeFileSync(path.join(l.vault, 'staged-new.md'), 'staged\n'); git(l.vault, 'add', 'staged-new.md');
    fs.writeFileSync(path.join(l.vault, 'untracked.md'), 'untracked\n');
    const r = l.sync();
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(l.bundled('committed.md'), 'committed body\n');
    assert.equal(l.bundled('edited.md'), 'committed edited body\n', 'the HEAD bytes, not the edit');
    assert.equal(l.bundled('staged-new.md'), null); assert.equal(l.bundled('untracked.md'), null);
    const out = r.stdout;
    assert.match(out, /not synced \(uncommitted in the vault/);
    for (const name of ['edited.md', 'staged-new.md', 'untracked.md']) assert.match(out, new RegExp(`${name.replace('.', '\\.')} \\((modified|staged|untracked)\\)`), `${name} is named`);
    assert.ok(out.indexOf('not synced') < out.indexOf('[copy]'), 'the list comes BEFORE the first copy');
    assert.doesNotMatch(out, /\.obsidian/, 'the editor folder is not noise');
  } finally { l.done(); }
});

test('P3: a CLEAN vault gives the same bundle and the same output as before, with no "not synced" line', () => {
  const l = layout();
  try {
    const r = l.sync();
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.doesNotMatch(r.stdout, /not synced/);
    assert.equal(l.bundled('committed.md'), 'committed body\n'); assert.equal(l.bundled('edited.md'), 'committed edited body\n');
    assert.match(r.stdout, /Result: 2 added, 0 updated, 0 unchanged, 0 deleted\./);
    const again = l.sync();
    assert.match(again.stdout, /Result: 0 added, 0 updated, 2 unchanged, 0 deleted\./, 'idempotent');
  } finally { l.done(); }
});
