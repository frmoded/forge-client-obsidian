// 2026-11-19-0945 (item 3) - the matrix runs the LOAD-SENSITIVE files (scripts/test-groups.mjs LOAD_SENSITIVE_FILES: the process-hygiene tests that wait on kill timing) FIRST, before the legs start, and the legs run without them (--load-sensitive=skip); when
// they say "needs a quiet machine" (scripts/run-tests.mjs: a failure while the machine is thrashing) the matrix says so in its summary and its verdict and exits 3 (NOT green: exit 0, and not red: exit 1), after the legs were run and reported, and
// `--quiet-only` is the small re-run (hygiene only, no legs) for the day the machine is quiet. A plain hygiene failure (a calm machine) is RED. Proved by RUNNING the real script against the stub projects of test-support/matrix-stubs.mjs (the stub of
// run-tests.mjs answers as HYGIENE says). The real runner's side of it is pinned in run-tests-needs-quiet.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { matrix, projects, skip } from './test-support/matrix-stubs.mjs';

const mark = (p, name) => JSON.parse(fs.readFileSync(path.join(p.marks, `${name}.json`), 'utf8'));
const has = (p, name) => fs.existsSync(path.join(p.marks, `${name}.json`));

test('the hygiene files run FIRST: before either leg starts, with --load-sensitive=only; the legs are told --load-sensitive=skip; green is exit 0 and says the hygiene step passed', { skip }, () => {
  const p = projects();
  try {
    const r = matrix(p, ['--no-forge']);
    assert.equal(r.status, 0, r.out + r.err);
    const h = mark(p, 'hygiene'), music = mark(p, 'music'), lean = mark(p, 'lean');
    assert.ok(h.end <= music.start && h.end <= lean.start, `the hygiene step ended before the legs started: ${JSON.stringify({ h, music: music.start, lean: lean.start })}`);
    assert.deepEqual(h.argv, ['--load-sensitive=only']);
    for (const leg of [music, lean]) assert.ok(leg.argv.includes('--load-sensitive=skip'), `a leg is told to skip them: ${JSON.stringify(leg.argv)}`);
    assert.match(r.out, /== hygiene first/); assert.match(r.out, /hygiene \(before the legs\): tests 13, pass 13, fail 0/);
    assert.match(r.out, /MATRIX GREEN: both editions, 0 failed, 0 skipped/);
  } finally { p.done(); }
});

test('THE STATE: "needs a quiet machine" from the hygiene step is named in the summary, the legs STILL run and are reported, the verdict is neither GREEN nor RED, the exit is 3 and the one-line re-run is printed', { skip }, () => {
  const p = projects();
  try {
    const r = matrix(p, ['--no-forge'], { HYGIENE: 'quiet' });
    assert.equal(r.status, 3, r.out + r.err);
    assert.match(r.out, /NEEDS A QUIET MACHINE: scripts\/mutate-runner-orphans\.test\.mjs: 1 test\(s\) failed while the machine was strained \(swap\)/);
    assert.match(r.out, /hygiene \(before the legs\): NEEDS A QUIET MACHINE \(1 test\(s\)\)/);
    assert.match(r.out, /music: tests 3, pass 3, fail 0, skipped 0/); assert.match(r.out, /lean: tests 3, pass 3, fail 0, skipped 0/, 'both legs ran and were read');
    assert.doesNotMatch(r.out, /MATRIX GREEN/, 'not a green'); assert.doesNotMatch(r.err + r.out, /MATRIX RED/, 'not a red');
    assert.match(r.out, /MATRIX NEEDS A QUIET MACHINE: the legs are green; 1 hygiene test\(s\) must be run on a quiet machine: bash scripts\/drain-matrix\.sh --quiet-only/);
  } finally { p.done(); }
});

test('CONTROL: a PLAIN hygiene failure (the real runner only says "quiet" on a thrashing machine) is RED, exit 1; a hygiene run that prints no summary is RED; a real red leg beside a needs-quiet hygiene step is RED, not 3', { skip }, () => {
  const p = projects();
  try {
    const red = matrix(p, ['--no-forge'], { HYGIENE: 'fail' }); assert.equal(red.status, 1, red.out + red.err); assert.match(red.out + red.err, /hygiene: 1 test\(s\) failed/); assert.match(red.out + red.err, /MATRIX RED/); assert.doesNotMatch(red.out, /NEEDS A QUIET/);
    const none = matrix(p, ['--no-forge'], { HYGIENE: 'nosummary' }); assert.equal(none.status, 1); assert.match(none.out + none.err, /hygiene: .*no summary/);
    const both = matrix(p, ['--no-forge'], { HYGIENE: 'quiet', FAIL_TESTS: 'lean' }); assert.equal(both.status, 1, both.out + both.err); assert.match(both.out + both.err, /MATRIX RED/); assert.match(both.out, /NEEDS A QUIET MACHINE/, 'still said, next to the red');
  } finally { p.done(); }
});

test('--quiet-only runs ONLY the hygiene step (no leg, no build): green = exit 0 "HYGIENE GREEN", still quiet = exit 3, a plain failure = exit 1; nothing is left behind', { skip }, () => {
  const p = projects();
  try {
    const ok = matrix(p, ['--quiet-only']); assert.equal(ok.status, 0, ok.out + ok.err); assert.ok(has(p, 'hygiene')); assert.ok(!has(p, 'music') && !has(p, 'lean'), 'no leg ran');
    assert.match(ok.out, /HYGIENE GREEN \(--quiet-only: the legs were not run\)/); assert.doesNotMatch(ok.out, /MATRIX GREEN/);
    const still = matrix(p, ['--quiet-only'], { HYGIENE: 'quiet' }); assert.equal(still.status, 3, still.out + still.err); assert.match(still.out, /STILL NEEDS A QUIET MACHINE/);
    const bad = matrix(p, ['--quiet-only'], { HYGIENE: 'fail' }); assert.equal(bad.status, 1);
    assert.deepEqual(fs.readdirSync(p.dir).filter((n) => n.startsWith('drain-matrix.')), []);
  } finally { p.done(); }
});
