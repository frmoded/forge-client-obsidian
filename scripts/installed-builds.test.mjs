// 2026-11-17-0901 A: every vault keeps its OWN copy of the plugin (<vault>/.obsidian/plugins/forge-actions/main.js), and the banner shows the stamp baked into THAT copy.
// scripts/installed-build-core.mjs reads the stamp out of a built main.js (never a data.json: it holds the token), says whether an install matches the commit it was meant to
// be, and lists the copies on this machine against origin/main. install-local.sh uses it to fail an install whose main.js does not carry the commit it just built.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseInstalledStamp, verifyInstalledStamp, describeCopies } from './installed-build-core.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const MAIN = (sha, dirty = false, at = '2026-11-17T01:50:08.507Z') => `// edition: music\n// src/build-stamp.generated.ts\nvar BUILD_STAMP = { "sha": "${sha}", "dirty": ${dirty}, "builtAt": "${at}" };\n\n// src/build-stamp-core.ts\nfunction formatBuildStamp(stamp) {}\n`;

test('parseInstalledStamp reads sha, dirty and builtAt from the line esbuild leaves in main.js', () => {
  assert.deepEqual(parseInstalledStamp(MAIN('be973422e')), { sha: 'be973422e', dirty: false, builtAt: '2026-11-17T01:50:08.507Z' });
  assert.deepEqual(parseInstalledStamp(MAIN('a2d1f0385', true, '2026-11-10T19:57:04.742Z')), { sha: 'a2d1f0385', dirty: true, builtAt: '2026-11-10T19:57:04.742Z' });
  assert.equal(parseInstalledStamp('no stamp in here'), null);
  assert.equal(parseInstalledStamp(''), null);
  assert.equal(parseInstalledStamp('var BUILD_STAMP = { "sha": "unknown", "dirty": false, "builtAt": "x" };').sha, 'unknown');
});

test('verifyInstalledStamp: ok only when the installed main.js carries the commit and the tree state that was just built', () => {
  assert.deepEqual(verifyInstalledStamp(MAIN('f6390ce12'), 'f6390ce12', 'clean'), { ok: true });
  assert.equal(verifyInstalledStamp(MAIN('f6390ce12'), 'f6390ce12abcdef0123456789', 'clean').ok, true, 'a long sha built-from is matched by its short prefix');
  const stale = verifyInstalledStamp(MAIN('a2d1f0385'), 'f6390ce12', 'clean');
  assert.equal(stale.ok, false);
  assert.match(stale.reason, /a2d1f0385/);
  assert.match(stale.reason, /f6390ce12/);
  const dirty = verifyInstalledStamp(MAIN('f6390ce12', true), 'f6390ce12', 'clean');
  assert.equal(dirty.ok, false);
  assert.match(dirty.reason, /dirty/);
  assert.equal(verifyInstalledStamp(MAIN('f6390ce12', true), 'f6390ce12', 'dirty').ok, true, '--worktree installs are stamped dirty on purpose');
  assert.equal(verifyInstalledStamp('garbage', 'f6390ce12', 'clean').ok, false);
});

test('describeCopies: says CURRENT / OLDER for each copy against the commit that is the newest (one line per vault, the vault name first)', () => {
  const lines = describeCopies([
    { vault: 'music-playground', stamp: { sha: 'f6390ce12', dirty: false, builtAt: '2026-11-17T01:50:08.507Z' } },
    { vault: 'music-theory', stamp: { sha: 'a2d1f0385', dirty: false, builtAt: '2026-11-10T19:57:04.742Z' } },
    { vault: 'broken', stamp: null },
  ], 'f6390ce12');
  assert.equal(lines[0], 'music-playground  f6390ce12  built 2026-11-17 01:50 UTC  CURRENT');
  assert.equal(lines[1], 'music-theory  a2d1f0385  built 2026-11-10 19:57 UTC  OLDER than f6390ce12: install it too, or do not open this vault');
  assert.equal(lines[2], 'broken  (no build stamp in main.js)');
});

test('the lister CLI reads only main.js and manifest.json: a data.json with a token in it is never opened or printed', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'installed-builds-'));
  const SECRET = 'FAKE-token-that-must-never-appear-0000000000';
  for (const [name, sha] of [['vault-a', 'f6390ce12'], ['vault-b', 'a2d1f0385']]) {
    const dir = path.join(home, name, '.obsidian/plugins/forge-actions');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'main.js'), MAIN(sha));
    fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify({ transpileServiceToken: SECRET }));
  }
  const r = spawnSync('node', [path.join(ROOT, 'scripts/installed-builds.mjs'), '--head', 'f6390ce12', home], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /vault-a {2}f6390ce12 .*CURRENT/);
  assert.match(r.stdout, /vault-b {2}a2d1f0385 .*OLDER than f6390ce12/);
  assert.ok(!(r.stdout + r.stderr).includes(SECRET), 'a secret from data.json reached the output');
});

test('install-local.sh checks the installed main.js against the commit it built, prints the one-line grep, and lists the other copies', () => {
  const sh = fs.readFileSync(path.join(ROOT, 'scripts/install-local.sh'), 'utf8');
  assert.match(sh, /installed-builds\.mjs --verify/, 'the install fails when main.js in the vault does not carry the built commit');
  assert.match(sh, /grep -m1 '\^var BUILD_STAMP' /, 'the driver can run the same check by hand');
  assert.match(sh, /installed-builds\.mjs --head "\$SHA"/, 'the other vaults\' copies are listed against the commit just installed');
});
