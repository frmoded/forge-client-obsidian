// 2026-11-19-0945 (item 3) - THE LOAD-SENSITIVE FILES. The process-hygiene tests of scripts/mutate-runner-orphans.test.mjs wait on kill timing: on a machine in heavy swap one of them goes red, and the same file passes 13 of 13 on a quiet one (measured: music 6414
// twice, once red at swap 10 to 14 GB, a 12 minute re-run). So (1) the files are LISTED in one place with a role (scripts/test-groups.mjs LOAD_SENSITIVE_FILES, both directions checked below); (2) scripts/run-tests.mjs can run ONLY them or everything BUT them
// (--load-sensitive=only|skip: the matrix runs them first, before the legs, then the legs without them); (3) when one of them fails while the machine is thrashing, the run does not say "failed" and does not say "passed": it says NEEDS A QUIET MACHINE,
// counts it apart (`ℹ needs-quiet-machine N`, `ℹ fail` stays what really failed) and exits 3. A failure on a calm machine, a failure of any OTHER file on a thrashing one, and a machine that cannot be read stay plain failures (the state can hide nothing but
// the load-sensitive files on a machine that is visibly in trouble). The matrix's side of it is in drain-matrix-hygiene.test.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { classifyNeedsQuiet, main, parseSummary } from './run-tests.mjs';
import { LOAD_SENSITIVE_FILES, isLoadSensitive, spawnsNestedRunner } from './test-groups.mjs';

const REPO = path.resolve(import.meta.dirname, '..');
const CALM = { load1: 1, cores: 8, swapUsedMb: 100, swapTotalMb: 8192, availableMb: 8192, freePercent: 60 };
const THRASHING = { ...CALM, swapUsedMb: 9600, swapTotalMb: 10240 };
const mkdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'needs-quiet-'));
const NESTED = (name, body) => `import { spawnSync } from 'node:child_process'; import { test } from 'node:test'; import assert from 'node:assert/strict';\nspawnSync(process.execPath, ['--test', '--version']);\ntest('${name}', () => { ${body} });\n`;
const collect = () => { let text = ''; return { stream: { write: (c) => { text += c; return true; } }, get text() { return text; } }; };
const run = async (dir, files, { machine, sensitive = ['slow.test.mjs'], flags = [] } = {}) => {
  const o = collect(); const env = { ...process.env, FORGE_NESTED_CONCURRENCY: '1' };
  const code = await main([...flags, ...files], { root: dir, out: o.stream, err: o.stream, env, machine, loadSensitive: sensitive });
  return { code, text: o.text, summary: parseSummary(o.text) };
};

// ---- the list (one file, a role, both directions) ---------------------------------------------------------------------------------------------------------------------------------
test('LOAD_SENSITIVE_FILES: a list in ONE place; every name is a real test file that runs a nested runner (the state is only applied to the nested group); the orphans file is on it; the other direction: a file not listed is not load-sensitive', () => {
  assert.ok(LOAD_SENSITIVE_FILES.includes('scripts/mutate-runner-orphans.test.mjs'), 'the file whose process-hygiene tests wait on kill timing');
  for (const f of LOAD_SENSITIVE_FILES) {
    assert.ok(fs.existsSync(path.join(REPO, f)), `${f} exists`);
    assert.ok(spawnsNestedRunner(fs.readFileSync(path.join(REPO, f), 'utf8')), `${f} runs a nested runner, so it is in the group the state applies to`);
    assert.equal(isLoadSensitive(f), true);
  }
  assert.equal(isLoadSensitive('scripts/run-tests.test.mjs'), false); assert.equal(isLoadSensitive('src/anything.test.ts'), false);
  assert.equal(isLoadSensitive('./scripts/mutate-runner-orphans.test.mjs'), true, 'a leading ./ is the same file');
  assert.equal(new Set(LOAD_SENSITIVE_FILES).size, LOAD_SENSITIVE_FILES.length, 'no duplicate');
});

// ---- the classification (pure), the whole truth table ------------------------------------------------------------------------------------------------------------------------------
test('classifyNeedsQuiet: a load-sensitive file that failed (or timed out, or printed no summary) on a THRASHING machine needs a quiet machine; everything else stays what it was', () => {
  const failed = { file: 'slow.test.mjs', failure: 'slow.test.mjs: 2 failing test(s)', summary: { tests: 13, pass: 11, fail: 2 } };
  const ok = { file: 'slow.test.mjs', failure: null, summary: { tests: 13, pass: 13, fail: 0 } };
  const other = { ...failed, file: 'other.test.mjs' };
  const yes = (r, machine, list = ['slow.test.mjs']) => classifyNeedsQuiet(r, { machine, loadSensitive: list });
  assert.deepEqual(yes(failed, THRASHING), { needsQuiet: true, count: 2, why: 'the machine is strained (swap)' });
  assert.equal(yes(failed, { ...CALM, load1: 40 }).why, 'the machine is strained (load)');
  assert.equal(yes(failed, { ...THRASHING, load1: 40 }).why, 'the machine is strained (swap and load)');
  assert.deepEqual(yes(failed, CALM), { needsQuiet: false }, 'a failure on a calm machine is a failure');
  assert.deepEqual(yes(other, THRASHING), { needsQuiet: false }, 'a file that is not on the list is never excused, whatever the machine');
  assert.deepEqual(yes(ok, THRASHING), { needsQuiet: false }, 'a pass is a pass');
  assert.deepEqual(yes(failed, {}), { needsQuiet: false }, 'a machine that cannot be read is not called thrashing');
  assert.deepEqual(yes(failed, null), { needsQuiet: false });
  assert.deepEqual(yes({ ...failed, summary: { tests: 1, fail: 1 }, failure: 'slow.test.mjs: ran 300 s: killed with its children' }, THRASHING), { needsQuiet: true, count: 1, why: 'the machine is strained (swap)' }, 'a timeout counts one');
  assert.deepEqual(yes({ ...failed, failure: 'slow.test.mjs: exited 1 and printed no summary (it did less than asked)', summary: { tests: 1, fail: 1 } }, THRASHING).count, 1);
  assert.deepEqual(yes(failed, THRASHING, []), { needsQuiet: false }, 'an empty list excuses nothing');
});

// ---- main, through real fixture files ----------------------------------------------------------------------------------------------------------------------------------------------
test('THE POINT: a load-sensitive file that fails on a thrashing machine is reported NEEDS A QUIET MACHINE: named, counted apart (fail stays 0), exit 3 (not 0, not 1), the other files still counted and green', async () => {
  const dir = mkdir();
  try {
    const files = ['ok.test.mjs', 'slow.test.mjs'].map((n) => { fs.writeFileSync(path.join(dir, n), NESTED(n, n === 'slow.test.mjs' ? 'assert.equal(1, 2, "timing");' : '')); return n; });
    const r = await run(dir, files, { machine: THRASHING });
    assert.equal(r.code, 3, r.text);
    assert.match(r.text, /⚠ NEEDS A QUIET MACHINE: slow\.test\.mjs: 1 test\(s\) failed while the machine was strained \(swap\)/);
    assert.match(r.text, /ℹ needs-quiet-machine 1/); assert.equal(r.summary.fail, 0, 'fail is what really failed'); assert.equal(r.summary.pass, 1, 'the other file is green and counted'); assert.equal(r.summary.tests, 2, 'nothing is dropped from the count');
    assert.doesNotMatch(r.text, /✖ slow\.test\.mjs: 1 failing test/, 'run-tests does not list it as a failure (the nested file\'s own TAP account of its failing test is still above)');
    assert.ok(r.text.lastIndexOf('ℹ needs-quiet-machine') > r.text.lastIndexOf('ℹ tests'), 'printed after the summary block the matrix reads');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('CONTROL (the state can be shown red): the SAME failing file on a CALM machine is a plain failure (exit 1, listed, no quiet-machine line); a failing file that is NOT listed on a thrashing machine is a failure too', async () => {
  const dir = mkdir();
  try {
    const files = ['ok.test.mjs', 'slow.test.mjs'].map((n) => { fs.writeFileSync(path.join(dir, n), NESTED(n, n === 'slow.test.mjs' ? 'assert.equal(1, 2, "timing");' : '')); return n; });
    const calm = await run(dir, files, { machine: CALM });
    assert.equal(calm.code, 1, calm.text); assert.match(calm.text, /✖ slow\.test\.mjs: 1 failing test\(s\)/); assert.doesNotMatch(calm.text, /needs-quiet-machine|NEEDS A QUIET MACHINE/); assert.equal(calm.summary.fail, 1);
    const unlisted = await run(dir, files, { machine: THRASHING, sensitive: [] });
    assert.equal(unlisted.code, 1, unlisted.text); assert.match(unlisted.text, /✖ slow\.test\.mjs/); assert.doesNotMatch(unlisted.text, /NEEDS A QUIET MACHINE/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('a real failure next to a needs-quiet file stays RED (exit 1): the state never hides a failure that is not its own; and a PASSING load-sensitive file on a thrashing machine is plain green (exit 0, no state line)', async () => {
  const dir = mkdir();
  try {
    const w = (n, body) => { fs.writeFileSync(path.join(dir, n), NESTED(n, body)); return n; };
    const both = await run(dir, [w('slow.test.mjs', 'assert.equal(1, 2);'), w('broken.test.mjs', 'assert.equal(1, 2);')], { machine: THRASHING });
    assert.equal(both.code, 1, both.text); assert.match(both.text, /✖ broken\.test\.mjs/); assert.match(both.text, /ℹ needs-quiet-machine 1/); assert.equal(both.summary.fail, 1);
    const green = await run(dir, [w('slow.test.mjs', ''), w('fine.test.mjs', '')], { machine: THRASHING });
    assert.equal(green.code, 0, green.text); assert.doesNotMatch(green.text, /needs-quiet-machine|NEEDS A QUIET MACHINE/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('--load-sensitive=only runs just the listed files, --load-sensitive=skip runs everything else, and the run says which (the flag is not handed to node --test)', async () => {
  const dir = mkdir();
  try {
    const w = (n) => { fs.writeFileSync(path.join(dir, n), NESTED(n, `console.log('RAN ${n}');`)); return n; };
    const files = [w('slow.test.mjs'), w('a.test.mjs'), w('b.test.mjs')];
    const only = await run(dir, files, { machine: CALM, flags: ['--load-sensitive=only'] });
    assert.equal(only.code, 0, only.text); assert.match(only.text, /RAN slow\.test\.mjs/); assert.doesNotMatch(only.text, /RAN a\.test|RAN b\.test/); assert.equal(only.summary.tests, 1);
    assert.match(only.text, /ℹ load-sensitive files only \(1 of 3\)/);
    const skip = await run(dir, files, { machine: CALM, flags: ['--load-sensitive=skip'] });
    assert.equal(skip.code, 0, skip.text); assert.doesNotMatch(skip.text, /RAN slow\.test/); assert.match(skip.text, /RAN a\.test/); assert.equal(skip.summary.tests, 2);
    assert.match(skip.text, /ℹ load-sensitive files skipped \(1 of 3\)/);
    const all = await run(dir, files, { machine: CALM }); assert.equal(all.summary.tests, 3, 'no flag: everything, as npm test always did'); assert.doesNotMatch(all.text, /load-sensitive files (only|skipped)/);
    const junk = await run(dir, files, { machine: CALM, flags: ['--load-sensitive=maybe'] }); assert.equal(junk.code, 1, 'an unknown value is refused, not ignored'); assert.match(junk.text, /--load-sensitive must be only or skip/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('the machine is read WHEN THE FILE FAILED, not when the group started: a machine that was calm at the start and thrashing when the file failed gives needs-quiet (the fixture makes the machine file thrash while it runs); the reverse stays a failure', async () => {
  const dir = mkdir();
  try {
    const machineFile = path.join(dir, 'machine.json');
    const w = (n, body) => { fs.writeFileSync(path.join(dir, n), NESTED(n, body)); return n; };
    const env = (extra = {}) => ({ ...process.env, FORGE_NESTED_CONCURRENCY: '1', FORGE_MACHINE_READ_FILE: machineFile, ...extra });
    const go = async (files) => { const o = collect(); const code = await main(files, { root: dir, out: o.stream, err: o.stream, env: env(), loadSensitive: ['slow.test.mjs'] }); return { code, text: o.text }; };
    fs.writeFileSync(machineFile, JSON.stringify(CALM));
    const heats = await go([w('slow.test.mjs', `import('node:fs').then((fs) => fs.writeFileSync(${JSON.stringify(machineFile)}, ${JSON.stringify(JSON.stringify(THRASHING))})); assert.equal(1, 2, 'timing');`)]);
    assert.equal(heats.code, 3, heats.text); assert.match(heats.text, /NEEDS A QUIET MACHINE: slow\.test\.mjs/);
    fs.writeFileSync(machineFile, JSON.stringify(THRASHING));
    const cools = await go([w('slow.test.mjs', `import('node:fs').then((fs) => fs.writeFileSync(${JSON.stringify(machineFile)}, ${JSON.stringify(JSON.stringify(CALM))})); assert.equal(1, 2, 'timing');`)]);
    assert.equal(cools.code, 1, 'thrashing at the start, calm when it failed: a plain failure'); assert.doesNotMatch(cools.text, /NEEDS A QUIET MACHINE/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
