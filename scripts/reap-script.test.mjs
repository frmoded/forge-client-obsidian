// 2026-10-27-0715 — scripts/dev/reap.sh, the by-hand broom, proved by RUNNING it on stub processes and stub directories in a private TMPDIR. It is the one tool here that kills by a name, so what is pinned is its SAFETY as much as its effect:
// an orphan (ppid 1) that matches is killed; the same process with a living parent, an orphan that does not match, an orphan younger than the age limit, and anything under --dry-run are NOT; stale directories go and fresh ones and
// forge-mutate-cache stay. The pattern is a unique tag per case (REAP_PATTERN), so it can only ever see what this file started.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const REAP = path.resolve(import.meta.dirname, 'dev', 'reap.sh');
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function until(cond, ms = 5000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await sleepMs(100); } return cond(); }
const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'reap-test-'));

/** A sleeping node process whose command line carries `tag`; `orphan` = started by a shell that exits at once, so its parent becomes pid 1. Returns its pid (read from a file it writes). */
async function stub(dir, tag, { orphan }) {
  const pidfile = path.join(dir, `${tag}.pid`);
  // the shell writes its own pid and EXECs node, so the pid in the file is the node process's, and its command line carries the tag
  const script = `echo $$ > "${pidfile}"; exec "${process.execPath}" -e 'setInterval(() => {}, 1000); /* ${tag} */'`;
  let child = null;
  if (orphan) spawnSync('sh', ['-c', `nohup sh -c '${script.replace(/'/g, `'\\''`)}' </dev/null >/dev/null 2>&1 &`], { stdio: 'ignore' });   // started by a shell that exits at once: its parent becomes pid 1; stdio ignored so no inherited pipe keeps spawnSync waiting
  else child = spawn('sh', ['-c', script], { stdio: 'ignore' });
  assert.ok(await until(() => fs.existsSync(pidfile) && fs.readFileSync(pidfile, 'utf8').trim() !== '', 8000), `the stub ${tag} never started`);
  const pid = Number(fs.readFileSync(pidfile, 'utf8'));
  await sleepMs(300);
  return { pid, child };
}
const reap = (dir, tag, args = [], env = {}) => spawnSync('bash', [REAP, ...args], { encoding: 'utf8', env: { ...process.env, TMPDIR: dir, REAP_PATTERN: tag, REAP_MIN_AGE: '0', REAP_ASSUME_IDLE: '1', PROJECTS: dir, ...env } });
const kill = (...pids) => { for (const p of pids) { try { process.kill(p, 'SIGKILL'); } catch { /* gone */ } } };

test('an orphan (parent pid 1) that matches the pattern is killed, and the run says so', async () => {
  const dir = tmpdir(), tag = `reap-stub-${crypto.randomUUID()}`;
  const s = await stub(dir, tag, { orphan: true });
  try {
    const r = reap(dir, tag);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(await until(() => !alive(s.pid), 4000), 'the orphan is still running');
    assert.match(r.stdout, /killing an orphaned test process/);
  } finally { kill(s.pid); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('SAFETY: a process with the same name but a LIVING parent, an orphan that does not match, an orphan younger than the age limit, and a --dry-run are all left alone', async () => {
  const dir = tmpdir(), tag = `reap-stub-${crypto.randomUUID()}`, other = `reap-other-${crypto.randomUUID()}`;
  const withParent = await stub(dir, tag, { orphan: false }), notMatching = await stub(dir, other, { orphan: true }), orphan = await stub(dir, tag + '-b', { orphan: true });
  try {
    assert.equal(reap(dir, tag).status, 0);                                                    // kills only the orphan whose command contains `tag` (the -b one too: the tag is a prefix)
    assert.ok(await until(() => !alive(orphan.pid), 4000), 'the matching orphan should have been killed');
    assert.equal(alive(withParent.pid), true, 'a process with a living parent was killed');
    assert.equal(alive(notMatching.pid), true, 'an orphan that does not match the pattern was killed');
    const young = await stub(dir, tag + '-young', { orphan: true });
    assert.equal(reap(dir, tag, [], { REAP_MIN_AGE: '3600' }).status, 0);
    assert.equal(alive(young.pid), true, 'an orphan younger than REAP_MIN_AGE was killed');
    const dry = reap(dir, tag, ['--dry-run']);
    assert.equal(alive(young.pid), true, 'a dry run killed something');
    assert.match(dry.stdout, /would kill an orphaned test process/);
    kill(young.pid);
  } finally { kill(withParent.pid, notMatching.pid, orphan.pid); try { withParent.child.kill('SIGKILL'); } catch { /* gone */ } fs.rmSync(dir, { recursive: true, force: true }); }
});

test('stale directories go (a matrix work directory with its git worktrees, a mutation scratch directory, a Chrome profile); fresh ones, forge-mutate-cache and anything that is not ours stay; --dry-run removes nothing', async () => {
  const dir = tmpdir();
  const repo = path.join(dir, 'a-repo');
  const git = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  fs.mkdirSync(repo); git(repo, 'init', '-q', '-b', 'main'); fs.writeFileSync(path.join(repo, 'f'), 'x'); git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'i');
  const stale = (name) => { const d = path.join(dir, name); fs.mkdirSync(d); const t = new Date(Date.now() - 3 * 3600 * 1000); fs.utimesSync(d, t, t); return d; };
  const matrixDir = stale('drain-matrix.OLD'), scratch = stale('forge-mutate-OLD'), cache = stale('forge-mutate-cache'), profile = stale('cdp-OLD'), unrelated = stale('something-else');
  const freshScratch = path.join(dir, 'forge-mutate-NEW'); fs.mkdirSync(freshScratch);
  git(repo, 'worktree', 'add', '-q', '--detach', path.join(matrixDir, 'a-repo'));
  { const t = new Date(Date.now() - 3 * 3600 * 1000); fs.utimesSync(matrixDir, t, t); }            // adding the worktree touched the directory: make it stale again
  try {
    assert.equal(git(repo, 'worktree', 'list', '--porcelain').stdout.split('\n').filter((l) => l.startsWith('worktree ')).length, 2);
    const dry = reap(dir, 'nothing-matches', ['--dry-run'], { REAP_DIR_MIN_AGE: '600' });
    assert.ok([matrixDir, scratch, profile].every((d) => fs.existsSync(d)), 'a dry run removed a directory');
    assert.match(dry.stdout, /would remove the work directory of an interrupted matrix/);
    const r = reap(dir, 'nothing-matches', [], { REAP_DIR_MIN_AGE: '600' });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual([matrixDir, scratch, profile].map((d) => fs.existsSync(d)), [false, false, false], r.stdout);
    assert.deepEqual([cache, freshScratch, unrelated].map((d) => fs.existsSync(d)), [true, true, true], 'it removed something that is not a stale directory of ours');
    assert.equal(git(repo, 'worktree', 'list', '--porcelain').stdout.split('\n').filter((l) => l.startsWith('worktree ')).length, 1, 'the matrix worktree is still registered in the repo');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('with nothing to clear it says so and exits 0; an unknown option is refused', () => {
  const dir = tmpdir();
  try {
    const r = reap(dir, 'nothing-matches');
    assert.equal(r.status, 0);
    assert.match(r.stdout, /nothing to clear/);
    assert.equal(spawnSync('bash', [REAP, '--bogus'], { encoding: 'utf8' }).status, 2);
    assert.equal(reap(dir, 'nothing-matches', ['--quiet']).stdout, '');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
