// 2026-11-05-1184 - scripts/run-tests.mjs: `npm test` runs the nested-runner files AFTER the rest, ONE AT A TIME, each in its own process group under a hard timeout. Proven on fixture test files in a scratch directory (never the
// repo's own suite): the order, the summed summary the matrix reads (the LAST ℹ lines), a file that crashes, and - the point - a test whose GRANDCHILD holds the pipe and never ends: the group timeout kills the whole tree, names
// the file, and the run CONTINUES with the next one. The control shows what a kill of only the child would have left running. This file imports the runner, so scripts/test-groups.mjs puts it in the group too.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { CALM_NESTED_CONCURRENCY, main, nestedConcurrency, parseSummary, runNestedGroup } from './run-tests.mjs';

const mkdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'run-tests-fixture-'));
const write = (dir, name, text) => { fs.writeFileSync(path.join(dir, name), text); return name; };
const PASS = (marker) => `import { test } from 'node:test'; test('${marker}', () => { console.log('RAN ${marker}'); });\n`;
/** A test that spawns a grandchild which holds the inherited pipes and never ends, records its pid, then waits for ever. Its text names `--test` and calls spawn, so the rule puts it in the group. */
const HANG = (pidFile) => `import { spawn } from 'node:child_process'; import fs from 'node:fs';
const grandchild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1e6)', '--', '--test'], { stdio: 'inherit' });
fs.writeFileSync(${JSON.stringify(pidFile)}, String(grandchild.pid));
console.log('HANGING with grandchild ' + grandchild.pid);
await new Promise(() => {});
`;
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const until = async (cond, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await new Promise((r) => setTimeout(r, 50)); } return cond(); };
/** The environment of a run that asks for `n` nested files at a time (the real one, with that one setting changed). */
const withConcurrency = (n) => ({ ...process.env, FORGE_NESTED_CONCURRENCY: String(n) });
const collect = () => { let text = ''; return { stream: { write: (c) => { text += c; return true; } }, get text() { return text; } }; };

test('parseSummary reads the LAST summary block of an output (the matrix does the same), null when there is none', () => {
  const out = 'ℹ tests 3\nℹ suites 0\nℹ pass 3\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 12.5\n\nx\nℹ tests 7\nℹ pass 6\nℹ fail 1\n';
  assert.deepEqual(parseSummary(out), { tests: 7, suites: 0, pass: 6, fail: 1, cancelled: 0, skipped: 0, todo: 0, duration_ms: 12.5 });
  assert.equal(parseSummary('nothing here'), null);
});

test('the plain files run first and the nested-runner files after, one at a time; the final summary sums both and is the LAST in the output; all green = exit 0', async () => {
  const dir = mkdir();
  try {
    const files = [
      write(dir, 'a.test.mjs', PASS('a')),
      write(dir, 'n1.test.mjs', `import { spawnSync } from 'node:child_process'; import { test } from 'node:test';\ntest('n1', () => { console.log('RAN n1'); spawnSync(process.execPath, ['--test', '--version']); });\n`),
      write(dir, 'c.test.mjs', PASS('c')),
      write(dir, 'n2.test.mjs', `import { spawnSync } from 'node:child_process'; import { test } from 'node:test';\ntest('n2', () => { console.log('RAN n2'); spawnSync(process.execPath, ['--test', '--version']); });\n`),
    ];
    const o = collect();
    const code = await main(files, { root: dir, out: o.stream, err: o.stream, env: withConcurrency(1) });
    assert.equal(code, 0, o.text);
    const at = (m) => o.text.indexOf(`RAN ${m}`);
    assert.ok(at('a') >= 0 && at('c') >= 0 && at('n1') >= 0 && at('n2') >= 0, o.text);
    assert.ok(Math.max(at('a'), at('c')) < at('n1'), 'every plain file ran before the first nested one');
    assert.ok(at('n1') < at('n2'), 'and the nested ones in order');
    assert.match(o.text, /ℹ run-tests: 2 file\(s\) in one run, then 2 nested-runner file\(s\) \(scripts\/test-groups.mjs\), each under 300 s/);
    assert.match(o.text, /ℹ nested-runner group: 2 file\(s\), one at a time, each under 300 s: 2 ok, 0 failed/);
    const last = parseSummary(o.text);
    assert.equal(last.tests, 4);
    assert.equal(last.pass, 4);
    assert.equal(last.fail, 0);
    assert.ok(o.text.lastIndexOf('ℹ tests 4') > o.text.lastIndexOf('RAN n2'), 'the summed block is printed LAST: the matrix reads the last lines');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a failing plain test and a nested file that crashes without a summary are both red, named, and counted; the run still finishes', async () => {
  const dir = mkdir();
  try {
    const files = [
      write(dir, 'bad.test.mjs', `import { test } from 'node:test'; test('bad', () => { throw new Error('boom'); });\n`),
      write(dir, 'crash.test.mjs', `import { spawnSync } from 'node:child_process';\nspawnSync(process.execPath, ['--test', '--version']);\nprocess.exit(3);\n`),
    ];
    const o = collect();
    const code = await main(files, { root: dir, out: o.stream, err: o.stream, env: withConcurrency(1) });
    assert.equal(code, 1);
    assert.match(o.text, /✖ crash\.test\.mjs: 1 failing test\(s\)/, 'node reports a file that exits 3 as one failed test, and the group names the file');
    const last = parseSummary(o.text);
    assert.ok(last.fail >= 2, `both counted: ${JSON.stringify(last)}`);
    assert.match(o.text, /ℹ nested-runner group: 1 file\(s\), one at a time, each under 300 s: 0 ok, 1 failed/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('THE POINT: a test whose GRANDCHILD holds the pipe and never ends is killed WITH its children at the group timeout (here with the group running at once), named in one line, and the run goes on to the next file', async () => {
  const dir = mkdir();
  const pidFile = path.join(dir, 'grandchild.pid');
  const saved = process.env.FORGE_NESTED_TEST_TIMEOUT_S;
  process.env.FORGE_NESTED_TEST_TIMEOUT_S = '2';
  try {
    const files = [
      write(dir, 'plain.test.mjs', PASS('plain')),
      write(dir, 'hang.test.mjs', HANG(pidFile)),
      write(dir, 'after.test.mjs', `import { spawnSync } from 'node:child_process'; import { test } from 'node:test';\ntest('after', () => { console.log('RAN after'); spawnSync(process.execPath, ['--test', '--version']); });\n`),
    ];
    const o = collect();
    const t0 = Date.now();
    const code = await main(files, { root: dir, out: o.stream, err: o.stream, env: withConcurrency(3) });      // 2026-11-05-1186: the 1184 control, under concurrency
    const took = Date.now() - t0;
    assert.equal(code, 1, 'a hang is a failure');
    assert.match(o.text, /✖ hang\.test\.mjs: ran 2 s: killed with its children/);
    assert.match(o.text, /RAN after/, 'the run continued with the next nested file');
    assert.ok(took < 30_000, `it did not stall: ${took} ms`);
    const pid = Number(fs.readFileSync(pidFile, 'utf8'));
    assert.ok(pid > 0);
    assert.ok(await until(() => !alive(pid)), `the grandchild ${pid} is dead with its parent`);
    assert.match(o.text, /ℹ nested-runner group: 2 file\(s\), 2 at a time, each under 2 s: 1 ok, 1 failed/);
  } finally {
    if (saved === undefined) delete process.env.FORGE_NESTED_TEST_TIMEOUT_S; else process.env.FORGE_NESTED_TEST_TIMEOUT_S = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CONTROL (the test can fail): killing only the CHILD leaves the grandchild running - the group kill is what saves it', async () => {
  const dir = mkdir();
  const pidFile = path.join(dir, 'grandchild.pid');
  try {
    const hang = write(dir, 'hang.test.mjs', HANG(pidFile));
    const o = collect();
    const { failures } = await runNestedGroup([hang], { cwd: dir, timeoutS: 2, killMode: 'child', out: o.stream, err: o.stream });
    assert.match(failures[0], /hang\.test\.mjs: ran 2 s: killed with its children/, 'it timed out all the same');
    const pid = Number(fs.readFileSync(pidFile, 'utf8'));
    assert.ok(alive(pid), 'the grandchild SURVIVED a child-only kill (this is what hung the suite)');
    process.kill(pid, 'SIGKILL');                                          // clean up the control's own straggler
    assert.ok(await until(() => !alive(pid)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- 2026-11-05-1186: the group runs several files at once on a calm machine ---------------------------------------------------------------------------------------------

const CALM = { load1: 1, cores: 8, swapUsedMb: 100, swapTotalMb: 4096 };
test('the concurrency choice (pure): calm = 3, strained by swap or by load = 1, the override wins over both, never more than there are files, junk overrides are ignored', () => {
  assert.equal(CALM_NESTED_CONCURRENCY, 3);
  assert.deepEqual(nestedConcurrency({ env: {}, machine: CALM, count: 10 }), { n: 3, why: 'the machine is calm' });
  assert.deepEqual(nestedConcurrency({ env: {}, machine: { ...CALM, swapUsedMb: 3900 }, count: 10 }), { n: 1, why: 'the machine is strained (swap)' });
  assert.deepEqual(nestedConcurrency({ env: {}, machine: { ...CALM, load1: 40 }, count: 10 }), { n: 1, why: 'the machine is strained (load)' });
  assert.equal(nestedConcurrency({ env: {}, machine: { ...CALM, load1: 40, swapUsedMb: 3900 }, count: 10 }).why, 'the machine is strained (swap and load)');
  assert.deepEqual(nestedConcurrency({ env: { FORGE_NESTED_CONCURRENCY: '2' }, machine: { ...CALM, load1: 40 }, count: 10 }), { n: 2, why: 'FORGE_NESTED_CONCURRENCY' }, 'the override beats strain');
  assert.equal(nestedConcurrency({ env: { FORGE_NESTED_CONCURRENCY: '1' }, machine: CALM, count: 10 }).n, 1, 'and calm');
  assert.equal(nestedConcurrency({ env: { FORGE_NESTED_CONCURRENCY: '8' }, machine: CALM, count: 3 }).n, 3, 'never more than there are files');
  assert.equal(nestedConcurrency({ env: {}, machine: CALM, count: 2 }).n, 2);
  assert.equal(nestedConcurrency({ env: {}, machine: CALM, count: 0 }).n, 1, 'at least one');
  for (const junk of ['abc', '0', '-2', '1.5', '']) assert.equal(nestedConcurrency({ env: { FORGE_NESTED_CONCURRENCY: junk }, machine: CALM, count: 10 }).n, 3, `"${junk}" is not an override`);
  assert.equal(nestedConcurrency({ env: {}, machine: {}, count: 10 }).n, 3, 'a machine that cannot be read is not called strained');
  assert.equal(nestedConcurrency({ env: {}, machine: null, count: 10 }).n, 3);
});

/** A nested file that waits (up to 1.5 s) until its twin has STARTED: it passes only when the two run at the same time. */
const RENDEZVOUS = (me, twin) => `import { spawnSync } from 'node:child_process'; import fs from 'node:fs'; import { test } from 'node:test'; import assert from 'node:assert/strict';
test('${me}', async () => {
  spawnSync(process.execPath, ['--test', '--version']);
  fs.writeFileSync('${me}.started', '1');
  console.log('MARK-${me}-1');
  const t0 = Date.now();
  while (!fs.existsSync('${twin}.started') && Date.now() - t0 < 1500) await new Promise((r) => setTimeout(r, 25));
  console.log('MARK-${me}-2');
  assert.ok(fs.existsSync('${twin}.started'), 'the twin never started while this one ran');
});
`;

test('THE POINT: with concurrency 2 two nested files really run AT THE SAME TIME (each waits for the other to have started) and each one\'s output reaches the stream as one block', async () => {
  const dir = mkdir();
  try {
    const files = [write(dir, 'a.test.mjs', RENDEZVOUS('a', 'b')), write(dir, 'b.test.mjs', RENDEZVOUS('b', 'a'))];
    const writes = [];
    const rec = { write: (c) => { writes.push(String(c)); return true; } };
    const { failures, results } = await runNestedGroup(files, { cwd: dir, timeoutS: 30, concurrency: 2, out: rec, err: rec });
    assert.deepEqual(failures, [], writes.join(''));
    assert.deepEqual(results.map((r) => r.file), files, 'the results keep the order of the files');
    assert.equal(writes.length, 2, `each file's output reached the stream as ONE piece (got ${writes.length} writes)`);
    for (const x of ['a', 'b']) assert.equal(writes.filter((w) => w.includes(`MARK-${x}-1`) && w.includes(`MARK-${x}-2`)).length, 1, `one piece holds all of ${x}'s output`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('CONTROL (the test can fail): the same two files at concurrency 1 cannot meet, and the group names them', async () => {
  const dir = mkdir();
  try {
    const files = [write(dir, 'a.test.mjs', RENDEZVOUS('a', 'b')), write(dir, 'b.test.mjs', RENDEZVOUS('b', 'a'))];
    const o = collect();
    const { failures } = await runNestedGroup(files, { cwd: dir, timeoutS: 30, concurrency: 1, out: o.stream, err: o.stream });
    assert.ok(failures.some((f) => /^a\.test\.mjs: 1 failing test/.test(f)), `the first file waited for a twin that had not started: ${failures.join(' | ')}`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('under concurrency 3 a failing file is still named and counted, the passing ones are green, and the order of the results is the order of the files', async () => {
  const dir = mkdir();
  try {
    const nested = (name, body) => write(dir, name, `import { spawnSync } from 'node:child_process'; import { test } from 'node:test';\nspawnSync(process.execPath, ['--test', '--version']);\ntest('${name}', () => { ${body} });\n`);
    const files = [nested('ok1.test.mjs', ''), nested('bad.test.mjs', "throw new Error('boom');"), nested('ok2.test.mjs', '')];
    const o = collect();
    const { failures, results } = await runNestedGroup(files, { cwd: dir, timeoutS: 30, concurrency: 3, out: o.stream, err: o.stream });
    assert.equal(failures.length, 1, failures.join(' | '));
    assert.match(failures[0], /^bad\.test\.mjs: 1 failing test/);
    assert.deepEqual(results.map((r) => r.file), files);
    assert.deepEqual(results.map((r) => r.summary.fail), [0, 1, 0]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('main says how many at a time and why, with the machine\'s readings; strained = one at a time, the override says so', async () => {
  const dir = mkdir();
  try {
    const nested = (name) => write(dir, name, `import { spawnSync } from 'node:child_process'; import { test } from 'node:test';\nspawnSync(process.execPath, ['--test', '--version']);\ntest('${name}', () => {});\n`);
    const files = [nested('n1.test.mjs'), nested('n2.test.mjs'), nested('n3.test.mjs'), nested('n4.test.mjs')];
    const run = async (env, machine) => { const o = collect(); const code = await main(files, { root: dir, out: o.stream, err: o.stream, env, machine }); return { code, text: o.text }; };
    const clean = { ...process.env }; delete clean.FORGE_NESTED_CONCURRENCY;
    const calm = await run(clean, CALM);
    assert.equal(calm.code, 0, calm.text);
    assert.match(calm.text, /ℹ nested-runner group: 3 at a time \(the machine is calm\); machine: load average 1\.0 \(8 cores\)/);
    assert.match(calm.text, /ℹ nested-runner group: 4 file\(s\), 3 at a time, each under 300 s: 4 ok, 0 failed/);
    const strained = await run(clean, { ...CALM, load1: 90 });
    assert.match(strained.text, /ℹ nested-runner group: 1 at a time \(the machine is strained \(load\)\)/);
    assert.match(strained.text, /4 file\(s\), one at a time, each under 300 s: 4 ok/);
    const forced = await run({ ...clean, FORGE_NESTED_CONCURRENCY: '2' }, { ...CALM, load1: 90 });
    assert.match(forced.text, /ℹ nested-runner group: 2 at a time \(FORGE_NESTED_CONCURRENCY\)/);
    for (const r of [calm, strained, forced]) assert.equal(parseSummary(r.text).tests, 4, 'one summed block, all four counted');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
