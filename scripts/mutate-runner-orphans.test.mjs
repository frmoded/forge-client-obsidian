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

/** A project of one source file and one test, and a hand mutant that makes the function loop for ever. */
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mutate-orphans-'));
  fs.mkdirSync(path.join(dir, 'src')); fs.mkdirSync(path.join(dir, 'tmp'));
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"fix","type":"module"}');
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{"compilerOptions":{"target":"es2022","module":"esnext","moduleResolution":"bundler","allowImportingTsExtensions":true,"noEmit":true,"strict":true},"include":["src"]}');
  fs.writeFileSync(path.join(dir, 'src', 'a.ts'), 'export const f = (): number => 1;\n');
  fs.writeFileSync(path.join(dir, 'src', 'a.test.ts'), "import assert from 'node:assert/strict';\nimport { test } from 'node:test';\nimport { f } from './a.ts';\ntest('f is 1', () => { assert.equal(f(), 1); });\n");
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(dir, 'node_modules'));
  fs.writeFileSync(path.join(dir, 'hand.json'), JSON.stringify([['src/a.ts', 'hang', 'export const f = (): number => 1;', 'export const f = (): number => { while (true) { /* hang */ } };', ['src/a.test.ts']]]));
  return dir;
}

/** Start the runner, wait until its hung mutant is running, remember every process it started, then end the runner the way the case says. Returns what is left. */
async function scenario(signal, env = {}) {
  const dir = fixture();
  const runner = spawn(process.execPath, [RUNNER, '--root', dir, '--hand', path.join(dir, 'hand.json'), '--timeout', '120', '--max-loop', '0', '--no-fail'], {      // 2026-10-29-0840: the loop cap OFF - the hang this test needs to orphan must really hang (with the cap on it dies in a second)
    cwd: dir, env: { ...process.env, ...env, TMPDIR: path.join(dir, 'tmp') }, detached: true, stdio: 'ignore',
  });
  const mine = new Set();
  try {
    // the runner's own short-lived helpers (the broom, ps) are descendants too: wait for the TEST processes (`node --test` and the file it runs: the hung mutant)
    const testProcs = () => descendants(runner.pid).filter((d) => /--test/.test(d.cmd));
    assert.ok(await until(() => { descendants(runner.pid).forEach((d) => mine.add(d.pid)); return testProcs().length >= 2; }, 120000), 'the runner never started its test processes');
    await sleepMs(1000);                                                  // the registrations have reached the sidecar
    for (const d of descendants(runner.pid)) mine.add(d.pid);
    process.kill(runner.pid, signal);
    await sleepMs(signal === 'SIGKILL' ? 500 : 200);
    const gone = await until(() => [...mine].every((p) => !alive(p)), signal === 'SIGKILL' && env.FORGE_REAPER === 'off' ? 3000 : 40000);
    const survivors = [...mine].filter(alive);
    const scratchLeft = fs.readdirSync(path.join(dir, 'tmp')).filter((n) => n.startsWith('forge-mutate-') && n !== 'forge-mutate-cache');
    return { gone, survivors, scratchLeft, tmp: path.join(dir, 'tmp'), mine: [...mine] };
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
