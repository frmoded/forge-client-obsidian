// 2026-11-24-1037 Part B - the matrix takes back the worktrees a KILLED matrix left, at its START, before it makes its own: `git worktree prune` (records whose directory is gone) and the --cleanup-worktrees behaviour (every worktree git has registered
// under a drain-matrix.* directory), and it SAYS how many stale worktrees it found (`stale worktrees found: N`: the number a drain reports). Proved by RUNNING the real script against the stub projects (test-support/matrix-stubs.mjs); no heavy run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPOS, git, matrix, projects, skip } from './test-support/matrix-stubs.mjs';

const worktreesOf = (p, repo) => git(path.join(p.dir, repo), 'worktree', 'list', '--porcelain').split('\n').filter((l) => l.startsWith('worktree ')).map((l) => l.slice(9));
/** What a killed matrix leaves: a registered worktree under a drain-matrix.* directory in every repo, a second one of the client (the lean leg's), and a worktree that is not the matrix's. */
function strand(p) {
  const work = path.join(p.dir, 'drain-matrix.KiLLed1');
  for (const r of REPOS) git(path.join(p.dir, r), 'worktree', 'add', '--detach', path.join(work, r), 'HEAD');
  git(path.join(p.dir, 'forge-client-obsidian'), 'worktree', 'add', '--detach', path.join(work, 'lean', 'forge-client-obsidian'), 'HEAD');
  const other = path.join(p.dir, 'somebody-elses-worktree'); git(path.join(p.dir, 'music-theory'), 'worktree', 'add', '--detach', other, 'HEAD');
  return { work, other };
}

test('1037 B: a matrix that starts over the worktrees of a killed one says how many it found, prunes the record whose directory is gone, removes the rest BEFORE it makes its own, and keeps a worktree that is not the matrix\'s', { skip }, () => {
  const p = projects();
  try {
    const s = strand(p);
    fs.rmSync(path.join(s.work, 'music-core'), { recursive: true, force: true });          // a registered worktree whose directory is gone: only `git worktree prune` can take it back
    assert.equal(worktreesOf(p, 'music-core').filter((w) => /drain-matrix\./.test(w)).length, 1, 'registered, directory gone');
    const r = matrix(p, ['--no-forge'], { TEST_MS: '100' });
    assert.equal(r.status, 0, r.out + r.err);
    assert.match(r.out, /^stale worktrees found: 8$/m, 'the number a drain reports (7 repos + the lean worktree, the one with the missing directory included)');
    assert.match(r.out, /cleanup-worktrees: 7 removed, 0 could not be removed/);
    assert.ok(r.out.indexOf('stale worktrees found') < r.out.indexOf('== worktrees in'), 'before the matrix makes its own worktrees');
    assert.ok(!/WARN: \d+ worktree\(s\) of an earlier matrix are still registered/.test(r.err + r.out), 'nothing is left to warn about');
    for (const repo of REPOS) assert.deepEqual(worktreesOf(p, repo).filter((w) => /\/drain-matrix\./.test(w)), [], `${repo}: nothing registered under a drain-matrix.* directory`);
    assert.ok(worktreesOf(p, 'music-theory').some((w) => w.endsWith('somebody-elses-worktree')), 'a worktree that is not the matrix\'s stays');
  } finally { p.done(); }
});

test('1037 B: no stale worktree: the line says 0, nothing is removed, and the matrix runs as before', { skip }, () => {
  const p = projects();
  try {
    const r = matrix(p, ['--no-forge'], { TEST_MS: '100' });
    assert.equal(r.status, 0, r.out + r.err);
    assert.match(r.out, /^stale worktrees found: 0$/m);
    assert.doesNotMatch(r.out, /cleanup-worktrees: \d+ removed/, 'nothing to clean: no cleanup report');
  } finally { p.done(); }
});

test('1037 B: with the heavy lock OFF (no one keeps another matrix from running) the matrix counts but removes nothing: it could be taking back a live matrix\'s worktrees', { skip }, () => {
  const p = projects();
  try {
    strand(p);
    const r = matrix(p, ['--no-forge'], { TEST_MS: '100', FORGE_HEAVY_LOCK: 'off', FORGE_HEAVY_LOCK_HELD: '' });
    assert.equal(r.status, 0, r.out + r.err);
    assert.match(r.out, /^stale worktrees found: 8 \(not removed: the heavy lock is off\)$/m);
    assert.equal(worktreesOf(p, 'forge').filter((w) => /\/drain-matrix\.KiLLed1/.test(w)).length, 1, 'the stranded worktree is still registered');
  } finally { p.done(); }
});
