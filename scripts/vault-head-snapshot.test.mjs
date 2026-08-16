// Drain 2026-08-16-1100 — the bundled-vault gate and sync must read the
// source vault's HEAD, not its working tree.
//
// Why this exists, concretely: this session burned two release attempts on
// wizard's mid-flight authoring in music-theory. Staged-but-uncommitted
// SVGs and a modified-uncommitted note made the drift gate red, and the
// only two ways out were "wait for the other agent to finish" or "sync
// uncommitted files into an immutable published artifact that can't be
// rebuilt from any git state". Comparing against HEAD dissolves the
// dilemma: uncommitted work is invisible, and what ships is reproducible
// by construction.
//
// The load-bearing test is `committed content wins over the working tree`.
// If that one passes while the others fail, the change is still correct in
// the way that matters; if it fails, nothing else here is worth much.
//
// Fixtures are real temp git repos. There is no honest way to test "reads
// HEAD" against a fake git.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { snapshotVaultHead } from './vault-head-snapshot.mjs';

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  });
}

/** A temp git repo with `files` committed. Returns its path. */
function tempVaultRepo(files, { commit = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-head-'));
  git(dir, 'init', '-q', '-b', 'main');
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  }
  if (commit) {
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'initial');
  }
  return dir;
}

function withSnapshot(vaultPath, fn) {
  const snap = snapshotVaultHead(vaultPath);
  try {
    return fn(snap);
  } finally {
    snap.dispose();
  }
}

test('vault-head: committed content wins over the working tree', () => {
  // THE test. A note is committed, then edited without committing —
  // exactly music-theory's murmuration.md during the v0.2.358 attempts.
  const dir = tempVaultRepo({ 'note.md': 'committed body\n' });
  fs.writeFileSync(path.join(dir, 'note.md'), 'UNCOMMITTED EDIT\n');
  try {
    withSnapshot(dir, snap => {
      const seen = fs.readFileSync(path.join(snap.root, 'note.md'), 'utf-8');
      assert.equal(seen, 'committed body\n',
        'the snapshot must expose the COMMITTED bytes, not the working tree');
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('vault-head: a staged-but-uncommitted new file is invisible', () => {
  // The seven SVGs that blocked v0.2.358 attempts 5 and 6.
  const dir = tempVaultRepo({ 'note.md': 'body\n' });
  fs.writeFileSync(path.join(dir, 'figure.svg'), '<svg/>\n');
  git(dir, 'add', 'figure.svg');
  try {
    withSnapshot(dir, snap => {
      assert.equal(fs.existsSync(path.join(snap.root, 'figure.svg')), false,
        'staged-but-uncommitted content must not reach the bundle');
      assert.equal(fs.existsSync(path.join(snap.root, 'note.md')), true);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('vault-head: a file deleted in the working tree is still present at HEAD', () => {
  // The mirror case: an uncommitted deletion must not silently drop a file
  // from the bundle, since the sync deletes bundle orphans.
  const dir = tempVaultRepo({ 'keep.md': 'a\n', 'gone.md': 'b\n' });
  fs.unlinkSync(path.join(dir, 'gone.md'));
  try {
    withSnapshot(dir, snap => {
      assert.equal(fs.existsSync(path.join(snap.root, 'gone.md')), true);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('vault-head: nested directories survive the snapshot', () => {
  const dir = tempVaultRepo({
    'a/b/deep.md': 'deep\n',
    'forge.toml': 'version = "1.0.0"\n',
  });
  try {
    withSnapshot(dir, snap => {
      assert.equal(fs.readFileSync(path.join(snap.root, 'a/b/deep.md'), 'utf-8'), 'deep\n');
      assert.match(fs.readFileSync(path.join(snap.root, 'forge.toml'), 'utf-8'), /1\.0\.0/);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('vault-head: a repo with no commits FAILS loudly rather than snapshotting empty', () => {
  // Deliberate choice, per §4's "pick one and document it". An empty
  // snapshot would look like "the source has no files", and the sync
  // deletes bundle orphans — so it would wipe the bundled vault. Failing
  // is the only safe answer.
  const dir = tempVaultRepo({ 'note.md': 'x\n' }, { commit: false });
  try {
    assert.throws(() => snapshotVaultHead(dir), /no commits/i);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('vault-head: a non-git directory FAILS loudly', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-head-nogit-'));
  fs.writeFileSync(path.join(dir, 'note.md'), 'x\n');
  try {
    assert.throws(() => snapshotVaultHead(dir), /not a git repository/i);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('vault-head: dispose removes the temp snapshot and never touches the vault', () => {
  const dir = tempVaultRepo({ 'note.md': 'body\n' });
  try {
    const snap = snapshotVaultHead(dir);
    assert.notEqual(path.resolve(snap.root), path.resolve(dir),
      'the snapshot must be its own directory, never the vault itself');
    assert.equal(fs.existsSync(snap.root), true);
    snap.dispose();
    assert.equal(fs.existsSync(snap.root), false, 'dispose must clean up');
    // The vault is untouched — reading committed state must never write.
    assert.equal(fs.existsSync(path.join(dir, 'note.md')), true);
    assert.equal(git(dir, 'status', '--porcelain').trim(), '');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('vault-head: dispose is idempotent', () => {
  const dir = tempVaultRepo({ 'note.md': 'body\n' });
  try {
    const snap = snapshotVaultHead(dir);
    snap.dispose();
    snap.dispose();  // must not throw
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ------------------------------------------------- consumers agree (§8)

test('vault-head: the gate and the sync both read through this module', () => {
  // §8 — a gate comparing HEAD while the sync copies the working tree
  // would reopen the same hole one layer down. This is a static check,
  // deliberately: it fails the moment someone adds a second source-of-
  // truth read to either script.
  const gate = fs.readFileSync(path.join(import.meta.dirname, 'build-release-zip.mjs'), 'utf-8');
  const sync = fs.readFileSync(path.join(import.meta.dirname, 'sync-bundled-vault.mjs'), 'utf-8');
  for (const [name, src] of [['build-release-zip.mjs', gate], ['sync-bundled-vault.mjs', sync]]) {
    assert.match(src, /snapshotVaultHead\(/,
      `${name} must resolve the source vault through snapshotVaultHead`);
    // Both still compute the vault's own path — they have to, to hand it
    // to the snapshot and to check the sibling exists. What must NOT
    // happen is that path becoming the root they read content from.
    assert.match(src, /=\s*snapshot\.root\s*;/,
      `${name} must read content from the snapshot root, not the working tree`);
  }
  // And the gate must still run 0910's inputs check (§6: don't regress it
  // while editing the neighbouring function).
  assert.match(gate, /assertNoInputsFrontmatterDrift/);
});
