// 2026-11-20-1001z - FORGE_MATRIX_FILE_CONC: the files ONE matrix leg runs at once can be set directly (the supervisor decides after the measurements whether the default 8 becomes 4; until then the number is only made easy to set). The matrix reads it
// from `scripts/dev/mem-plan.mjs matrix-files`; the override WINS over the FORGE_MEM_BUDGET_MB / FORGE_MATRIX_FILE_MB calculation, and anything that is not a whole number from 1 is ignored. Light: pure functions and two tiny node runs; nothing here starts a matrix.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { matrixFileConcOverride, plan, MATRIX_FILES_DEFAULT_MAX } from './dev/mem-plan.mjs';

const PLAN = path.resolve(import.meta.dirname, 'dev', 'mem-plan.mjs');
const GIB = 1024 ** 3;

test('the override: a whole number from 1 wins over the budget; empty, 0, negative, fractional and words are ignored (null)', () => {
  assert.equal(matrixFileConcOverride({ FORGE_MATRIX_FILE_CONC: '4' }), 4);
  assert.equal(matrixFileConcOverride({ FORGE_MATRIX_FILE_CONC: '1' }), 1);
  assert.equal(matrixFileConcOverride({ FORGE_MATRIX_FILE_CONC: ' 6 ' }), 6);
  for (const junk of ['', ' ', '0', '-3', '2.5', 'abc', '4x']) assert.equal(matrixFileConcOverride({ FORGE_MATRIX_FILE_CONC: junk }), null, `"${junk}"`);
  assert.equal(matrixFileConcOverride({}), null);
});

test('plan(): the override replaces the computed number whatever the budget says (a huge budget, a tiny one), and without it the number is the budget\'s as before', () => {
  const env = (extra) => ({ FORGE_MEM_BUDGET_MB: '24000', FORGE_MATRIX_FILE_MB: '600', ...extra });
  const computed = plan(env({}), 24 * GIB, 16, 2, 8000).matrixFiles;
  assert.equal(computed, 4, '2026-11-20-1001z (deliberate): the budget allows min(cores - 1, 24000 / 600 / 2 = 20) = 15 files per leg, and the default is capped at MATRIX_FILES_DEFAULT_MAX = 4');
  assert.equal(MATRIX_FILES_DEFAULT_MAX, 4);
  assert.equal(plan(env({ FORGE_MATRIX_FILE_CONC: '4' }), 24 * GIB, 16, 2, 8000).matrixFiles, 4, 'lower than the budget allows');
  assert.equal(plan({ FORGE_MEM_BUDGET_MB: '1200', FORGE_MATRIX_FILE_MB: '600', FORGE_MATRIX_FILE_CONC: '12' }, 24 * GIB, 16, 2, 8000).matrixFiles, 12, 'higher than a tiny budget allows: the override is the person\'s word');
  assert.equal(plan(env({ FORGE_MATRIX_FILE_CONC: 'junk' }), 24 * GIB, 16, 2, 8000).matrixFiles, computed, 'junk falls back to the calculation');
});

test('the CLI the matrix calls: `matrix-files` prints just the number, the override wins; the plain line says where the number came from', () => {
  const run = (extra, ...args) => { const e = { ...process.env, FORGE_MEM_READ_FILE: '', ...extra }; delete e.NODE_TEST_CONTEXT; return spawnSync(process.execPath, [PLAN, ...args], { encoding: 'utf8', env: e }); };
  assert.equal(run({ FORGE_MATRIX_FILE_CONC: '3' }, 'matrix-files', '--legs', '2').stdout, '3\n');
  assert.equal(run({ FORGE_MATRIX_FILE_CONC: '3' }, 'matrix-files', '--legs', '1').stdout, '3\n', 'one leg (--serial): the same');
  const computed = run({ FORGE_MATRIX_FILE_CONC: '' }, 'matrix-files', '--legs', '2').stdout.trim();
  assert.match(computed, /^[1-9]\d*$/); assert.ok(Number(computed) <= 4, `the default never exceeds 4: ${computed}`);
  assert.match(run({ FORGE_MATRIX_FILE_CONC: '5' }).stdout, /matrix: 5 test files per leg with 2 legs \(set by FORGE_MATRIX_FILE_CONC\)/);
  assert.match(run({ FORGE_MATRIX_FILE_CONC: '' }).stdout, /FORGE_MATRIX_FILE_MB; FORGE_MATRIX_FILE_CONC sets it outright\)/);
});

test('the matrix script documents it in its header and falls back to it if mem-plan cannot run', () => {
  const m = fs.readFileSync(path.join(import.meta.dirname, 'drain-matrix.sh'), 'utf8');
  assert.match(m, /^#\s+FORGE_MATRIX_FILE_CONC=4\s+# 2026-11-20-1001z/m);
  assert.match(m, /FILE_CONC="\$\(node "\$SCRIPT_DIR\/dev\/mem-plan\.mjs" matrix-files --legs "\$LEGS_AT_ONCE" 2>\/dev\/null \|\| echo "\$\{FORGE_MATRIX_FILE_CONC:-8\}"\)"/);
  assert.match(m, /--test-concurrency="\$\{FILE_CONC:-8\}"/, 'the legs still take the number from FILE_CONC (the default 8 is unchanged)');
});
