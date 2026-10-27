// drain 2026-10-25-1030 — the forge-pytest leg of scripts/drain-matrix.sh, proved by RUNNING the script (`--forge-only`, so no client build) against a scratch tree of seven tiny git repos whose `forge` holds real pytest tests,
// run with the real forge/.venv's Python. What it pins: the leg tests the COMMITTED tree (an uncommitted fix does not turn a red HEAD green), a failing test makes the script exit non-zero and names the test, the
// automatic mode runs the leg only when the committed unpushed change touches forge/**/*.py or tests/**, --no-forge skips it, a pytest run that passes nothing or prints no summary is a failure (it did less than asked), and
// the skip ceiling (FORGE_PYTEST_SKIP_MAX) fails on MORE skips than the ratchet allows. Skipped (visibly) when forge/.venv is not there.
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
const commit = (root, message, ...files) => { git(root, 'add', '--', ...files); git(root, 'commit', '-q', '-m', message); };

const PASSING = 'def test_a():\n  assert True\n';
const FAILING = 'def test_a():\n  assert True\n\ndef test_breaks_on_purpose():\n  assert False, "broken on purpose"\n';

/** A scratch `projects` directory: seven tiny repos; `forge` has a package, tests/music/test_a.py, an origin it is pushed to, and the real venv linked in. */
function projects(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-forge-leg-'));
  for (const r of REPOS) {
    const root = path.join(dir, r);
    fs.mkdirSync(root);
    git(root, 'init', '-q', '-b', 'main');
    write(root, 'README.md', `# ${r}\n`);
    if (r === 'forge') {
      write(root, opts.packageAt ?? 'forge/__init__.py', '');
      write(root, 'forge/engine.py', 'VALUE = 1\n');
      write(root, 'tests/music/test_a.py', opts.testA ?? PASSING);
      write(root, '.gitignore', '.venv\n');
    }
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'init');
  }
  const forge = path.join(dir, 'forge');
  fs.symlinkSync(REAL_VENV, path.join(forge, '.venv'));
  const origin = path.join(dir, 'origin.git');
  git(dir, 'init', '-q', '--bare', '-b', 'main', origin);
  git(forge, 'remote', 'add', 'origin', origin);
  git(forge, 'push', '-q', '-u', 'origin', 'main');
  return { dir, forge, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

function matrix(p, args = [], env = {}) {
  const r = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8', timeout: 240_000,
    env: { ...process.env, PROJECTS: p.dir, TMPDIR: p.dir, LOGKEEP: p.dir, ...env },
  });
  const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
  return { status: r.status, out: strip(r.stdout ?? ''), err: strip(r.stderr ?? '') };
}

test('--forge-only on a green forge: the leg runs the committed tests, prints the totals and exits 0', { skip }, () => {
  const p = projects();
  try {
    const r = matrix(p, ['--forge-only']);
    assert.equal(r.status, 0, r.out + r.err);
    assert.match(r.out, /forge pytest: tests\/music \(forced by --forge\)/);
    assert.match(r.out, new RegExp(`forge: pytest tests/music: passed 1, failed 0, errors 0, skipped 0 \\(ceiling ${DEFAULT_CEILING}\\)`));
    assert.match(r.out, /FORGE LEG GREEN/);
  } finally { p.done(); }
});

test('a committed failing test turns the matrix RED (exit non-zero, the test is named); fixing it in a commit turns it green again', { skip }, () => {
  const p = projects();
  try {
    write(p.forge, 'tests/music/test_a.py', FAILING);
    commit(p.forge, 'break a test on purpose', 'tests/music/test_a.py');
    const red = matrix(p, ['--forge-only']);
    assert.notEqual(red.status, 0, red.out + red.err);
    assert.match(red.err, /FAIL: forge: 1 test\(s\) failed/);
    assert.match(red.err, /test_breaks_on_purpose/);
    assert.match(red.err, /MATRIX RED/);
    assert.match(red.out, /passed 1, failed 1/);
    write(p.forge, 'tests/music/test_a.py', PASSING);
    commit(p.forge, 'fix it', 'tests/music/test_a.py');
    const green = matrix(p, ['--forge-only']);
    assert.equal(green.status, 0, green.out + green.err);
    assert.match(green.out, /FORGE LEG GREEN/);
  } finally { p.done(); }
});

test('the leg tests the COMMITTED tree: an uncommitted fix in the main checkout does not turn a red HEAD green (and the matrix warns about it)', { skip }, () => {
  const p = projects();
  try {
    write(p.forge, 'tests/music/test_a.py', FAILING);
    commit(p.forge, 'break a test on purpose', 'tests/music/test_a.py');
    write(p.forge, 'tests/music/test_a.py', PASSING);          // the fix is only in the working tree
    const r = matrix(p, ['--forge-only']);
    assert.notEqual(r.status, 0, 'red: the committed state is what runs');
    assert.match(r.err, /WARN: forge has 1 uncommitted tracked change/);
    assert.match(r.err, /test_breaks_on_purpose/);
  } finally { p.done(); }
});

test('auto mode: the leg runs only when the committed, unpushed change touches forge/**/*.py or tests/** (and says why it ran or did not)', { skip }, () => {
  const p = projects();
  try {
    const auto = () => matrix(p, ['--forge-only', '--auto']);
    let r = auto();
    assert.equal(r.status, 0, r.out + r.err);
    assert.match(r.out, /forge pytest: not run \(no committed change under forge\/\*\*\/\*\.py or tests\/\*\* since origin\/main\)/, 'nothing changed');
    assert.doesNotMatch(r.out, /passed \d+/);
    assert.match(r.out, /FORGE LEG NOT RUN/);
    assert.doesNotMatch(r.out, /GREEN/, 'a leg that did not run is not green');
    write(p.forge, 'README.md', '# forge, edited\n'); commit(p.forge, 'docs only', 'README.md');
    r = auto();
    assert.match(r.out, /not run/, 'a README change is not forge Python');
    write(p.forge, 'forge/engine.py', 'VALUE = 2\n'); commit(p.forge, 'engine change', 'forge/engine.py');
    r = auto();
    assert.equal(r.status, 0, r.out + r.err);
    assert.match(r.out, /forge pytest: tests\/music \(forge changed 1 file\(s\) under forge\/\*\*\/\*\.py or tests\/\*\* since origin\/main\)/);
    assert.match(r.out, /passed 1/);
    git(p.forge, 'push', '-q', 'origin', 'main');
    r = auto();
    assert.match(r.out, /not run/, 'after the push there is nothing unpushed');
    write(p.forge, 'tests/music/test_b.py', PASSING); commit(p.forge, 'a new test', 'tests/music/test_b.py');
    r = auto();
    assert.match(r.out, /forge changed 1 file\(s\)/, 'a change under tests/** runs it too');
    assert.match(r.out, /passed 2/);
    git(p.forge, 'push', '-q', 'origin', 'main');
    write(p.forge, 'forge/sub/deep.py', 'DEEP = 1\n'); commit(p.forge, 'a nested module', 'forge/sub/deep.py');
    r = auto();
    assert.match(r.out, /forge changed 1 file\(s\)/, 'a nested forge/**/*.py runs it too');
  } finally { p.done(); }
});

test('auto mode with no origin/main to compare with cannot tell what changed, so the leg runs', { skip }, () => {
  const p = projects();
  try {
    git(p.forge, 'remote', 'remove', 'origin');
    const r = matrix(p, ['--forge-only', '--auto']);
    assert.equal(r.status, 0, r.out + r.err);
    assert.match(r.out, /forge has no origin\/main to compare with: cannot tell what changed, so it runs/);
    assert.match(r.out, /passed 1/);
  } finally { p.done(); }
});

test('--no-forge skips the leg even when forge changed and a committed test is red', { skip }, () => {
  const p = projects();
  try {
    write(p.forge, 'tests/music/test_a.py', FAILING);
    commit(p.forge, 'break a test on purpose', 'tests/music/test_a.py');
    const r = matrix(p, ['--forge-only', '--no-forge']);
    assert.equal(r.status, 0, 'nothing else ran, nothing failed');
    assert.match(r.out, /forge pytest: not run \(skipped by --no-forge\)/);
  } finally { p.done(); }
});

test('a pytest run that passes nothing, or whose package is not the worktree\'s own, is a failure (it did less than asked, or tested the wrong tree)', { skip }, () => {
  const none = projects({ testA: '# no tests in here\n' });
  try {
    const r = matrix(none, ['--forge-only']);
    assert.notEqual(r.status, 0, r.out + r.err);
    assert.match(r.err, /FAIL: forge: pytest passed no test at all/);
  } finally { none.done(); }
  const wrong = projects({ packageAt: 'src/forge/__init__.py' });      // `import forge` does not find the worktree's package: the venv's own (the main checkout) answers
  try {
    const r = matrix(wrong, ['--forge-only']);
    assert.notEqual(r.status, 0, r.out + r.err);
    assert.match(r.err, /FAIL: forge: the venv imports forge from .*, not from the committed worktree/);
    assert.match(r.out, /pytest NOT RUN \(wrong tree\)/);
  } finally { wrong.done(); }
});

test('the skip ceiling: as many skips as the ceiling pass, one more fails and its reasons are printed (a skipped test is not a passing test)', { skip }, () => {
  const skipping = 'import pytest\n\ndef test_a():\n  assert True\n\n@pytest.mark.parametrize("n", [1, 2, 3])\ndef test_needs_something_absent(n):\n  pytest.skip("forge-music not checked out beside forge")\n';
  const p = projects({ testA: skipping });
  try {
    const ok = matrix(p, ['--forge-only'], { FORGE_PYTEST_SKIP_MAX: '3' });
    assert.equal(ok.status, 0, ok.out + ok.err);
    assert.match(ok.out, /skipped 3 \(ceiling 3\)/);
    const over = matrix(p, ['--forge-only'], { FORGE_PYTEST_SKIP_MAX: '2' });
    assert.notEqual(over.status, 0, over.out + over.err);
    assert.match(over.err, /FAIL: forge: 3 test\(s\) SKIPPED, more than the ceiling of 2/);
    assert.match(over.err, /SKIPPED .*forge-music not checked out beside forge/);
  } finally { p.done(); }
});

test('a pytest run whose exit status is not 0 although nothing failed (an internal error, a usage error) is still a failure, said in its own words', { skip }, () => {
  const p = projects();
  try {
    write(p.forge, 'tests/conftest.py', 'def pytest_sessionfinish(session, exitstatus):\n  session.exitstatus = 3\n');
    commit(p.forge, 'a run that ends with an internal-error status', 'tests/conftest.py');
    const r = matrix(p, ['--forge-only']);
    assert.notEqual(r.status, 0, r.out + r.err);
    assert.match(r.err, /FAIL: forge: pytest exited 3 without a failure to name/);
  } finally { p.done(); }
});

test('an unknown option is refused before anything is built', { skip }, () => {
  const p = projects();
  try {
    const r = matrix(p, ['--forge-everything']);
    assert.equal(r.status, 2);
    assert.match(r.err, /unknown option: --forge-everything/);
  } finally { p.done(); }
});

test('auto mode looks at what THIS side added, not at what origin has that we lack: a commit pushed by someone else does not make the leg run', { skip }, () => {
  const p = projects();
  try {
    const other = path.join(p.dir, 'other-clone');
    git(p.dir, 'clone', '-q', path.join(p.dir, 'origin.git'), other);
    write(other, 'forge/engine.py', 'VALUE = 99\n');
    commit(other, 'someone else changes the engine', 'forge/engine.py');
    git(other, 'push', '-q', 'origin', 'main');
    git(p.forge, 'fetch', '-q', 'origin');                       // origin/main is now AHEAD of the local main; nothing of ours is unpushed
    const r = matrix(p, ['--forge-only', '--auto']);
    assert.equal(r.status, 0, r.out + r.err);
    assert.match(r.out, /forge pytest: not run \(no committed change/);
  } finally { p.done(); }
});

test('pytest that dies without a summary line, and a test file that cannot even be collected, are failures with their own words', { skip }, () => {
  const silent = projects();
  try {
    write(silent.forge, 'tests/conftest.py', 'import os\n\ndef pytest_sessionstart(session):\n  os._exit(0)\n');
    commit(silent.forge, 'a run that ends without saying anything', 'tests/conftest.py');
    const r = matrix(silent, ['--forge-only']);
    assert.notEqual(r.status, 0, r.out + r.err);
    assert.match(r.err, /FAIL: forge: pytest printed no summary line \(exit 0\): it did less than asked/);
    assert.match(r.out, /forge: pytest NO SUMMARY/);
  } finally { silent.done(); }
  const broken = projects();
  try {
    write(broken.forge, 'tests/music/test_broken.py', 'def test_x(:\n  pass\n');
    commit(broken.forge, 'a file that cannot be collected', 'tests/music/test_broken.py');
    const r = matrix(broken, ['--forge-only']);
    assert.notEqual(r.status, 0, r.out + r.err);
    assert.match(r.err, /FAIL: forge: 0 test\(s\) failed, 1 error\(s\)/);
    assert.match(r.err, /test_broken/);
  } finally { broken.done(); }
});
