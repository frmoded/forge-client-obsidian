// 2026-11-19-0915 - THE MATRIX RUNS A COPY OF ITSELF. Measured 2026-11-19 (the 0800 to 0900 batch): comments of scripts/drain-matrix.sh were edited WHILE a matrix was running it, and the matrix died with "syntax error near unexpected token `fi'": bash reads a script as it goes, so an
// edit that moves the bytes under a running shell makes it read the middle of a line. The script now copies itself to a temp file first and runs the COPY (FORGE_MATRIX_COPY, its own directory kept in FORGE_MATRIX_SCRIPT_DIR so the dev/ helpers are found), and removes the copy at the end.
// Proved by RUNNING the real script (a copy of scripts/ in a scratch directory, so the repo's own script is never touched) against the stub projects of the other matrix tests: a run that is in progress when the ORIGINAL is edited (8 KB inserted near the top, then a syntax
// error appended) finishes GREEN; the control (FORGE_MATRIX_SELF_COPY=off, the old behaviour) is hurt by the very same edit, so the test can fail; the temp copy is gone at the end, also after a refusal. Skipped (visibly) when forge/.venv is not there, like its siblings.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { CALM_MACHINE, SCRIPT, projects, powerEnv, skip } from './test-support/matrix-stubs.mjs';

const REAL_SCRIPTS = path.dirname(SCRIPT);
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
const copies = (dir) => fs.readdirSync(dir).filter((n) => n.startsWith('drain-matrix-copy.'));

/** Run a matrix from a scratch copy of scripts/ ; once its worktrees exist (the run is in progress) edit the ORIGINAL script; return how the run ended. */
async function runAndEdit(extraEnv) {
  const p = projects(); const scratch = path.join(fs.realpathSync(p.dir), 'scripts-copy');  /* the REAL path: heavy-lock.mjs decides it is the main module by comparing paths, and macOS's tmpdir is a symlink */ fs.cpSync(REAL_SCRIPTS, scratch, { recursive: true, filter: (s) => !/node_modules|\/scratch(\/|$)/.test(s) });
  const calm = path.join(p.dir, '.calm-machine.json'); fs.writeFileSync(calm, JSON.stringify(CALM_MACHINE));
  const script = path.join(scratch, 'drain-matrix.sh');
  const child = spawn('bash', [script, '--no-forge'], { cwd: p.client, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PROJECTS: p.dir, TMPDIR: p.dir, LOGKEEP: p.dir, MARKS: p.marks, TEST_MS: '3500', FORGE_MACHINE_READ_FILE: calm, ...powerEnv(p.dir), ...extraEnv } });
  let out = ''; child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { out += d; });
  const ended = new Promise((r) => child.on('close', (code) => r(code)));
  try {
    for (let i = 0; i < 600 && !fs.readdirSync(p.dir).some((n) => n.startsWith('drain-matrix.')); i++) await sleepMs(100);
    assert.ok(fs.readdirSync(p.dir).some((n) => n.startsWith('drain-matrix.')), `the run is in progress (its worktrees exist); output so far: ${out.slice(-500)}`);
    const text = fs.readFileSync(script, 'utf8'); const lines = text.split('\n');
    fs.writeFileSync(script, [lines[0], ...Array.from({ length: 300 }, (_, i) => `# an edit made while the matrix runs ${i} ${'x'.repeat(20)}`), ...lines.slice(1), 'if then fi done )', ''].join('\n'));
    const code = await ended;
    return { code, out: out.replace(/\x1b\[[0-9;]*m/g, ''), leftCopies: copies(p.dir), p };
  } finally { try { child.kill('SIGKILL'); } catch { /* ended */ } }
}

test('a matrix that is running survives an edit of the original script: it finishes GREEN, and its temp copy is removed at the end', { skip }, async () => {
  const r = await runAndEdit({});
  try {
    assert.equal(r.code, 0, r.out.slice(-600)); assert.match(r.out, /MATRIX GREEN/); assert.doesNotMatch(r.out, /syntax error/);
    assert.deepEqual(r.leftCopies, [], 'no copy of the script is left in the temp directory');
  } finally { r.p.done(); }
});

test('a matrix started INSIDE another matrix (this very test, run by the outer matrix: the outer one exports FORGE_MATRIX_COPY and FORGE_MATRIX_SCRIPT_DIR) still runs a copy of itself: "I am the copy" means FORGE_MATRIX_COPY is MY OWN path, not that the variable is set', { skip }, async () => {
  const r = await runAndEdit({ FORGE_MATRIX_COPY: '/tmp/a-copy-of-the-OUTER-matrix', FORGE_MATRIX_SCRIPT_DIR: '/nonexistent/outer/scripts' });
  try { assert.equal(r.code, 0, r.out.slice(-600)); assert.match(r.out, /MATRIX GREEN/); assert.deepEqual(r.leftCopies, []); } finally { r.p.done(); }
});

test('CONTROL: with the self-copy off (the behaviour before 2026-11-19) the very same edit hurts the run, so the test above can fail', { skip }, async () => {
  const r = await runAndEdit({ FORGE_MATRIX_SELF_COPY: 'off' });
  try { assert.ok(r.code !== 0 || /syntax error|command not found/.test(r.out) || !/MATRIX GREEN/.test(r.out), `the edit was harmless without the copy: the control proves nothing (code ${r.code})`); } finally { r.p.done(); }
});

test('the copy is made once (a re-exec under the heavy lock does not copy again), the helpers in dev/ are found from the ORIGINAL directory, and a refusal (a flat battery) leaves no copy', { skip }, async () => {
  const p = projects();
  try {
    const flat = path.join(p.dir, 'flat.txt'); fs.writeFileSync(flat, "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1)\t10%; discharging; 0:40 remaining present: true\n");
    const calm = path.join(p.dir, '.calm-machine.json'); fs.writeFileSync(calm, JSON.stringify(CALM_MACHINE));
    const code = await new Promise((resolve) => { const c = spawn('bash', [SCRIPT, '--no-forge'], { cwd: p.client, stdio: 'ignore', env: { ...process.env, PROJECTS: p.dir, TMPDIR: p.dir, LOGKEEP: p.dir, MARKS: p.marks, FORGE_MACHINE_READ_FILE: calm, ...powerEnv(p.dir), FORGE_POWER_READ_FILE: flat } }); c.on('close', resolve); });
    assert.notEqual(code, 0); assert.deepEqual(copies(p.dir), [], 'the refusal removed the copy too');
  } finally { p.done(); }
});
