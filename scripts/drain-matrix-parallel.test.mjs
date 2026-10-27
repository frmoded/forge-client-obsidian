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

// the ceiling the script ships with is READ from the script (2026-10-27-0900 lowered it 10 -> 7; a copy here went stale at once): the property is "the line reports the ceiling in force", not its spelling
const DEFAULT_CEILING = /FORGE_PYTEST_SKIP_MAX:-(\d+)/.exec(fs.readFileSync(new URL('./drain-matrix.sh', import.meta.url), 'utf8'))[1];
const SCRIPT = path.resolve(import.meta.dirname, 'drain-matrix.sh');
const REAL_VENV = path.join(os.homedir(), 'projects', 'forge', '.venv');
const skip = fs.existsSync(path.join(REAL_VENV, 'bin', 'python')) ? false : 'forge/.venv is not there (the matrix needs the engine\'s Python env)';
const REPOS = ['forge-client-obsidian', 'music-theory', 'forge-tutorial', 'forge-moda', 'music-core', 'forge', 'music-playground'];

const git = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
};
const write = (root, rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };

// the stubs: what the matrix runs in a client worktree, reduced to its observable shape
const STUBS = {
  'package.json': JSON.stringify({ name: 'fake-client', scripts: { prebuild: 'node scripts/gates.mjs', build: 'node scripts/build.mjs', test: 'node scripts/test.mjs' } }),
  '.gitignore': 'node_modules\nassets/wheels\n.edition\n',
  'scripts/sync-bundled-vault.mjs': [
    "import fs from 'node:fs';",
    "if (process.env.LAG_BUNDLE) { fs.mkdirSync('assets/vaults/x', { recursive: true }); fs.writeFileSync('assets/vaults/x/n.md', 'the source vault moved on'); }",   // the sync CHANGES the committed bundle = the bundle lags the sources
  ].join('\n') + '\n',
  'scripts/sync-engine-bundle.mjs': 'process.exit(0);\n',
  'scripts/check-engine-fixtures.mjs': [
    "if (process.env.STALE_FIXTURES) { console.error('STALE: shipped-notes.json: recorded against another engine bundle'); console.error('check-engine-fixtures: 1 pinned engine fixture(s) stale. Fix: npm run rerecord-engine-fixtures'); process.exit(1); }",
    "console.log('check-engine-fixtures: ok (stub)');",
  ].join('\n') + '\n',
  'scripts/check-bundled-vault-bump.mjs': "console.log('✓ Bundled-vault bump check passed (stub)');\n",
  'scripts/gates.mjs': [
    "if (process.env.FAIL_STEP === 'gates') { console.error('the gates are red on purpose'); process.exit(1); }",
    "console.log('Engine-bundle drift check: clean (stub)'); console.log('check-bundled-description-hashes: ok'); console.log('check-open-time-writes: ok');",
  ].join('\n'),
  'scripts/build.mjs': [
    "import fs from 'node:fs';",
    "const ed = process.env.FORGE_EDITION;",
    "if (process.env.FAIL_BUILD === ed) { console.error(`the ${ed} build is red on purpose`); process.exit(1); }",
    "fs.writeFileSync('.edition', ed);",
  ].join('\n'),
  'scripts/test.mjs': [
    "import fs from 'node:fs';",
    "const ed = fs.readFileSync('.edition', 'utf8').trim();",
    "const start = Date.now();",
    "await new Promise((r) => setTimeout(r, Number(process.env.TEST_MS ?? 1500)));",
    "fs.writeFileSync(`${process.env.MARKS}/${ed}.json`, JSON.stringify({ start, end: Date.now() }));",
    "const fail = process.env.FAIL_TESTS === ed ? 1 : 0, skipped = process.env.SKIP_TESTS === ed ? 1 : 0;",
    "console.log(`ℹ tests 3\\nℹ suites 0\\nℹ pass ${3 - fail - skipped}\\nℹ fail ${fail}\\nℹ cancelled 0\\nℹ skipped ${skipped}`);",
    "if (fail) { console.log('✖ the test that is broken on purpose'); process.exit(1); }",
  ].join('\n'),
};
const FORGE_TEST = [
  'import json, os, time',
  'def test_a():',
  '    start = time.time() * 1000',
  '    time.sleep(1.5)',
  "    open(os.path.join(os.environ['MARKS'], 'forge.json'), 'w').write(json.dumps({'start': start, 'end': time.time() * 1000}))",
].join('\n') + '\n';

function projects() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-parallel-'));
  const marks = path.join(dir, 'marks');
  fs.mkdirSync(marks);
  for (const r of REPOS) {
    const root = path.join(dir, r);
    fs.mkdirSync(root);
    git(root, 'init', '-q', '-b', 'main');
    write(root, 'README.md', `# ${r}\n`);
    if (r === 'forge') { write(root, 'forge/__init__.py', ''); write(root, 'tests/music/test_a.py', FORGE_TEST); write(root, '.gitignore', '.venv\n'); }
    if (r === 'forge-client-obsidian') for (const [f, t] of Object.entries(STUBS)) write(root, f, t);
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'init');
  }
  const client = path.join(dir, 'forge-client-obsidian');
  fs.mkdirSync(path.join(client, 'node_modules'));                              // untracked: the matrix links them into its worktrees
  fs.mkdirSync(path.join(client, 'assets', 'wheels'), { recursive: true });
  for (let i = 0; i < 11; i++) fs.writeFileSync(path.join(client, 'assets', 'wheels', `w${i}.whl`), '');
  fs.symlinkSync(REAL_VENV, path.join(dir, 'forge', '.venv'));
  return { dir, marks, client, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

function matrix(p, args = [], env = {}) {
  const r = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8', timeout: 240_000,
    env: { ...process.env, PROJECTS: p.dir, TMPDIR: p.dir, LOGKEEP: p.dir, MARKS: p.marks, ...env },
  });
  const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
  return { status: r.status, out: strip(r.stdout ?? ''), err: strip(r.stderr ?? '') };
}
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
