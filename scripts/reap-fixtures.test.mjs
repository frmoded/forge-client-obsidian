// 2026-11-04-1174 (R): scripts/dev/reap-fixtures.mjs, proved on REAL processes. A deliberately leaked fixture process (an orphan, its command line carrying a scratch-directory marker) is gone after the reaper runs; an unrelated `node`, a marker process with a
// living parent, a young orphan and anything under --dry-run are NOT touched (each control can fail: the same orphan WITHOUT the guard is killed in the run that is allowed to). The marker here is a unique tag per case (--marker), so the reaper can only
// ever see what this file started; the default marker is pinned separately against the shape the runner really gives (the command line of a real runner's test process, read from `ps`).
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { SCRATCH_MARKER, etimeSeconds, parseProcessTable, reapFixtureOrphans, selectFixtureOrphans } from './dev/reap-fixtures.mjs';

const REAP = path.resolve(import.meta.dirname, 'dev', 'reap-fixtures.mjs');
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function until(cond, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await sleepMs(100); } return cond(); }
const kill = (...pids) => { for (const p of pids) { try { process.kill(p, 'SIGKILL'); } catch { /* gone */ } } };

/** A sleeping node whose command line carries `arg`; `orphan` = started by a shell that exits at once (its parent becomes pid 1). Returns its pid. */
async function stub(dir, arg, { orphan }) {
  const pidfile = path.join(dir, `${crypto.randomUUID()}.pid`);
  const script = `echo $$ > "${pidfile}"; exec "${process.execPath}" -e 'setInterval(() => {}, 1000)' ${arg}`;
  let child = null;
  if (orphan) spawnSync('sh', ['-c', `nohup sh -c '${script.replace(/'/g, `'\\''`)}' </dev/null >/dev/null 2>&1 &`], { stdio: 'ignore' });
  else child = spawn('sh', ['-c', script], { stdio: 'ignore' });
  assert.ok(await until(() => fs.existsSync(pidfile) && fs.readFileSync(pidfile, 'utf8').trim() !== '', 8000), 'the stub never started');
  await sleepMs(300);
  return { pid: Number(fs.readFileSync(pidfile, 'utf8')), child };
}
const reap = (tag, args = []) => spawnSync(process.execPath, [REAP, '--marker', `${tag}/`, ...args], { encoding: 'utf8' });

test('a deliberately LEAKED fixture process (an orphan whose command line carries the scratch directory) is gone after the reaper runs; an unrelated node orphan is not touched', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reap-fixtures-'));
  const tag = `fixture-${crypto.randomUUID()}`;
  const leaked = await stub(dir, `/tmp/${tag}/src/a.test.ts`, { orphan: true });
  const unrelated = await stub(dir, `/tmp/not-a-fixture-${crypto.randomUUID()}/src/a.test.ts`, { orphan: true });
  try {
    assert.equal(alive(leaked.pid), true, 'the leak exists before the reaper runs (the test measures the operation)');
    const r = reap(tag, ['--min-age', '0']);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(await until(() => !alive(leaked.pid), 6000), 'the leaked fixture process is still running after the reaper');
    assert.equal(alive(unrelated.pid), true, 'an unrelated node (no scratch directory in its command line) was killed');
  } finally { kill(leaked.pid, unrelated.pid); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('SAFETY, each control can fail: a marker process with a LIVING parent, an orphan younger than the age limit, and a --dry-run are all left alone; the same orphan IS killed once it is old enough and the run is real', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reap-fixtures-'));
  const tag = `fixture-${crypto.randomUUID()}`;
  const withParent = await stub(dir, `/tmp/${tag}/src/a.test.ts`, { orphan: false });
  const young = await stub(dir, `/tmp/${tag}/src/b.test.ts`, { orphan: true });
  try {
    assert.equal(reap(tag, ['--min-age', '0']).status, 0);
    assert.equal(alive(withParent.pid), true, 'a process with a living parent was killed');
    assert.ok(await until(() => !alive(young.pid), 6000), 'CONTROL: the orphan with the marker was not killed by the real run: the guards above prove nothing');
    const young2 = await stub(dir, `/tmp/${tag}/src/c.test.ts`, { orphan: true });
    assert.equal(reap(tag, ['--min-age', '3600']).status, 0);
    assert.equal(alive(young2.pid), true, 'an orphan younger than the age limit was killed');
    const dry = reap(tag, ['--min-age', '0', '--dry-run']);
    assert.equal(alive(young2.pid), true, 'a dry run killed something');
    assert.match(dry.stdout + dry.stderr, /would kill a leaked fixture process|^$/);
    assert.equal(reap(tag, ['--min-age', '0']).status, 0);
    assert.ok(await until(() => !alive(young2.pid), 6000), 'CONTROL: and the same orphan goes once the age limit allows and the run is real');
  } finally { kill(withParent.pid, young.pid); try { withParent.child.kill('SIGKILL'); } catch { /* gone */ } fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the pure selection: ppid 1, the owner, the age and the marker, all four; this process is never selected; the default marker is a scratch directory of the runner and not its cache', () => {
  const rows = parseProcessTable([
    '  101     1   101   05:00 me  node --test --test-reporter=tap /private/var/x/forge-mutate-AbC123/src/a.test.ts',
    '  102   200   102   05:00 me  node --test /private/var/x/forge-mutate-AbC123/src/a.test.ts',
    '  103     1   103   00:10 me  node --test /private/var/x/forge-mutate-AbC123/src/a.test.ts',
    '  104     1   104   05:00 other node --test /private/var/x/forge-mutate-AbC123/src/a.test.ts',
    '  105     1   105   05:00 me  node --test src/a.test.ts',
    '  106     1   106   05:00 me  node /private/var/x/forge-mutate-cache/index.mjs',
    '  107     1   107 1-02:03:04 me  node /tmp/mutate-orphans-q/tmp/forge-mutate-Zz9Zz9/src/a.test.ts',
  ].join('\n'));
  assert.equal(rows.length, 7);
  assert.deepEqual(selectFixtureOrphans(rows, { me: 'me', minAgeSec: 60 }).map((r) => r.pid), [101, 107]);
  assert.deepEqual(selectFixtureOrphans(rows, { me: 'me', minAgeSec: 60, self: 101 }).map((r) => r.pid), [107], 'never this process');
  assert.deepEqual(selectFixtureOrphans(rows, { me: 'me', minAgeSec: 0 }).map((r) => r.pid), [101, 103, 107]);
  assert.equal(etimeSeconds('05:00'), 300); assert.equal(etimeSeconds('1-02:03:04'), 93784); assert.equal(etimeSeconds('01:02:03'), 3723);
  assert.equal(SCRATCH_MARKER.test('/x/forge-mutate-cache/y'), false);
  assert.equal(SCRATCH_MARKER.test('/x/forge-mutate-AbC123/y'), true);
});

test('reapFixtureOrphans: kills exactly the selected rows (a stub kill), says so unless quiet, and a dry run kills none', () => {
  const me = os.userInfo().username;
  const rows = parseProcessTable(`  101     1   101   05:00 ${me}  node /x/forge-mutate-AbC123/src/a.test.ts\n  102     1   102   05:00 ${me}  node unrelated.mjs\n  103     1   103   05:00 someone-else  node /x/forge-mutate-AbC123/src/b.test.ts`);
  const killed = []; const said = [];
  const v = reapFixtureOrphans({ rows, kill: (p) => killed.push(p), quiet: false, log: (m) => said.push(m) });
  assert.deepEqual(v.map((r) => r.pid), [101]);
  assert.deepEqual(killed, [101]);
  assert.match(said.join('\n'), /killing a leaked fixture process \(pid 101/);
  const k2 = [];
  reapFixtureOrphans({ rows, kill: (p) => k2.push(p), dryRun: true });
  assert.deepEqual(k2, []);
});

test('WIRING: npm test ends with the reaper (posttest), the test script itself is unchanged, and the matrix calls it after its legs', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.posttest, 'node scripts/dev/reap-fixtures.mjs --quiet');
  assert.equal(pkg.scripts.test, 'node --test src/*.test.ts scripts/*.test.mjs');
  assert.match(fs.readFileSync(path.join(root, 'scripts/drain-matrix.sh'), 'utf8'), /reap-fixtures\.mjs/);
});
