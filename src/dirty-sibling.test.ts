// The dirty-sibling check (test-support/dirty-sibling.ts): a test that compares a fixture with a file in a sibling checkout skips, with a printed reason, when that checkout holds untracked or
// modified files, and stays strict when it is clean. Real git repos in a temp directory; nothing is mocked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { dirtySiblingReason } from './test-support/dirty-sibling.ts';

const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, stdio: 'ignore' });
function repo(): { root: string; bars: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dirty-sibling-'));
  git(root, 'init', '-q');
  const bars = path.join(root, 'bars');
  fs.mkdirSync(bars);
  fs.writeFileSync(path.join(bars, 'README.md'), 'tracked\n');
  git(root, 'add', '.'); git(root, 'commit', '-q', '-m', 'init');
  return { root, bars };
}

test('a clean checkout is strict (null), an untracked bar or a modified tracked file is a reason that names the file, and the reason goes away when the file does', () => {
  const { root, bars } = repo();
  try {
    assert.equal(dirtySiblingReason(bars), null, 'clean');
    fs.writeFileSync(path.join(bars, 'bar_005.md'), 'the plugin refreshed this\n');
    const untracked = dirtySiblingReason(bars, 'music-playground/bars');
    assert.match(untracked ?? '', /^music-playground\/bars has 1 untracked or modified file\(s\) \(bars\/bar_005\.md\)/);
    fs.rmSync(path.join(bars, 'bar_005.md'));
    assert.equal(dirtySiblingReason(bars), null, 'back to clean');
    fs.writeFileSync(path.join(bars, 'README.md'), 'edited\n');
    assert.match(dirtySiblingReason(bars) ?? '', /1 untracked or modified file\(s\) \(bars\/README\.md\)/, 'a modified tracked file counts too');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('only the directory asked about counts, many files are summarised, and a directory that is not a git checkout (or does not exist) is not judged', () => {
  const { root, bars } = repo();
  try {
    fs.writeFileSync(path.join(root, 'elsewhere.md'), 'dirty, but not under bars\n');
    assert.equal(dirtySiblingReason(bars), null, 'a dirty file outside the directory is not this directory\'s business');
    for (let i = 0; i < 5; i++) fs.writeFileSync(path.join(bars, `b${i}.md`), 'x\n');
    assert.match(dirtySiblingReason(bars) ?? '', /5 untracked or modified file\(s\) \(.*, \.\.\.\)/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'not-git-'));
  try {
    assert.equal(dirtySiblingReason(plain), null, 'not a git repo: strict');
    assert.equal(dirtySiblingReason(path.join(plain, 'nope')), null, 'missing: strict');
  } finally { fs.rmSync(plain, { recursive: true, force: true }); }
});
