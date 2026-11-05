// 2026-11-05-1184 - THE ONE RULE for which test files run a nested runner (scripts/test-groups.mjs): computed from what a file DOES, never a list. Proven on texts (what spawns what) and on THIS repo (the seven files the 1176 FEEDBACK names are in it,
// plain files are not, every test file is classified exactly once, and the group is a small part of the suite).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { defaultTestFiles, partitionTestFiles, spawnsNestedRunner, withoutLineComments } from './test-groups.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

test('a file that spawns node --test, the mutation runner, the matrix, the memory watcher or this runner is a nested runner', () => {
  assert.equal(spawnsNestedRunner("const r = spawnSync(process.execPath, ['--test', file]);"), true);
  assert.equal(spawnsNestedRunner("const CLI = path.join(S, 'dev', 'mutate.mjs'); spawnSync('node', [CLI, '--hand', h]);"), true);
  assert.equal(spawnsNestedRunner("spawn('bash', [path.join(here, 'drain-matrix.sh'), '--serial'])"), true);
  assert.equal(spawnsNestedRunner("execFileSync('node', ['scripts/dev/mem-watch.mjs', '--', 'node', '-e', hold])"), true);
  assert.equal(spawnsNestedRunner("spawn(process.execPath, ['scripts/run-tests.mjs', '--', f])"), true);
  assert.equal(spawnsNestedRunner("import { main } from './run-tests.mjs';"), true, 'importing the runner is enough: it is the spawn');
  assert.equal(spawnsNestedRunner("import { runInnerSuite } from './test-support/inner-suite-run.ts';"), true, 'the inner-suite helper is the spawn');
});

test('a file that only MENTIONS those names (a string, a comment, a fixture line) is not: a spawn and a runner are both needed', () => {
  assert.equal(spawnsNestedRunner("const sample = '  101     1   101   05:00 me  node --test /x/a.test.ts';"), false, 'a ps fixture');
  assert.equal(spawnsNestedRunner("spawnSync('git', ['status']);"), false, 'a spawn of something else');
  assert.equal(spawnsNestedRunner("// spawnSync('node', ['--test', f]) was the old way\nconst x = 1;"), false, 'a comment');
  assert.equal(spawnsNestedRunner("/* spawn('node', ['mutate.mjs']) */\nconst x = 1;"), false, 'a block comment');
  assert.equal(spawnsNestedRunner(''), false);
});

test('a glob string is never taken for a comment (it once swallowed a third of a file)', () => {
  const text = "const g = ':(glob)forge/**/*.py';\nspawnSync('bash', [path.join(d, 'drain-matrix.sh')]);\n";
  assert.equal(withoutLineComments(text), text, 'nothing removed');
  assert.equal(spawnsNestedRunner(text), true);
});

test('partitionTestFiles keeps each list in the order given and every file in exactly one', () => {
  const texts = { 'a.test.mjs': 'x', 'b.test.mjs': "spawnSync('node', ['--test', f])", 'c.test.mjs': 'y', 'd.test.mjs': "spawn('bash', ['drain-matrix.sh'])" };
  const { rest, nested } = partitionTestFiles(Object.keys(texts), (f) => texts[f]);
  assert.deepEqual(rest, ['a.test.mjs', 'c.test.mjs']);
  assert.deepEqual(nested, ['b.test.mjs', 'd.test.mjs']);
});

test('THE REAL REPO: the seven nested-runner files the 1176 FEEDBACK names are in the group; plain files are not; every test file is in exactly one list', () => {
  const files = defaultTestFiles(ROOT);
  const { rest, nested } = partitionTestFiles(files, (f) => fs.readFileSync(path.join(ROOT, f), 'utf8'));
  for (const f of ['scripts/mutate-runner.test.mjs', 'scripts/mutate-runner-orphans.test.mjs', 'scripts/mutate-runner-unsupervisable.test.mjs', 'scripts/drain-matrix-interrupt.test.mjs', 'scripts/drain-matrix-parallel.test.mjs', 'scripts/mem-watch.test.mjs', 'scripts/mutate-learned-cap.test.mjs']) {
    assert.ok(nested.includes(f), `${f} is a nested runner`);
  }
  for (const f of ['src/free-mode-core.test.ts', 'src/kit-core.test.ts', 'scripts/mem-core.test.mjs', 'scripts/machine-strain.test.mjs']) assert.ok(rest.includes(f), `${f} is a plain file`);
  // The rule reads TEXT, so a file that merely holds spawn fixtures in strings (this one) lands in the group: the safe side, a few milliseconds serially, never a nested runner missed.
  assert.ok(nested.includes('scripts/test-groups.test.mjs') || rest.includes('scripts/test-groups.test.mjs'), 'classified either way');
  assert.equal(rest.length + nested.length, files.length);
  assert.equal(new Set([...rest, ...nested]).size, files.length, 'no file twice');
  assert.ok(nested.length >= 7 && nested.length <= 30, `the group is a small part of the suite: ${nested.length} of ${files.length}`);
});

test('defaultTestFiles is what `npm test` always ran: src/*.test.ts then scripts/*.test.mjs, each sorted, as repo-relative paths', () => {
  const files = defaultTestFiles(ROOT);
  const src = fs.readdirSync(path.join(ROOT, 'src')).filter((n) => n.endsWith('.test.ts')).sort().map((n) => `src/${n}`);
  const scripts = fs.readdirSync(path.join(ROOT, 'scripts')).filter((n) => n.endsWith('.test.mjs')).sort().map((n) => `scripts/${n}`);
  assert.deepEqual(files, [...src, ...scripts]);
});

test('WIRING: `npm test` is the runner (pretest and posttest unchanged around it), the matrix\'s lean subset goes through the runner too, and the music leg still calls `npm test`', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.test, 'node scripts/run-tests.mjs');
  assert.equal(pkg.scripts.pretest, 'node scripts/test-preflight.mjs');
  const m = fs.readFileSync(path.join(ROOT, 'scripts/drain-matrix.sh'), 'utf8');
  assert.match(m, /node scripts\/run-tests\.mjs --test-concurrency="\$\{FILE_CONC:-8\}" \$subset/, 'the lean subset runs through the runner');
  assert.ok(!/node --test --test-concurrency/.test(m), 'no leg runs a bare `node --test` any more');
  assert.match(m, /npm test -- --test-concurrency/, 'the music leg (and a lean leg with no scan) still runs `npm test`');
});
