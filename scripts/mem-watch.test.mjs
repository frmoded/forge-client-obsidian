// 2026-10-31-1125 - mem-watch on REAL processes: a child that holds ~300 MB for a few seconds is seen at (about) that size in the CSV, the peak is reported with its minute, the status is the child's, and the guard terminates a
// child when the (stubbed) availability falls below its limit. The CSV helpers are pure and tested here with fixed samples.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { CSV_HEADER, FAMILIES, csvLine, summarizeSamples, summaryLines } from './dev/mem-core.mjs';

const WATCH = path.join(import.meta.dirname, 'dev', 'mem-watch.mjs');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'forge-memwatch-'));
const sample = (t, mb, extra = {}) => ({ tSeconds: t, mb: Object.fromEntries(FAMILIES.map((f) => [f, mb[f] ?? 0])), count: Object.fromEntries(FAMILIES.map((f) => [f, mb[f] ? 1 : 0])), availableMb: 5000, freePercent: 60, ...extra });

test('csvLine and summarizeSamples: the header and the line agree in width, the tools together add the tooling families only, the peak carries the minute, the lowest availability is kept', () => {
  const samples = [sample(10, { runner: 1000, 'node-other': 100, claude: 900 }), sample(75, { runner: 4000, chrome: 500, claude: 950 }, { availableMb: 1200 }), sample(130, { runner: 2000 }, { availableMb: 3000 })];
  assert.equal(csvLine(samples[0]).split(',').length, CSV_HEADER.split(',').length);
  const sum = summarizeSamples(samples);
  assert.equal(sum.peak.runner, 4000); assert.equal(sum.at.runner, 1, 'the second minute (75 s)'); assert.equal(sum.peak.claude, 950);
  assert.equal(sum.toolsPeak, 4500); assert.equal(sum.toolsAt, 1);
  assert.deepEqual([sum.minAvailable, sum.minAt], [1200, 1]);
  const lines = summaryLines(sum).join('\n');
  assert.match(lines, /runner\s+peak\s+4000 MB at minute 1/); assert.match(lines, /tools together  peak 4500 MB at minute 1/); assert.match(lines, /lowest available memory 1200 MB at minute 1/);
  assert.doesNotMatch(lines, /obsidian/, 'a family that never showed up is not listed');
});

test('a REAL child that holds 300 MB: the CSV has the rows, the biggest "node-other" sample is at least ~250 MB, the summary names the peak, and the exit status is the child\'s', () => {
  const dir = tmp(), csv = path.join(dir, 'm.csv');
  try {
    const hold = 'const b = Buffer.alloc(300 * 1024 * 1024, 1); let s = 0; for (let i = 0; i < b.length; i += 4096) s += b[i]; setTimeout(() => process.exit(7), 3500);';
    const r = spawnSync('node', [WATCH, '--out', csv, '--interval', '500', '--', 'node', '-e', hold], { encoding: 'utf8' });
    assert.equal(r.status, 7, r.stderr);
    const rows = fs.readFileSync(csv, 'utf8').trim().split('\n');
    assert.equal(rows[0], CSV_HEADER); assert.ok(rows.length >= 5, `${rows.length} rows`);
    const col = CSV_HEADER.split(',').indexOf('node-other_mb');
    const peak = Math.max(...rows.slice(1).map((l) => Number(l.split(',')[col])));
    assert.ok(peak >= 250, `the child's 300 MB was seen as ${peak} MB`);
    assert.match(r.stdout, /node-other\s+peak\s+\d+ MB at minute 0/); assert.match(r.stdout, /mem-watch: csv /);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the guard: with a limit no machine can meet the watched command is terminated and the CSV says so (the safety net of a measuring run)', () => {
  const dir = tmp(), csv = path.join(dir, 'm.csv');
  try {
    const r = spawnSync('node', [WATCH, '--out', csv, '--interval', '300', '--guard-free-mb', '99999999', '--', 'node', '-e', 'setTimeout(() => {}, 30000)'], { encoding: 'utf8', timeout: 20000 });
    assert.match(r.stderr, /GUARD: available memory \d+ MB < 99999999 MB/);
    assert.match(fs.readFileSync(csv, 'utf8'), /^# mem-watch: GUARD/m);
    assert.notEqual(r.status, 0, 'it did not run to its 30 s');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('usage: no --out or nothing to watch is exit status 2 with a usage line', () => {
  const r = spawnSync('node', [WATCH, '--interval', '100'], { encoding: 'utf8' });
  assert.equal(r.status, 2); assert.match(r.stderr, /usage: mem-watch\.mjs/);
});
