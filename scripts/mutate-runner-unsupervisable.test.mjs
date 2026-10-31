// 2026-10-31-0800 - the runner refuses to mutate the two files that supervise it: scripts/dev/reaper.mjs and scripts/dev/proc-tree.mjs. Measured on 2026-10-30: 62 spinning mutated copies of reaper.mjs, left behind by hand mutants of the
// reaper, held the load average near 50 even with --timeout, because the supervisor that would have killed them was the thing under mutation. So: `--hand`, `--file` (and a `--diff` that touches them) never mutate these two files, the
// refusal is ONE sentence that says why and what to do instead, it comes BEFORE anything is started (no scratch directory, no test process), and any other file still mutates (the control: the refusal is not a runner that refuses everything).
// Runs the real CLI on a tiny fixture project; its temp dir is private to each test (TMPDIR points into it), so nothing here looks at anything that is not its own.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { UNSUPERVISABLE, unsupervisable, unsupervisableSentence } from './dev/mutate-core.mjs';

const REPO = path.resolve(import.meta.dirname, '..');
const RUNNER = path.join(REPO, 'scripts', 'dev', 'mutate.mjs');

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mutate-unsup-'));
  for (const d of ['src', 'tmp', 'scripts/dev']) fs.mkdirSync(path.join(dir, d), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"fix","type":"module"}');
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{"compilerOptions":{"target":"es2022","module":"esnext","moduleResolution":"bundler","allowImportingTsExtensions":true,"noEmit":true,"strict":true}}');
  fs.writeFileSync(path.join(dir, 'src', 'a.ts'), 'export const f = (): number => 1;\n');
  fs.writeFileSync(path.join(dir, 'src', 'a.test.ts'), "import assert from 'node:assert/strict';\nimport { test } from 'node:test';\nimport { f } from './a.ts';\ntest('f is 1', () => { assert.equal(f(), 1); });\n");
  fs.writeFileSync(path.join(dir, 'scripts/dev/reaper.mjs'), 'export const reaper = () => 1;\n');
  fs.writeFileSync(path.join(dir, 'scripts/dev/proc-tree.mjs'), 'export const killTree = () => 1;\n');
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(dir, 'node_modules'));
  return dir;
}
const hand = (dir, rows) => { const f = path.join(dir, 'hand.json'); fs.writeFileSync(f, JSON.stringify(rows)); return f; };
const run = (dir, ...args) => spawnSync(process.execPath, [RUNNER, '--root', dir, '--jobs', '2', ...args], { encoding: 'utf8', timeout: 120_000, env: { ...process.env, TMPDIR: path.join(dir, 'tmp') } });
const SENTENCE = (file) => `mutate: ${file} is not mutated by this runner: the runner cannot supervise the thing that supervises it. Use a hand copy outside the repo, and check that \`ps -Ao pid,command | grep forge-mutate-\` is empty afterwards.`;
const nothingStarted = (dir, r) => {
  assert.equal(fs.readdirSync(path.join(dir, 'tmp')).length, 0, 'no scratch directory was made (nothing was started)');
  assert.ok(!/\[\d+\/\d+\]/.test(r.stdout + r.stderr), 'no mutant was run');
};

test('--hand naming the reaper or the process-tree helper is refused outright: exit 2, the one sentence, nothing started', () => {
  for (const file of ['scripts/dev/reaper.mjs', 'scripts/dev/proc-tree.mjs']) {
    const dir = fixture();
    try {
      const r = run(dir, '--hand', hand(dir, [[file, 'x', 'export const', 'export var', ['src/a.test.ts']]]), '--no-fail');
      assert.equal(r.status, 2, `${file}: exit status (--no-fail does not soften a refusal)`);
      assert.equal(r.stderr.trim(), SENTENCE(file));
      nothingStarted(dir, r);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
});

test('the refusal does not depend on how the file is spelled (./ prefix, an absolute path, the object form of a hand mutant) and one refused file refuses the WHOLE list, the allowed mutants included', () => {
  for (const spelling of [(d) => './scripts/dev/reaper.mjs', (d) => path.join(d, 'scripts/dev/reaper.mjs'), (d) => 'scripts/dev//reaper.mjs']) {
    const dir = fixture();
    try {
      const f = hand(dir, [{ file: 'src/a.ts', name: 'ok', from: 'return', to: 'return', tests: ['src/a.test.ts'] }, { file: spelling(dir), name: 'sup', from: 'export const', to: 'export var', tests: ['src/a.test.ts'] }]);
      const r = run(dir, '--hand', f, '--no-fail');
      assert.equal(r.status, 2, spelling(dir));
      assert.equal(r.stderr.trim(), SENTENCE('scripts/dev/reaper.mjs'), 'the sentence names the project-relative file');
      nothingStarted(dir, r);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
});

test('--file on either of them is refused the same way', () => {
  for (const file of ['scripts/dev/reaper.mjs', 'scripts/dev/proc-tree.mjs']) {
    const dir = fixture();
    try {
      const r = run(dir, '--file', file, '--no-fail');
      assert.equal(r.status, 2, file);
      assert.equal(r.stderr.trim(), SENTENCE(file));
      nothingStarted(dir, r);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
});

test('CONTROL: another file still mutates - a hand mutant of src/a.ts runs and is killed by its test (so the refusal is about these two files, not about the runner)', () => {
  const dir = fixture();
  try {
    const r = run(dir, '--hand', hand(dir, [['src/a.ts', 'one-to-two', '=> 1;', '=> 2;', ['src/a.test.ts']]]), '--no-fail');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /killed/);
    assert.match(r.stdout, /generated 1 \| killed 1 /);
    assert.ok(!/cannot supervise/.test(r.stdout + r.stderr));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a --diff that touches them leaves their lines out (and says so), while the changed lines of another file are still listed', () => {
  const dir = fixture();
  try {
    const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
    fs.writeFileSync(path.join(dir, 'scripts', 'note.txt'), 'one\n');
    git('init', '-q'); git('add', '-A'); git('commit', '-q', '-m', 'base');
    fs.writeFileSync(path.join(dir, 'scripts', 'note.txt'), 'two\n');                                                      // a changed file the runner has no text for, and a changed TEST: neither is a source to mutate
    fs.appendFileSync(path.join(dir, 'src', 'a.test.ts'), 'export const touched = 1 + 1;\n');
    fs.writeFileSync(path.join(dir, 'src', 'a.ts'), 'export const f = (): number => 1 + 0;\n');
    fs.writeFileSync(path.join(dir, 'scripts/dev/reaper.mjs'), 'export const reaper = () => 1 + 0;\n');
    fs.writeFileSync(path.join(dir, 'scripts/dev/proc-tree.mjs'), 'export const killTree = () => 1 + 0;\n');
    const r = run(dir, '--diff', 'HEAD', '--list');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /src\/a\.ts:/, 'the allowed file is listed');
    assert.ok(!/a\.test\.ts:|note\.txt:/.test(r.stdout), 'a changed test and a changed non-source file are not seeded');
    assert.ok(!/scripts\/dev\/(reaper|proc-tree)\.mjs:/.test(r.stdout), 'neither of the two is listed');
    assert.match(r.stderr, /scripts\/dev\/reaper\.mjs/);
    assert.match(r.stderr, /scripts\/dev\/proc-tree\.mjs/);
    assert.match(r.stderr, /not mutated by this runner/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the predicate itself: exactly the two files, in any spelling; their near-namesakes are fine', () => {
  assert.deepEqual([...UNSUPERVISABLE].sort(), ['scripts/dev/proc-tree.mjs', 'scripts/dev/reaper.mjs']);
  for (const f of ['scripts/dev/reaper.mjs', './scripts/dev/reaper.mjs', 'scripts//dev/reaper.mjs', 'scripts/dev/proc-tree.mjs']) assert.equal(unsupervisable(f, REPO), true, f);
  assert.equal(unsupervisable(path.join(REPO, 'scripts/dev/reaper.mjs'), REPO), true, 'absolute, inside the project');
  for (const f of ['scripts/dev/reaper.test.mjs', 'scripts/reaper.test.mjs', 'scripts/dev/mutate.mjs', 'src/reaper.mjs', 'scripts/dev/reaper.mjs.bak', 'scripts/dev/Reaper.mjs']) assert.equal(unsupervisable(f, REPO), false, f);
  assert.equal(unsupervisableSentence('scripts/dev/reaper.mjs'), SENTENCE('scripts/dev/reaper.mjs'));
});
