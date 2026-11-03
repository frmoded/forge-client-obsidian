// mutate-map: imports only (this file runs the CLI as a child process)
// 2026-11-02-1154 - the mutation pass has a time box (--time-box <minutes>, card section 22: a pass is at most 15 minutes): a mutant not STARTED when the time is over is reported as NOT RUN with its reason, never as a survivor
// or a kill; with room in the box the same mutants are judged as usual.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const CLI = path.resolve(import.meta.dirname, 'dev/mutate.mjs');
const git = (cwd, ...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const LIB = 'export function twice(n: number): number {\n  return n * 2;\n}\n';
const TEST = "import { test } from 'node:test'; import assert from 'node:assert/strict';\nimport { twice } from './lib.ts';\ntest('twice', () => { assert.equal(twice(2), 4); });\n";
function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mutate-time-box-'));
  const proj = path.join(root, 'proj');
  for (const [f, t] of Object.entries({ 'src/lib.ts': LIB, 'src/lib.test.ts': TEST, 'package.json': '{"type":"module"}' })) { fs.mkdirSync(path.dirname(path.join(proj, f)), { recursive: true }); fs.writeFileSync(path.join(proj, f), t); }
  git(proj, 'init', '-q'); git(proj, 'add', '-A'); git(proj, 'commit', '-qm', 'one');
  const hand = path.join(root, 'hand.json');
  fs.writeFileSync(hand, JSON.stringify([['src/lib.ts', 'triples', 'return n * 2;', 'return n * 3;', ['src/lib.test.ts']], ['src/lib.ts', 'changes nothing', 'export function twice', 'export function  twice', ['src/lib.test.ts']]]));
  return { root, proj, hand };
}
const run = (proj, hand, extra) => spawnSync(process.execPath, [CLI, '--root', proj, '--hand', hand, '--no-fail', '--jobs', '1', '--test-concurrency', '1', ...extra], { encoding: 'utf8', timeout: 120_000, env: { ...process.env, FORGE_HEAVY_LOCK: 'off', FORGE_MEM_BUDGET_MB: '9000' } });

test('a mutant not started when the time box is over is NOT RUN, with the reason; with room in the box the mutants are judged as usual', () => {
  const { root, proj, hand } = project();
  try {
    const over = run(proj, hand, ['--time-box', '0']);
    assert.match(over.stdout, /killed 0 .*survived 0 .*not run 2/, over.stdout + over.stderr);
    assert.match(over.stdout, /NOT RUN .*the time box \(--time-box\) was over before it started/, over.stdout);
    assert.doesNotMatch(over.stdout, /SURVIVED/, 'a mutant that never ran is not a survivor');
    const room = run(proj, hand, ['--time-box', '5']);
    assert.match(room.stdout, /killed 1 .*survived 1 .*not run 0/, room.stdout + room.stderr);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
