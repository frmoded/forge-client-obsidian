// 2026-11-20-1001z - scripts/heavy-mem-report.mjs run on a KNOWN process tree: a node command that starts two children which hold 60 MB and 40 MB, so the report must see a peak of at least 100 MB over three processes, name them, say whether the tail is
// rising (a command that keeps allocating to the end: yes; one that allocates at the start and then idles: no), print the machine at its start (hw.memsize, vm.swapusage: from a stand-in, FORGE_HEAVY_FAKE_MEM) and pass the command's exit code
// through, with the samples in a TSV. Light: three commands of 1.5 s each, at most 200 MB, sampled every 100 ms.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { defaultTsvPath } from './heavy-mem-report.mjs';

const REPORT = path.resolve(import.meta.dirname, 'heavy-mem-report.mjs');
const FAKE = JSON.stringify({ memsizeMb: 24576, swapTotalMb: 4096, swapUsedMb: 2389, compressedMb: 4076, freePct: 72, freeMb: 971, activeMb: 8026, inactiveMb: 7933, wiredMb: 2423, pages: { free: 62137, active: 513673, inactive: 507704, wired: 155083, compressor: 260891 } });
const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'heavy-mem-report-test-'));
const run = (dir, script, extra = []) => {
  const env = { ...process.env, FORGE_HEAVY_FAKE_MEM: FAKE, FORGE_HEAVY_REPORT_DIR: dir }; delete env.NODE_TEST_CONTEXT;
  const f = path.join(dir, 'cmd.mjs'); fs.writeFileSync(f, script);
  const tsv = path.join(dir, 'samples.tsv');
  const r = spawnSync(process.execPath, [REPORT, '--out', tsv, '--interval-ms', '100', ...extra, '--', process.execPath, f], { encoding: 'utf8', env, timeout: 60_000 });
  return { status: r.status, out: r.stdout, err: r.stderr, tsv };
};
// two children that hold 60 MB and 40 MB, the parent holds 20 MB; the command lives about 1.5 s
const TREE = (tail) => `import { spawn } from 'node:child_process';
const child = (mb, ms) => spawn(process.execPath, ['-e', \`const k = Buffer.alloc(\${mb} * 1024 * 1024, 1); setTimeout(() => process.exit(0), \${ms})\`], { stdio: 'ignore' });
child(60, 1500); child(40, 1500);
const mine = [Buffer.alloc(20 * 1024 * 1024, 1)];
${tail}
`;

test('on a known tree: the peak is at least the 100 MB the children hold, the biggest processes are named, hw.memsize and vm.swapusage are printed at the START, the exit code is the command\'s own, the TSV has a line per sample', () => {
  const dir = mk();
  try {
    const r = run(dir, `${TREE('setTimeout(() => process.exit(5), 1500);')}console.log('the command\\'s own output');`);
    assert.equal(r.status, 5, r.err);
    assert.equal(r.out, 'the command\'s own output\n', 'the command\'s stdout is untouched: the report goes to stderr');
    assert.match(r.err.split('\n')[0], /^machine at start: hw\.memsize 24576 MB; vm\.swapusage total 4096 MB, used 2389 MB; compressed 4076 MB; memory_pressure free percentage 72 %/, 'the machine comes first, before the command has run');
    const peak = /PEAK (\d+) MB \(the whole tree: (\d+) processes\) at ([\d.]+) s/.exec(r.err);
    assert.ok(peak, r.err);
    assert.ok(Number(peak[1]) >= 100 + 20, `the peak ${peak[1]} MB holds the 60, 40 and 20 MB buffers`);
    assert.equal(Number(peak[2]), 3, 'the command and its two children');
    const named = [...r.err.matchAll(/^\s+(\d+)\s+(\d+) MB\s+(.+)$/gm)];
    assert.equal(named.length, 3, 'three processes, so three lines (at most five)');
    assert.ok(Number(named[0][2]) >= Number(named[1][2]) && Number(named[1][2]) >= Number(named[2][2]), 'biggest first');
    assert.ok(Number(named[0][2]) >= 60, 'the 60 MB child is the biggest');
    assert.match(r.err, /exit code 5; ran 1\.\d s; \d+ samples, one every 0\.1 s/);
    assert.match(r.err, /machine at end: hw\.memsize 24576 MB/);
    const lines = fs.readFileSync(r.tsv, 'utf8').trim().split('\n');
    assert.equal(lines[0], 't_s\ttotal_mb\tprocesses\tbiggest_pid\tbiggest_mb\tbiggest_command');
    assert.ok(lines.length >= 4, `a line per sample: ${lines.length - 1}`);
    for (const l of lines.slice(1)) { const c = l.split('\t'); assert.ok(Number(c[0]) >= 0 && Number(c[1]) > 0 && Number(c[2]) >= 1 && Number(c[3]) > 0, l); }
    assert.ok(fs.existsSync(path.join(dir, 'samples.report.txt')), 'the report is kept next to the samples');
    assert.match(fs.readFileSync(path.join(dir, 'samples.report.txt'), 'utf8'), /PEAK \d+ MB/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a tail that is still RISING at the end is said so; the control (allocates at the start, idles) is flat', () => {
  const dir = mk();
  try {
    const rising = run(dir, `const keep = []; const t = setInterval(() => keep.push(Buffer.alloc(8 * 1024 * 1024, 1)), 50); setTimeout(() => { clearInterval(t); process.exit(0); }, 1500);`);
    assert.equal(rising.status, 0, rising.err);
    assert.match(rising.err, /tail: RISING \(a leak or a runaway\)/, rising.err);
    const flat = run(dir, `const k = Buffer.alloc(60 * 1024 * 1024, 1); setTimeout(() => process.exit(0), 1500);`);
    assert.equal(flat.status, 0, flat.err);
    assert.match(flat.err, /tail: flat or falling/, flat.err);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('no command is a usage error (2); a command that cannot be started is 127; the default samples file is under ~/forge-logs/heavy-mem (not /tmp) unless FORGE_HEAVY_REPORT_DIR says otherwise', () => {
  const dir = mk();
  try {
    const none = spawnSync(process.execPath, [REPORT], { encoding: 'utf8' });
    assert.equal(none.status, 2); assert.match(none.stderr, /usage/);
    const env = { ...process.env, FORGE_HEAVY_FAKE_MEM: FAKE, FORGE_HEAVY_REPORT_DIR: dir };
    const missing = spawnSync(process.execPath, [REPORT, '--', 'definitely-not-a-command-1001z'], { encoding: 'utf8', env });
    assert.equal(missing.status, 127); assert.match(missing.stderr, /could not start/);
    assert.equal(path.dirname(defaultTsvPath({}, new Date(2026, 10, 20, 13, 29, 5))), path.join(os.homedir(), 'forge-logs', 'heavy-mem'));
    assert.equal(path.basename(defaultTsvPath({}, new Date(2026, 10, 20, 13, 29, 5))), 'heavy-mem-20261120-132905.tsv');
    assert.equal(path.dirname(defaultTsvPath({ FORGE_HEAVY_REPORT_DIR: dir })), dir);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
