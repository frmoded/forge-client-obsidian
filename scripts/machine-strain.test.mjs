// 2026-11-05-1176 - the matrix says what the machine is doing and does not run its legs at once on a thrashing one. The rules are pinned on READINGS (a stand-in file for the machine, FORGE_MACHINE_READ_FILE), never on the weather
// of the machine the test runs on: swap over 85 % used or a 1-minute load over 4 per core is thrashing; anything else, or a reading that is missing, is not; the sentence is the one the prompt names; and the state of the machine is
// never a reason for the matrix to fail. Pins the MECHANISM of the decision (mem-plan.mjs strain, read by drain-matrix.sh): if the design moves this SHOULD go red - reassess, don't just rewrite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { LOAD_PER_CORE_LIMIT, SWAP_USED_LIMIT, machineStrain, parseSwapUsage, readingsLine, thrashingSentence } from './dev/mem-core.mjs';
import { CALM_MACHINE, matrix, projects, skip } from './test-support/matrix-stubs.mjs';

const PLAN = path.resolve(import.meta.dirname, 'dev/mem-plan.mjs');
const CASES = {
  calm: CALM_MACHINE,
  swap: { ...CALM_MACHINE, swapUsedMb: 7500, swapTotalMb: 8192 },                       // 91.6 % used
  load: { ...CALM_MACHINE, load1: 52.3 },                                                  // 6.5 per core on 8 cores
};
const SENTENCE = /^the machine is thrashing \(swap [\d.]+ of [\d.]+ GB, load [\d.]+\): running the legs one after the other; close apps or quit Obsidian vaults you are not using$/m;

test('parseSwapUsage reads the macOS line and says null for anything else', () => {
  assert.deepEqual(parseSwapUsage('total = 11264.00M  used = 9648.81M  free = 1615.19M  (encrypted)'), { totalMb: 11264, usedMb: 9648.81 });
  assert.equal(parseSwapUsage(''), null);
  assert.equal(parseSwapUsage('vm.swapusage: nonsense'), null);
});

test('machineStrain: swap over 85 % or load over 4 per core is thrashing; the limits themselves are not; a missing reading is never strain', () => {
  assert.equal(SWAP_USED_LIMIT, 0.85); assert.equal(LOAD_PER_CORE_LIMIT, 4);
  assert.deepEqual(machineStrain(CASES.calm), { thrashing: false, reasons: [] });
  assert.deepEqual(machineStrain(CASES.swap), { thrashing: true, reasons: ['swap'] });
  assert.deepEqual(machineStrain(CASES.load), { thrashing: true, reasons: ['load'] });
  assert.deepEqual(machineStrain({ ...CASES.swap, load1: 52.3 }), { thrashing: true, reasons: ['swap', 'load'] });
  assert.equal(machineStrain({ ...CALM_MACHINE, swapUsedMb: 0.85 * 8192 }).thrashing, false, 'exactly 85 % is not over it');
  assert.equal(machineStrain({ ...CALM_MACHINE, swapUsedMb: 0.85 * 8192 + 1 }).thrashing, true);
  assert.equal(machineStrain({ ...CALM_MACHINE, load1: 32 }).thrashing, false, 'exactly 4 per core is not over it');
  assert.equal(machineStrain({ ...CALM_MACHINE, load1: 32.1 }).thrashing, true);
  assert.equal(machineStrain({ load1: 500, cores: NaN, swapUsedMb: null, swapTotalMb: null }).thrashing, false, 'no core count, no swap figure: not strain');
  assert.equal(machineStrain({ ...CALM_MACHINE, swapUsedMb: 9000, swapTotalMb: 0 }).thrashing, false, 'no swap at all is not 100 % used');
});

test('the sentence and the readings line say the numbers', () => {
  assert.equal(thrashingSentence({ swapUsedMb: 9830.4, swapTotalMb: 12288, load1: 52.34 }), 'the machine is thrashing (swap 9.6 of 12.0 GB, load 52.3): running the legs one after the other; close apps or quit Obsidian vaults you are not using');
  assert.equal(readingsLine({ load1: 6.5, cores: 10, swapUsedMb: 9830.4, swapTotalMb: 12288, availableMb: 5530, freePercent: 38 }), 'machine: load average 6.5 (10 cores), swap 9.6 of 12.0 GB used, free memory 5.4 GB (38 % free)');
  assert.match(readingsLine({ load1: 1, cores: 4, swapUsedMb: null, swapTotalMb: null, availableMb: null }), /swap unknown, free memory unknown/);
});

const strain = (tmp, reading) => {
  const f = path.join(tmp, 'reading.json'); fs.writeFileSync(f, JSON.stringify(reading));
  const r = spawnSync(process.execPath, [PLAN, 'strain'], { encoding: 'utf8', env: { ...process.env, FORGE_MACHINE_READ_FILE: f } });
  return { status: r.status, lines: r.stdout.trim().split('\n') };
};
test('mem-plan strain: always the readings line, the sentence only when thrashing, and the exit status is 0 in all three cases', () => {
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'strain-'));
  try {
    for (const [name, reading] of Object.entries(CASES)) {
      const r = strain(tmp, reading);
      assert.equal(r.status, 0, `${name}: never a failure`);
      assert.match(r.lines[0], /^machine: load average [\d.]+ \(\d+ cores\), swap /, name);
      assert.equal(r.lines.length, name === 'calm' ? 1 : 2, `${name}: ${r.lines.join(' | ')}`);
      if (name !== 'calm') assert.match(r.lines[1], SENTENCE, name);
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

for (const name of ['swap', 'load']) {
  test(`the matrix on a ${name}-thrashing machine prints the readings and the sentence, runs the legs one after the other WITHOUT --serial, and is green all the same`, { skip }, () => {
    const p = projects();
    try {
      const f = path.join(p.dir, `${name}.json`); fs.writeFileSync(f, JSON.stringify(CASES[name]));
      const r = matrix(p, ['--no-forge'], { FORGE_MACHINE_READ_FILE: f });
      assert.equal(r.status, 0, r.out + r.err);
      assert.match(r.out, /^machine: load average /m);
      assert.match(r.out, SENTENCE);
      assert.match(r.out, /client legs, one after the other \(--serial\)/);
      assert.doesNotMatch(r.out, /music and lean at the same time/);
      assert.match(r.out, /MATRIX GREEN/);
    } finally { p.done(); }
  });
}

test('the matrix on a calm machine prints the readings and NO sentence, and the legs run at once (the control: the two assertions above can fail)', { skip }, () => {
  const p = projects();
  try {
    const r = matrix(p, ['--no-forge']);
    assert.equal(r.status, 0, r.out + r.err);
    assert.match(r.out, /^machine: load average /m);
    assert.doesNotMatch(r.out, /the machine is thrashing/);
    assert.match(r.out, /client legs: music and lean at the same time/);
  } finally { p.done(); }
});

test('a reading file that cannot be read never fails the matrix (the real readings are used); the check erroring is silence', { skip }, () => {
  const p = projects();
  try {
    const bad = path.join(p.dir, 'bad.json'); fs.writeFileSync(bad, '{ not json');
    const r = matrix(p, ['--no-forge', '--serial'], { FORGE_MACHINE_READ_FILE: bad });
    assert.equal(r.status, 0, r.out + r.err);
    assert.match(r.out, /MATRIX GREEN/);
  } finally { p.done(); }
});
