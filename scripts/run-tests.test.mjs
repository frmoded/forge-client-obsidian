// 2026-11-05-1184 - scripts/run-tests.mjs: `npm test` runs the nested-runner files AFTER the rest, ONE AT A TIME, each in its own process group under a hard timeout. Proven on fixture test files in a scratch directory (never the
// repo's own suite): the order, the summed summary the matrix reads (the LAST ℹ lines), a file that crashes, and - the point - a test whose GRANDCHILD holds the pipe and never ends: the group timeout kills the whole tree, names
// the file, and the run CONTINUES with the next one. The control shows what a kill of only the child would have left running. This file imports the runner, so scripts/test-groups.mjs puts it in the group too.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { main, parseSummary, runNestedGroup } from './run-tests.mjs';

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
    const code = await main(files, { root: dir, out: o.stream, err: o.stream });
    assert.equal(code, 0, o.text);
    const at = (m) => o.text.indexOf(`RAN ${m}`);
    assert.ok(at('a') >= 0 && at('c') >= 0 && at('n1') >= 0 && at('n2') >= 0, o.text);
    assert.ok(Math.max(at('a'), at('c')) < at('n1'), 'every plain file ran before the first nested one');
    assert.ok(at('n1') < at('n2'), 'and the nested ones in order');
    assert.match(o.text, /ℹ run-tests: 2 file\(s\) in one run, then 2 nested-runner file\(s\) one at a time, each under 300 s/);
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
    const code = await main(files, { root: dir, out: o.stream, err: o.stream });
    assert.equal(code, 1);
    assert.match(o.text, /✖ crash\.test\.mjs: 1 failing test\(s\)/, 'node reports a file that exits 3 as one failed test, and the group names the file');
    const last = parseSummary(o.text);
    assert.ok(last.fail >= 2, `both counted: ${JSON.stringify(last)}`);
    assert.match(o.text, /ℹ nested-runner group: 1 file\(s\), one at a time, each under 300 s: 0 ok, 1 failed/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('THE POINT: a test whose GRANDCHILD holds the pipe and never ends is killed WITH its children at the group timeout, named in one line, and the run goes on to the next file', async () => {
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
    const code = await main(files, { root: dir, out: o.stream, err: o.stream });
    const took = Date.now() - t0;
    assert.equal(code, 1, 'a hang is a failure');
    assert.match(o.text, /✖ hang\.test\.mjs: ran 2 s: killed with its children/);
    assert.match(o.text, /RAN after/, 'the run continued with the next nested file');
    assert.ok(took < 30_000, `it did not stall: ${took} ms`);
    const pid = Number(fs.readFileSync(pidFile, 'utf8'));
    assert.ok(pid > 0);
    assert.ok(await until(() => !alive(pid)), `the grandchild ${pid} is dead with its parent`);
    assert.match(o.text, /ℹ nested-runner group: 2 file\(s\), one at a time, each under 2 s: 1 ok, 1 failed/);
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
