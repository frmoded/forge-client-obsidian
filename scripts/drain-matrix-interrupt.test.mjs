// 2026-10-27-0715 — an interrupted drain matrix leaves nothing behind. Measured on 2026-10-27 against the real script and the real repos: Ctrl-C (SIGINT to the process group) left a work directory with 8 git worktrees registered in seven repos,
// and SIGTERM to the script alone (a parent killed, or timing out) left 21 of its 65 processes running (the legs, `npm test`, node test files) as well. Proved here by RUNNING scripts/drain-matrix.sh against the stub projects of
// drain-matrix-parallel.test.mjs, whose test step sleeps, ending it in the middle of that step and looking at the real processes and the real `git worktree list` of every stub repo. Everything this file looks at or kills is a
// descendant of the matrix it started (captured before the signal), or a path under its own private TMPDIR. Skipped (visibly) when forge/.venv is not there, like its sibling.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { REPOS, SCRIPT, git, projects, skip } from './test-support/matrix-stubs.mjs';

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function until(cond, ms = 5000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await sleepMs(100); } return cond(); }

function table() {
  return spawnSync('ps', ['-Ao', 'pid,ppid,command'], { encoding: 'utf8' }).stdout.split('\n').slice(1).map((l) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(l)).filter(Boolean).map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), cmd: m[3] }));
}
function descendants(root) {
  const rows = table(), seen = new Set([root]);
  for (let grew = true; grew;) { grew = false; for (const r of rows) if (seen.has(r.ppid) && !seen.has(r.pid)) { seen.add(r.pid); grew = true; } }
  seen.delete(root);
  return rows.filter((r) => seen.has(r.pid));
}
const worktrees = (p) => REPOS.map((r) => git(path.join(p.dir, r), 'worktree', 'list', '--porcelain').split('\n').filter((l) => l.startsWith('worktree ')).length - 1);   // minus the repo itself

async function interrupt(how) {
  const p = projects();
  const matrix = spawn('bash', [SCRIPT, '--no-forge'], { cwd: p.client, detached: true, stdio: 'ignore', env: { ...process.env, PROJECTS: p.dir, TMPDIR: p.dir, LOGKEEP: p.dir, MARKS: p.marks, TEST_MS: '60000' } });
  const mine = new Map();
  try {
    assert.ok(await until(() => { for (const r of descendants(matrix.pid)) mine.set(r.pid, r.cmd); return [...mine.values()].filter((c) => /scripts\/test\.mjs/.test(c)).length >= 2; }, 120000), 'the matrix never reached its test step (both editions)');
    assert.ok(worktrees(p).some((n) => n > 0), 'the matrix has its worktrees in place before the interruption');
    how(matrix);
    const gone = await until(() => [...mine.keys()].every((pid) => !alive(pid)) && worktrees(p).every((n) => n === 0), 60000);
    return { gone, survivors: [...mine.entries()].filter(([pid]) => alive(pid)).map(([pid, c]) => `${pid} ${c.slice(0, 60)}`), worktrees: worktrees(p), workDirs: fs.readdirSync(p.dir).filter((n) => n.startsWith('drain-matrix.')) };
  } finally {
    for (const pid of mine.keys()) { try { process.kill(-pid, 'SIGKILL'); } catch { /* not a leader */ } try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
    try { process.kill(-matrix.pid, 'SIGKILL'); } catch { /* gone */ }
    await sleepMs(300);
    p.done();
  }
}

test('Ctrl-C (SIGINT to the whole process group) stops the legs, removes the worktrees of every repo and the work directory', { skip }, async () => {
  const r = await interrupt((m) => process.kill(-m.pid, 'SIGINT'));
  assert.deepEqual(r.survivors, [], `still running: ${r.survivors}`);
  assert.deepEqual(r.worktrees, REPOS.map(() => 0), 'git worktrees left registered in the repos');
  assert.deepEqual(r.workDirs, [], `work directories left behind: ${r.workDirs}`);
});

test('SIGTERM to the matrix script ALONE (its parent was killed or timed out) stops the legs and everything they started, and removes the worktrees', { skip }, async () => {
  const r = await interrupt((m) => process.kill(m.pid, 'SIGTERM'));
  assert.deepEqual(r.survivors, [], `still running: ${r.survivors}`);
  assert.deepEqual(r.worktrees, REPOS.map(() => 0), 'git worktrees left registered in the repos');
  assert.deepEqual(r.workDirs, [], `work directories left behind: ${r.workDirs}`);
});
