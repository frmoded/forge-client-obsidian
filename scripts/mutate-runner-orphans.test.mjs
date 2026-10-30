// 2026-10-27-0715 — the mutation runner leaves no orphan behind. Measured on 2026-10-27 (not assumed): a runner killed with -9 or by SIGHUP (a closed terminal) left its `node --test` group running with ppid 1, and a mutant that hangs
// then spun at 100% CPU for ever (node --test runs a file with --test-timeout=0), plus its scratch directory. This proves the fix by RUNNING the real runner on a tiny fixture project whose one mutant hangs, killing the runner, and
// looking at the real processes: with the reaper OFF the children outlive the runner (the control: it shows the test measures the operation), with it ON they are gone within seconds and the scratch directory goes with them. The
// fixture's temp dir is private to this test (TMPDIR points into it), so nothing here looks at, or removes, anything that is not its own. Also pins the heap cap a test child gets (a mechanism test: a child over the cap dies).
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { withHeapCap } from './dev/mutate.mjs';

const REPO = path.resolve(import.meta.dirname, '..');
const RUNNER = path.join(REPO, 'scripts', 'dev', 'mutate.mjs');
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function until(cond, ms = 5000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await sleepMs(100); } return cond(); }

function descendants(root) {
  const rows = spawnSync('ps', ['-Ao', 'pid,ppid,command'], { encoding: 'utf8' }).stdout.split('\n').slice(1).map((l) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(l)).filter(Boolean).map((m) => [Number(m[1]), Number(m[2]), m[3]]);
  const seen = new Set([root]);
  for (let grew = true; grew;) { grew = false; for (const [pid, ppid] of rows) if (seen.has(ppid) && !seen.has(pid)) { seen.add(pid); grew = true; } }
  seen.delete(root);
  return rows.filter(([pid]) => seen.has(pid)).map(([pid, , cmd]) => ({ pid, cmd }));
}

/** A project of one source file and one test, and a hand mutant that makes the function loop for ever. `nested`: the test first starts a DETACHED child of its own (its own process group, as a test that starts a nested runner, a Chrome or a matrix does) and writes its pid to $NESTED_PID_FILE. */
function fixture(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mutate-orphans-'));
  fs.mkdirSync(path.join(dir, 'src')); fs.mkdirSync(path.join(dir, 'tmp'));
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"fix","type":"module"}');
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{"compilerOptions":{"target":"es2022","module":"esnext","moduleResolution":"bundler","allowImportingTsExtensions":true,"noEmit":true,"strict":true},"include":["src"]}');
  fs.writeFileSync(path.join(dir, 'src', 'a.ts'), 'export const f = (): number => 1;\n');
  const grandchild = "import { spawn } from 'node:child_process';\nimport fs from 'node:fs';\n";
  const startIt = "const c = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' }); c.unref(); fs.writeFileSync(process.env.NESTED_PID_FILE, String(c.pid)); ";
  fs.writeFileSync(path.join(dir, 'src', 'a.test.ts'), `${opts.nested ? grandchild : ''}import assert from 'node:assert/strict';\nimport { test } from 'node:test';\nimport { f } from './a.ts';\ntest('f is 1', () => { ${opts.nested ? startIt : ''}assert.equal(f(), 1); });\n`);
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(dir, 'node_modules'));
  fs.writeFileSync(path.join(dir, 'hand.json'), JSON.stringify([['src/a.ts', 'hang', 'export const f = (): number => 1;', 'export const f = (): number => { while (true) { /* hang */ } };', ['src/a.test.ts']]]));
  return dir;
}

/** Start the runner, wait until its hung mutant is running, remember every process it started, then end the runner the way the case says (a signal name, or a function that gets the runner and its directory: the `pkill -f` road). Returns what is left. */
async function scenario(signal, env = {}, opts = {}) {
  const dir = fixture(opts);
  const runnerArgs = ['--root', dir, '--hand', path.join(dir, 'hand.json'), '--timeout', String(opts.timeout ?? 120), '--max-loop', '0', '--no-fail'];
  const runner = spawn(process.execPath, [RUNNER, ...runnerArgs], {      // 2026-10-29-0840: the loop cap OFF - the hang this test needs to orphan must really hang (with the cap on it dies in a second)
    cwd: dir, env: { ...process.env, ...env, TMPDIR: path.join(dir, 'tmp'), NESTED_PID_FILE: path.join(dir, 'nested.pid') }, detached: true, stdio: 'ignore',
  });
  const mine = new Set();
  try {
    // the runner's own short-lived helpers (the broom, ps) are descendants too: wait for the TEST processes (`node --test` and the file it runs: the hung mutant)
    const testProcs = () => descendants(runner.pid).filter((d) => /--test/.test(d.cmd));
    assert.ok(await until(() => { descendants(runner.pid).forEach((d) => mine.add(d.pid)); return testProcs().length >= 2; }, 120000), 'the runner never started its test processes');
    await sleepMs(1000);                                                  // the registrations have reached the sidecar
    for (const d of descendants(runner.pid)) mine.add(d.pid);
    if (opts.nested) assert.ok(await until(() => fs.existsSync(path.join(dir, 'nested.pid')), 20000), 'the test never started its own child');
    for (const d of descendants(runner.pid)) mine.add(d.pid);
    if (typeof signal === 'function') signal(runner, dir); else if (signal !== null) process.kill(runner.pid, signal);
    await sleepMs(signal === 'SIGKILL' ? 500 : 200);
    const gone = await until(() => [...mine].every((p) => !alive(p)), signal === 'SIGKILL' && env.FORGE_REAPER === 'off' ? 3000 : 40000);
    const survivors = [...mine].filter(alive);
    const scratchLeft = fs.readdirSync(path.join(dir, 'tmp')).filter((n) => n.startsWith('forge-mutate-') && n !== 'forge-mutate-cache');
    const nestedPid = fs.existsSync(path.join(dir, 'nested.pid')) ? Number(fs.readFileSync(path.join(dir, 'nested.pid'), 'utf8')) : null;
    if (nestedPid !== null) mine.add(nestedPid);                          // for the cleanup below, whatever happens
    return { gone, survivors, scratchLeft, tmp: path.join(dir, 'tmp'), mine: [...mine], nestedPid, nestedAlive: nestedPid !== null && alive(nestedPid) };
  } finally {
    for (const p of mine) { try { process.kill(-p, 'SIGKILL'); } catch { /* not a group leader */ } try { process.kill(p, 'SIGKILL'); } catch { /* gone */ } }
    try { process.kill(-runner.pid, 'SIGKILL'); } catch { /* gone */ }
    await sleepMs(200);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('CONTROL: with the reaper OFF a runner killed with -9 leaves its hung test running (the orphan this fix exists for)', async () => {
  const r = await scenario('SIGKILL', { FORGE_REAPER: 'off' });
  assert.equal(r.gone, false, 'without the reaper nothing was left: the tests below would prove nothing');
  assert.ok(r.survivors.length >= 1, `survivors: ${r.survivors}`);
});

for (const signal of ['SIGKILL']) {                  // SIGHUP takes the same road (the pipe closes); its handler is pinned in reaper.test.mjs and cdp-orphans.test.mjs, so this heavy scenario runs once
  test(`a runner ended by ${signal} (nothing can be handled) leaves no process and no scratch directory`, async () => {
    const r = await scenario(signal);
    assert.deepEqual(r.survivors, [], `still running after ${signal}: ${r.survivors} (of ${r.mine})`);
    if (signal === 'SIGKILL') assert.deepEqual(r.scratchLeft, [], `scratch directories left behind: ${r.scratchLeft}`);
  });
}

// 2026-10-30-1010 - "do not leave the tests of a hung mutant behind when the runner is killed by SIGTERM": CC's 0900-0930 note 5 saw a `pkill -f mutate.mjs` stop the runner and leave scratch test processes (observed, not proven). `pkill -f` sends SIGTERM to
// EVERY process whose command line matches, not only the runner: these two scenarios end the runner the two ways a person does it, on the real runner with a really hung mutant, and look at the real processes. The signal road is handled
// in-process (killAll in mutate.mjs); the sidecar is the net under it.
test('a runner ended by SIGTERM (a plain kill, a timeout, a parent that ends it) leaves no test process and no scratch directory', async () => {
  const r = await scenario('SIGTERM');
  assert.deepEqual(r.survivors, [], `still running after SIGTERM: ${r.survivors} (of ${r.mine})`);
  assert.deepEqual(r.scratchLeft, [], `scratch directories left behind: ${r.scratchLeft}`);
});

test('a runner ended by `pkill -f` on its command line (what a person types) leaves no test process and no scratch directory', async () => {
  const r = await scenario((runner, dir) => { spawnSync('pkill', ['-f', '--', `--root ${dir}`]); });
  assert.deepEqual(r.survivors, [], `still running after pkill -f: ${r.survivors} (of ${r.mine})`);
  assert.deepEqual(r.scratchLeft, [], `scratch directories left behind: ${r.scratchLeft}`);
});

// 2026-10-30-1010 - the leak the two scenarios above do NOT show (measured, not assumed): a test file that starts a child of its OWN in ANOTHER process group (a nested mutation runner, a headless Chrome, a matrix - `detached: true`) is out of reach of
// the runner's `kill(-pid)`: the group of the test file dies, the grandchild keeps running (a hung nested mutant spins at 100% CPU), whether the runner was ended by a signal, by its own --timeout, or by SIGKILL (the sidecar kills the groups it was told
// about, and was never told about this one). The fix walks the process TREE under every test file it kills (scripts/dev/proc-tree.mjs). CONTROL first: with the tree walk OFF (FORGE_TREE_KILL=off) the grandchild IS left, so the scenarios measure the operation.
test('CONTROL: with the tree kill OFF a runner ended by SIGTERM leaves the detached child its test file started (the leak this fix exists for)', async () => {
  const r = await scenario('SIGTERM', { FORGE_TREE_KILL: 'off' }, { nested: true });
  assert.equal(r.nestedAlive, true, 'the grandchild was gone without the fix: the scenarios below would prove nothing');
});

test('a runner ended by SIGTERM leaves no process, not even the detached child its test file started', async () => {
  const r = await scenario('SIGTERM', {}, { nested: true });
  assert.notEqual(r.nestedPid, null);
  assert.deepEqual(r.survivors, [], `still running after SIGTERM: ${r.survivors} (of ${r.mine}); the detached child ${r.nestedPid} alive: ${r.nestedAlive}`);
});

test('a runner ended by `pkill -f` leaves no process, not even the detached child its test file started', async () => {
  const r = await scenario((runner, dir) => { spawnSync('pkill', ['-f', '--', `--root ${dir}`]); }, {}, { nested: true });
  assert.deepEqual(r.survivors, [], `still running after pkill -f: ${r.survivors}; the detached child ${r.nestedPid} alive: ${r.nestedAlive}`);
});

test('a runner ended by SIGKILL (the sidecar\'s road) leaves no process, not even the detached child its test file started', async () => {
  const r = await scenario('SIGKILL', {}, { nested: true });
  assert.deepEqual(r.survivors, [], `still running after SIGKILL: ${r.survivors}; the detached child ${r.nestedPid} alive: ${r.nestedAlive}`);
});

test('a mutant killed by the runner\'s own --timeout takes the detached child of its test file with it (the runner is left running to the end of the run)', async () => {
  const r = await scenario(null, {}, { nested: true, timeout: 4 });
  assert.notEqual(r.nestedPid, null);
  const gone = await until(() => !alive(r.nestedPid), 1);
  void gone;
  assert.equal(r.nestedAlive, false, `the detached child ${r.nestedPid} outlived the timeout kill of its test file`);
});

test('the heap cap: a test child gets --max-old-space-size (2048 by default, FORGE_TEST_HEAP_MB overrides, an existing cap wins, other options are kept)', () => {
  assert.equal(withHeapCap(undefined, 2048), '--max-old-space-size=2048');
  assert.equal(withHeapCap('', 2048), '--max-old-space-size=2048');
  assert.equal(withHeapCap('--no-warnings', 512), '--no-warnings --max-old-space-size=512');
  assert.equal(withHeapCap('--max-old-space-size=8192 --no-warnings', 2048), '--max-old-space-size=8192 --no-warnings', 'a cap the person set is theirs');
});

test('the cap is a MECHANISM, not a spelling: a child that allocates past it is stopped by node (out of memory), not left to eat the machine', () => {
  const r = spawnSync(process.execPath, ['-e', 'const keep = []; for (;;) keep.push(new Array(1e5).fill(Math.random()));'], { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: withHeapCap('', 64) }, timeout: 60000 });
  assert.notEqual(r.status, 0, 'the allocating child finished normally');
  assert.match(String(r.stderr), /heap out of memory|JavaScript heap|Allocation failed/i);
});
