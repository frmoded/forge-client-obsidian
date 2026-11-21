// 2026-11-21-1012 item 6 (the 1005zz recommendation, accepted): when the memory compressor already holds more than 5 GB at the START, the matrix defaults to `--serial` with 2 files per leg and says so in its FIRST line; otherwise as before.
// The choice is pinned on a FAKE vm_stat (FORGE_VM_STAT_FILE: the text the machine would give), never on the weather of the machine the test runs on. Three matrix attempts on 2026-11-21 were stopped by the memory guard at 11.5 GB compressed
// (the driver's apps open) before a serial run at 1 file per leg went green; a default that starts there saves those attempts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { COMPRESSED_SERIAL_MB, compressorHeavy, compressorSentence, parseVmStat } from './dev/mem-core.mjs';
import { matrix, projects, skip } from './test-support/matrix-stubs.mjs';

const PLAN = path.resolve(import.meta.dirname, 'dev/mem-plan.mjs');
/** vm_stat text with the given compressor pages (16384-byte pages: 65,536 pages are 1 GB). */
const vmStat = (gb) => `Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free:                               43636.\nPages active:                            513558.\nPages inactive:                          543529.\nPages speculative:                        15319.\nPages wired down:                        157842.\nPages purgeable:                           4289.\nFile-backed pages:                       362420.\nAnonymous pages:                         709986.\nPages occupied by compressor:            ${Math.round(gb * 65536)}.\n`;
const sentence = /^the memory compressor already holds [\d.]+ GB \(over 5 GB\): the matrix runs --serial with 2 files per leg \(FORGE_MATRIX_FILE_CONC=<n> chooses another number\)$/;

test('the limit is 5 GB compressed, strictly over; a missing reading is never heavy; the sentence says the number', () => {
  assert.equal(COMPRESSED_SERIAL_MB, 5120);
  assert.equal(parseVmStat(vmStat(6)).compressorMb, 6144);
  assert.equal(compressorHeavy({ compressedMb: 5121 }), true); assert.equal(compressorHeavy({ compressedMb: 5120 }), false); assert.equal(compressorHeavy({ compressedMb: 9000 }), true);
  for (const m of [{}, { compressedMb: null }, { compressedMb: NaN }, { compressedMb: 'x' }]) assert.equal(compressorHeavy(m), false, JSON.stringify(m));
  assert.match(compressorSentence({ compressedMb: 11483 }), sentence); assert.match(compressorSentence({ compressedMb: 11483 }), /holds 11\.2 GB/);
});
const plan = (dir, gb, extra = {}) => { const f = path.join(dir, 'vm_stat.txt'); fs.writeFileSync(f, vmStat(gb)); return spawnSync(process.execPath, [PLAN, 'compressor'], { encoding: 'utf8', env: { ...process.env, FORGE_VM_STAT_FILE: f, ...extra } }); };
test('mem-plan compressor: the sentence over 5 GB, nothing at or under it; always exit 0', () => {
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'comp-'));
  try {
    const heavy = plan(tmp, 6.5); assert.equal(heavy.status, 0); assert.match(heavy.stdout.trim(), sentence);
    for (const gb of [5, 2, 0.1]) { const r = plan(tmp, gb); assert.equal(r.status, 0); assert.equal(r.stdout.trim(), '', `${gb} GB: nothing to say`); }
    const unreadable = spawnSync(process.execPath, [PLAN, 'compressor'], { encoding: 'utf8', env: { ...process.env, FORGE_VM_STAT_FILE: path.join(tmp, 'missing.txt') } }); assert.equal(unreadable.status, 0); assert.equal(unreadable.stdout.trim(), '', 'a vm_stat that cannot be read says nothing');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
test('the matrix with the compressor over 5 GB: the FIRST output line says so, the legs run one after the other WITHOUT --serial, 2 files per leg, green all the same', { skip }, () => {
  const p = projects();
  try {
    const f = path.join(p.dir, 'vm_stat.txt'); fs.writeFileSync(f, vmStat(8));
    const r = matrix(p, ['--no-forge'], { FORGE_VM_STAT_FILE: f });
    assert.equal(r.status, 0, r.out + r.err);
    assert.match(r.out.split('\n')[0], sentence, `the first line: ${r.out.split('\n')[0]}`);
    assert.match(r.out, /client legs, one after the other \(--serial\)/); assert.doesNotMatch(r.out, /music and lean at the same time/);
    assert.match(r.out, /matrix: 2 test files per leg/); assert.match(r.out, /MATRIX GREEN/);
  } finally { p.done(); }
});
test('an explicit FORGE_MATRIX_FILE_CONC wins over the default of 2 (the driver chose a number); the compressor sentence is still said', { skip }, () => {
  const p = projects();
  try {
    const f = path.join(p.dir, 'vm_stat.txt'); fs.writeFileSync(f, vmStat(8));
    const r = matrix(p, ['--no-forge'], { FORGE_VM_STAT_FILE: f, FORGE_MATRIX_FILE_CONC: '3' });
    assert.equal(r.status, 0, r.out + r.err); assert.match(r.out.split('\n')[0], sentence); assert.match(r.out, /matrix: 3 test files per leg/);
  } finally { p.done(); }
});
test('the control: a compressor at 3 GB prints no sentence and the legs run at once (the assertions above can fail)', { skip }, () => {
  const p = projects();
  try {
    const f = path.join(p.dir, 'vm_stat.txt'); fs.writeFileSync(f, vmStat(3));
    const r = matrix(p, ['--no-forge'], { FORGE_VM_STAT_FILE: f });
    assert.equal(r.status, 0, r.out + r.err); assert.doesNotMatch(r.out, /the memory compressor already holds/); assert.match(r.out, /client legs: music and lean at the same time/);
  } finally { p.done(); }
});
