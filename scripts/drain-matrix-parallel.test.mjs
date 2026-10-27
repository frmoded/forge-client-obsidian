// drain 2026-10-26-1300 — the client legs of scripts/drain-matrix.sh run AT THE SAME TIME (music edition, lean edition and the forge pytest leg), proved by RUNNING the script against a scratch tree of seven tiny
// git repos whose forge-client-obsidian is a stub (its sync, gates, build and test steps are small node scripts that sleep and write timestamps), so what is pinned is the script's own behaviour: the legs
// overlap in time (and do not with --serial), each edition is built with its own FORGE_EDITION and its result is read from its own log, a failed step or failed/skipped tests in one leg turn the whole matrix RED
// (exit non-zero, the step named, the other leg still reported), and the worktrees (the second client worktree included) are gone afterwards. The forge leg's own rules are pinned by
// drain-matrix-forge-leg.test.mjs. Skipped (visibly) when forge/.venv is not there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPOS, SCRIPT, git, matrix, projects, skip, write } from './test-support/matrix-stubs.mjs';

// the ceiling the script ships with is READ from the script (2026-10-27-0900 lowered it 10 -> 7; a copy here went stale at once): the property is "the line reports the ceiling in force", not its spelling
const DEFAULT_CEILING = /FORGE_PYTEST_SKIP_MAX:-(\d+)/.exec(fs.readFileSync(new URL('./drain-matrix.sh', import.meta.url), 'utf8'))[1];
const mark = (p, name) => JSON.parse(fs.readFileSync(path.join(p.marks, `${name}.json`), 'utf8'));
const overlap = (a, b) => a.start < b.end && b.start < a.end;

test('the music edition, the lean edition and the forge pytest leg run AT THE SAME TIME, each built with its own edition, and every result is read from its own log', { skip }, () => {
  const p = projects();
  try {
    const r = matrix(p, ['--forge']);
    assert.equal(r.status, 0, r.out + r.err);
    const music = mark(p, 'music'), lean = mark(p, 'lean'), forge = mark(p, 'forge');
    assert.ok(overlap(music, lean), `music ${JSON.stringify(music)} and lean ${JSON.stringify(lean)} did not overlap: they ran one after the other`);
    assert.ok(overlap(music, forge) || overlap(lean, forge), 'the forge leg ran alone, after the client legs');
    assert.match(r.out, /== client legs: music and lean at the same time/);
    assert.match(r.out, /music: tests 3, pass 3, fail 0, skipped 0/);
    assert.match(r.out, /lean: tests 3, pass 3, fail 0, skipped 0/);
    assert.match(r.out, new RegExp(`forge: pytest tests/music: passed 1, failed 0, errors 0, skipped 0 \\(ceiling ${DEFAULT_CEILING}\\)`));
    assert.match(r.out, /Engine-bundle drift check: clean/);
    assert.match(r.out, /Bundled-vault bump check passed/);
    assert.match(r.out, /MATRIX GREEN: both editions, 0 failed, 0 skipped, forge pytest green/);
    assert.match(r.out, /lean\/forge-client-obsidian|worktrees in/, 'the worktree step ran');
    // nothing left behind: no matrix directory, no registered worktree of any repo but the main checkout
    assert.deepEqual(fs.readdirSync(p.dir).filter((n) => n.startsWith('drain-matrix.')), []);
    for (const repo of REPOS) assert.equal(git(path.join(p.dir, repo), 'worktree', 'list').trim().split('\n').length, 1, `${repo} still has a worktree`);
  } finally { p.done(); }
});

test('--serial runs the legs one after the other (the intervals do not overlap) and reaches the same green', { skip }, () => {
  const p = projects();
  try {
    const r = matrix(p, ['--forge', '--serial']);
    assert.equal(r.status, 0, r.out + r.err);
    const music = mark(p, 'music'), lean = mark(p, 'lean'), forge = mark(p, 'forge');
    assert.ok(!overlap(music, lean) && !overlap(music, forge) && !overlap(lean, forge), 'with --serial nothing may overlap');
    assert.match(r.out, /client legs, one after the other \(--serial\)/);
    assert.match(r.out, /MATRIX GREEN/);
  } finally { p.done(); }
});

test('a failed step in one leg turns the matrix RED naming the step and its log tail, and the other leg is still run and reported', { skip }, () => {
  const p = projects();
  try {
    const lean = matrix(p, ['--no-forge'], { FAIL_BUILD: 'lean' });
    assert.notEqual(lean.status, 0, lean.out + lean.err);
    assert.match(lean.err, /FAIL: lean: step 'build-lean' failed/);
    assert.match(lean.err, /the lean build is red on purpose/, 'the tail of the failing log is printed');
    assert.match(lean.out, /lean: step 'build-lean' FAILED/);
    assert.match(lean.out, /music: tests 3, pass 3, fail 0, skipped 0/, 'the music leg finished and is reported');
    assert.match(lean.err, /MATRIX RED/);
    assert.deepEqual(fs.readdirSync(p.dir).filter((n) => n.startsWith('drain-matrix.')), [], 'a red matrix cleans up too');
    const gates = matrix(p, ['--no-forge'], { FAIL_STEP: 'gates' });
    assert.notEqual(gates.status, 0, gates.out + gates.err);
    assert.match(gates.err, /FAIL: music: step 'gates' failed/);
    // `npm run build` runs the package's `prebuild` hook (the same gates) before every build, as in the real client, so a red gate stops the lean build as well; both are named
    assert.match(gates.out, /music: step 'gates' FAILED/);
    assert.match(gates.out, /lean: step 'build-lean' FAILED/);
  } finally { p.done(); }
});

test('failing tests and SKIPPED tests in one edition are each a RED matrix, per edition, with the other edition still green', { skip }, () => {
  const p = projects();
  try {
    const failing = matrix(p, ['--no-forge'], { FAIL_TESTS: 'music', TEST_MS: '300' });
    assert.notEqual(failing.status, 0, failing.out + failing.err);
    assert.match(failing.out, /music: tests 3, pass 2, fail 1, skipped 0/);
    assert.match(failing.out, /lean: tests 3, pass 3, fail 0, skipped 0/);
    assert.match(failing.err, /FAIL: music: 1 test\(s\) failed/);
    assert.match(failing.err, /the test that is broken on purpose/);
    const skipped = matrix(p, ['--no-forge'], { SKIP_TESTS: 'lean', TEST_MS: '300' });
    assert.notEqual(skipped.status, 0, skipped.out + skipped.err);
    assert.match(skipped.err, /FAIL: lean: 1 test\(s\) SKIPPED \(a skipped test is not a passing test\)/);
    assert.match(skipped.out, /music: tests 3, pass 3, fail 0, skipped 0/);
  } finally { p.done(); }
});

// 2026-10-27-0930: after the sync, the COMMITTED bundle (assets/vaults) must equal the source vaults. A vault drain that bumps a forge.toml commits the client sync in the same drain (cc-operating-card.md); the matrix says so when it does not.
test('the committed bundle lags the source vaults (the sync changes assets/vaults in the clean worktree): the matrix is RED naming the step "bundle-lag", the changed paths and the fix; an up-to-date bundle is green', { skip }, () => {
  const p = projects();
  try {
    const lag = matrix(p, ['--no-forge'], { LAG_BUNDLE: '1' });
    assert.notEqual(lag.status, 0, lag.out + lag.err);
    assert.match(lag.err, /FAIL: music: step 'bundle-lag' failed/);
    assert.match(lag.out + lag.err, /assets\/vaults\/x\/n\.md/, 'the changed path is printed');
    assert.match(lag.out + lag.err, /npm run sync-bundled-vaults/, 'and the fix');
    const ok = matrix(p, ['--no-forge']);
    assert.equal(ok.status, 0, ok.out + ok.err);
  } finally { p.done(); }
});

// 2026-10-27-0710 §4: after the engine sync, the two pinned engine fixtures must match the bundled engine. A stale one is RED naming the step "fixtures" and the ONE command that fixes it.
test('a stale pinned engine fixture: the matrix is RED naming the step "fixtures" and `npm run rerecord-engine-fixtures`; fresh fixtures are green', { skip }, () => {
  const p = projects();
  try {
    const stale = matrix(p, ['--no-forge'], { STALE_FIXTURES: '1' });
    assert.notEqual(stale.status, 0, stale.out + stale.err);
    assert.match(stale.err, /FAIL: music: step 'fixtures' failed/);
    assert.match(stale.out + stale.err, /npm run rerecord-engine-fixtures/, 'and the fix is named');
    const ok = matrix(p, ['--no-forge']);
    assert.equal(ok.status, 0, ok.out + ok.err);
  } finally { p.done(); }
});
