// 2026-11-20-1001z - scripts/heavy-mem-core.mjs: the rules of the memory report and of the memory guard, proved on FIXTURE TEXT (a process table, vm_stat, sysctl, memory_pressure): no test here reads the machine, starts a process or allocates memory.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import {
  DEFAULT_LIMITS, alsoRunning, alsoRunningLine, createGuard, formatReport, labelOf, limitsFromEnv, machineLines, machineSnapshot, parsePs, peakOf, refusalReasons, refusalText, sampleOf, stopReason, stopText, tailTrend, treeRows, treeStats, tsvLine,
} from './heavy-mem-core.mjs';
import * as core from './heavy-mem-core.mjs';

// a process table as `ps -Ao pid,ppid,rss,command` prints it: 100 is the command, 101 and 102 its children, 103 a grandchild; 200 and 201 are somebody else's tree; 1 is launchd
const PS = `  PID  PPID    RSS COMMAND
    1     0   9000 /sbin/launchd
  100     1   2048 node scripts/drain-matrix.sh --quiet-only
  101   100 307200 /usr/local/bin/node --test src/a.test.ts
  102   100 102400 /usr/local/bin/node --test src/b.test.ts
  103   101 614400 /usr/local/bin/node -e hog
  200     1 819200 node /home/x/hello-cloudflare/node_modules/.bin/wrangler dev --test-scheduled
  201   200 409600 /usr/local/bin/node --no-warnings /home/x/hello-cloudflare/node_modules/wrangler/wrangler-dist/cli.js
`;
const rows = parsePs(PS);

test('treeRows / treeStats: the command, its children and its grandchildren, nobody else; MB summed, biggest first; a root that has ended contributes nothing', () => {
  assert.deepEqual(treeRows(rows, [100]).map((r) => r.pid).sort((a, b) => a - b), [100, 101, 102, 103]);
  const s = treeStats(rows, [100]);
  assert.equal(s.count, 4);
  assert.equal(s.totalMb, 2 + 300 + 100 + 600);
  assert.deepEqual(s.procs.map((p) => [p.pid, p.mb]), [[103, 600], [101, 300], [102, 100], [100, 2]]);
  assert.equal(treeStats(rows, [999]).count, 0, 'a pid that is not in the table');
  assert.equal(treeStats(rows, [100, 200]).count, 6, 'two roots: both trees');
  assert.equal(treeRows(rows, [100, 101]).length, 4, 'a root inside another root is counted once');
  assert.ok(!treeRows(rows, [100]).some((r) => r.pid === 1), 'pid 1 is never walked through');
});

test('sampleOf keeps the five biggest, null when the tree is gone; peakOf is the highest total (the first on a tie)', () => {
  const big = parsePs(['  1 0 1 launchd', ...Array.from({ length: 8 }, (_, i) => `  ${300 + i} 1 ${(i + 1) * 1024} p${i}`)].join('\n'));
  const s = sampleOf([...big, { pid: 400, ppid: 1, rssKb: 1, command: 'root' }, ...big.slice(1).map((r) => ({ ...r, ppid: 400 }))], [400], 5);
  assert.equal(s.top.length, 5);
  assert.deepEqual(s.top.map((t) => t.mb), [8, 7, 6, 5, 4]);
  assert.equal(sampleOf(rows, [999], 1), null);
  const p = peakOf([{ totalMb: 10, tSec: 0 }, { totalMb: 30, tSec: 5 }, { totalMb: 30, tSec: 10 }, { totalMb: 5, tSec: 15 }]);
  assert.equal(p.tSec, 5);
  assert.equal(p.index, 1);
  assert.equal(peakOf([]), null);
});

const series = (totals, step = 5) => totals.map((totalMb, i) => ({ tSec: i * step, totalMb, count: 3, top: [{ pid: 1, mb: totalMb, command: 'x' }] }));
test('tailTrend: the last 25 % of the samples (at least 3) trending UP by more than 10 % of the peak is rising; flat, falling, noise and too few samples are not', () => {
  // 12 samples: the tail is the last 3. A run that climbs steadily to the end: rising
  const leak = tailTrend(series([100, 150, 200, 250, 300, 350, 400, 500, 600, 700, 800, 900]));
  assert.equal(leak.tailLen, 3);
  assert.equal(leak.rising, true, JSON.stringify(leak));
  assert.equal(leak.riseMb, 200);
  assert.equal(leak.risePctOfPeak, 22);
  // it climbed, peaked and came down: not rising (the peak is earlier, the tail falls)
  assert.equal(tailTrend(series([100, 500, 900, 1000, 900, 800, 700, 600, 500, 400, 300, 200])).rising, false);
  // flat at the top, with noise
  assert.equal(tailTrend(series([900, 905, 898, 902, 900, 901, 899, 903, 900, 902, 898, 904])).rising, false);
  // a rise of 5 % of the peak at the end is under the 10 % rule
  assert.equal(tailTrend(series([1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1025, 1050])).rising, false);
  // exactly on the line is not over it: a rise of 100 MB on a 1000 MB peak
  const edge = tailTrend(series([900, 900, 900, 900, 900, 900, 900, 900, 900, 900, 950, 1000]));
  assert.equal(edge.riseMb, 100);
  assert.equal(edge.rising, false, '100 MB is exactly 10 % of the 1000 MB peak: not MORE than 10 %');
  assert.equal(tailTrend(series([900, 900, 900, 900, 900, 900, 900, 900, 900, 900, 951, 1002])).rising, true, 'over the line');
  // a 4-sample run still has a tail of 3
  assert.equal(tailTrend(series([100, 100, 400, 800])).tailLen, 3);
  assert.equal(tailTrend(series([100, 200, 300])).tooFew, true, 'fewer than 4 samples cannot say');
  assert.equal(tailTrend([]).rising, false);
  // a long run: the tail is 25 % of it
  assert.equal(tailTrend(series(Array.from({ length: 40 }, () => 500))).tailLen, 10);
});

// ---- the machine ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const VM_STAT = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                               62137.
Pages active:                            513673.
Pages inactive:                          507704.
Pages speculative:                        10646.
Pages throttled:                              0.
Pages wired down:                        155083.
Pages purgeable:                           1627.
File-backed pages:                       270697.
Anonymous pages:                         761326.
Pages stored in compressor:              689047.
Pages occupied by compressor:            260891.
`;
const SWAP = 'vm.swapusage: total = 4096.00M  used = 2389.31M  free = 1706.69M  (encrypted)\n';
const PRESSURE = 'The system has 25769803776 (1572864 pages with a page size of 16384).\nSystem-wide memory free percentage: 72%\n';

test('machineSnapshot reads hw.memsize, vm.swapusage, the compressor, vm_stat\'s free/active/inactive/wired pages and the free percentage; the lines say them; a figure the text lacks is "unknown"', () => {
  const m = machineSnapshot({ memsize: '25769803776\n', swap: SWAP, vmStat: VM_STAT, pressure: PRESSURE });
  assert.equal(m.memsizeMb, 24576);
  assert.equal(m.swapTotalMb, 4096);
  assert.equal(m.swapUsedMb, 2389);
  assert.equal(m.compressedMb, 4076, 'Pages occupied by compressor: 260891 pages of 16384 bytes');
  assert.deepEqual([m.freeMb, m.activeMb, m.inactiveMb, m.wiredMb], [971, 8026, 7933, 2423]);
  assert.deepEqual(m.pages, { free: 62137, active: 513673, inactive: 507704, wired: 155083, compressor: 260891 });
  assert.equal(m.freePct, 72);
  const text = machineLines(m, 'machine at start').join('\n');
  assert.match(text, /hw\.memsize 24576 MB/);
  assert.match(text, /vm\.swapusage total 4096 MB, used 2389 MB/);
  assert.match(text, /compressed 4076 MB/);
  assert.match(text, /memory_pressure free percentage 72 %/);
  assert.match(text, /free 62137 pages \(971 MB\), active 513673 pages \(8026 MB\), inactive 507704 pages \(7933 MB\), wired 155083 pages \(2423 MB\)/);
  const none = machineSnapshot({});
  assert.deepEqual([none.memsizeMb, none.swapUsedMb, none.compressedMb, none.freePct], [null, null, null, null]);
  assert.match(machineLines(none, 'machine at end').join('\n'), /hw\.memsize unknown; vm\.swapusage total unknown, used unknown; compressed unknown/);
});

// ---- the report ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('formatReport: the peak in MB, the five biggest at the peak, the tail verdict, the machine at start and end (hw.memsize and vm.swapusage first), the samples file; a TSV line per sample', () => {
  const start = machineSnapshot({ memsize: '25769803776', swap: SWAP, vmStat: VM_STAT, pressure: PRESSURE });
  const samples = [100, 400, 900, 1500, 1400, 1300, 1200, 1100].map((totalMb, i) => ({ tSec: i * 5, totalMb, count: 4, top: [{ pid: 103, mb: Math.round(totalMb * 0.6), command: 'node -e hog' }, { pid: 101, mb: Math.round(totalMb * 0.3), command: 'node --test src/a.test.ts' }] }));
  const text = formatReport({ command: 'bash drain-matrix.sh --quiet-only', exitCode: 0, seconds: 41.2, intervalMs: 5000, samples, start, end: start, tsvPath: '/x/heavy.tsv' });
  assert.match(text, /^==== heavy-mem-report ====/);
  assert.match(text, /command: bash drain-matrix\.sh --quiet-only/);
  assert.match(text, /exit code 0; ran 41\.2 s; 8 samples, one every 5 s/);
  assert.match(text, /PEAK 1500 MB \(the whole tree: 4 processes\) at 15\.0 s/);
  assert.match(text, /\n\s+103\s+900 MB\s+node -e hog/);
  assert.match(text, /tail: flat or falling: the last 3 samples/);
  assert.equal((text.match(/machine at start: hw\.memsize 24576 MB/g) ?? []).length, 1);
  assert.match(text, /machine at end: hw\.memsize/);
  assert.match(text, /samples: \/x\/heavy\.tsv/);
  const rising = formatReport({ command: 'x', exitCode: 1, seconds: 10, intervalMs: 5000, samples: [100, 200, 300, 400, 500, 600, 700, 800].map((t, i) => ({ tSec: i * 5, totalMb: t, count: 1, top: [{ pid: 1, mb: t, command: 'a' }] })), start, end: start });
  assert.match(rising, /tail: RISING \(a leak or a runaway\)/);
  assert.match(formatReport({ command: 'x', exitCode: 0, seconds: 0.1, intervalMs: 5000, samples: [], start, end: start }), /no sample saw the command running/);
  assert.equal(tsvLine(samples[3]), '15.0\t1500\t4\t103\t900\tnode -e hog');
});

// ---- the guard's rules ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('the limits: the defaults, each overridden by its variable, a caller\'s tree cap below the user\'s FORGE_HEAVY_RSS_MB, junk ignored, a stop limit never under its refuse limit', () => {
  // 2026-11-26-1042z (deliberate): four numbers more (the signs that make a swap level refuse)
  assert.deepEqual(limitsFromEnv({}), { rssMb: 6144, compressedRefuseMb: 8192, swapRefuseMb: 2048, freePctMin: 35, compressedKillMb: 10240, swapKillMb: 4096, pollMs: 500, sysEveryMs: 2000, alsoRunningMb: 500, swapGrowMb: 256, swapWindowS: 60, swapinPagesPerS: 200, sampleGapS: 10 });
  assert.equal(limitsFromEnv({}, { rssMb: 12288 }).rssMb, 12288, 'a caller\'s own default for its tree');
  assert.equal(limitsFromEnv({ FORGE_HEAVY_RSS_MB: '150' }, { rssMb: 12288 }).rssMb, 150, 'the user\'s word wins');
  const all = limitsFromEnv({ FORGE_HEAVY_RSS_MB: '1', FORGE_HEAVY_COMPRESSED_MB: '2', FORGE_HEAVY_SWAP_MB: '3', FORGE_HEAVY_FREE_PCT: '4', FORGE_HEAVY_KILL_COMPRESSED_MB: '5', FORGE_HEAVY_KILL_SWAP_MB: '6', FORGE_HEAVY_POLL_MS: '7', FORGE_HEAVY_SYS_MS: '8', FORGE_HEAVY_ALSO_MB: '9', FORGE_HEAVY_SWAP_GROW_MB: '10', FORGE_HEAVY_SWAP_WINDOW_S: '11', FORGE_HEAVY_SWAPIN_PPS: '12', FORGE_HEAVY_SAMPLE_GAP_S: '0.5' });
  assert.deepEqual(all, { rssMb: 1, compressedRefuseMb: 2, swapRefuseMb: 3, freePctMin: 4, compressedKillMb: 5, swapKillMb: 6, pollMs: 7, sysEveryMs: 8, alsoRunningMb: 9, swapGrowMb: 10, swapWindowS: 11, swapinPagesPerS: 12, sampleGapS: 0.5 });
  assert.equal(limitsFromEnv({ FORGE_HEAVY_RSS_MB: 'abc', FORGE_HEAVY_SWAP_MB: '-5', FORGE_HEAVY_COMPRESSED_MB: '' }).rssMb, 6144);
  assert.equal(limitsFromEnv({ FORGE_HEAVY_SWAP_MB: '-5' }).swapRefuseMb, 2048);
  assert.equal(limitsFromEnv({ FORGE_HEAVY_COMPRESSED_MB: '20000' }).compressedKillMb, 20000, 'a raised refuse limit raises the stop limit with it');
  assert.equal(limitsFromEnv({ FORGE_HEAVY_SWAP_MB: '9000' }).swapKillMb, 9000);
});

// 2026-11-26-1042z (deliberate): "swap over 2 GB alone refuses" now holds only WITHOUT a history of the swap (the call has none here); with a history that is flat it does not (the 1042z tests below)
test('refusalReasons without a swap history: compressed over 8 GB, swap over 2 GB, free percentage under 35 - each alone refuses; an unknown figure never does; the free percentage alone is NOT what decides when the compressor says otherwise', () => {
  const lim = limitsFromEnv({});
  assert.deepEqual(refusalReasons({ compressedMb: 4000, swapUsedMb: 100, freePct: 72 }, lim), []);
  assert.match(refusalReasons({ compressedMb: 9000, swapUsedMb: 0, freePct: 90 }, lim).join(), /compressed memory 9000 MB is over 8192 MB/);
  assert.match(refusalReasons({ compressedMb: 100, swapUsedMb: 2500, freePct: 90 }, lim).join(), /swap used 2500 MB is over 2048 MB/);
  assert.match(refusalReasons({ compressedMb: 100, swapUsedMb: 0, freePct: 34 }, lim).join(), /free percentage 34 % is under 35 %/);
  assert.deepEqual(refusalReasons({ compressedMb: 100, swapUsedMb: 0, freePct: 35 }, lim), [], '35 is not under 35');
  assert.deepEqual(refusalReasons({ compressedMb: 8192, swapUsedMb: 2048, freePct: 35 }, lim), [], 'exactly on a limit is not over it');
  assert.equal(refusalReasons({ compressedMb: 10738, swapUsedMb: null, freePct: 42 }, lim).length, 1, 'the 2026-11-20 13:29 reading: free 42 % would have passed a free-percentage gate; the compressor refuses');
  assert.deepEqual(refusalReasons({ compressedMb: null, swapUsedMb: null, freePct: null }, lim), [], 'nothing known: nothing refused');
});

test('stopReason: the tree over its cap, the compressor over 10 GB, swap over 4 GB; the cron logger\'s last two blocks (11179 and 10738 MB compressed) are both over the stop limit', () => {
  const lim = limitsFromEnv({});
  assert.equal(stopReason({ treeMb: 3000, mem: { compressedMb: 6000, swapUsedMb: 1000 } }, lim), null);
  assert.match(stopReason({ treeMb: 6145, mem: { compressedMb: 100 } }, lim), /process tree holds 6145 MB, over the 6144 MB cap/);
  assert.equal(stopReason({ treeMb: 6144, mem: {} }, lim), null, 'on the cap is not over it');
  assert.match(stopReason({ treeMb: 10, mem: { compressedMb: 10738 } }, lim), /compressed memory is 10738 MB, over 10240 MB/);
  assert.match(stopReason({ treeMb: 10, mem: { compressedMb: 11179 } }, lim), /compressed memory is 11179 MB/);
  assert.match(stopReason({ treeMb: 10, mem: { swapUsedMb: 4097 } }, lim), /swap used is 4097 MB, over 4096 MB/);
  assert.equal(stopReason({ treeMb: 10, mem: null }, lim), null);
});

test('labelOf / alsoRunning: Chrome\'s 59 helpers are ONE line; a wrangler dev server of another project is named as a dev server; small programs are left out; our own pids can be excluded', () => {
  assert.deepEqual(labelOf('/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Versions/156/Helpers/Google Chrome Helper (Renderer).app/Contents/MacOS/Google Chrome Helper (Renderer) --type=renderer'), { label: 'Google Chrome', devServer: false });
  assert.deepEqual(labelOf('node /home/x/hello-cloudflare/node_modules/.bin/wrangler dev --test-scheduled'), { label: 'wrangler/workerd', devServer: true });
  assert.deepEqual(labelOf('/usr/local/bin/node --no-warnings /home/x/node_modules/wrangler/wrangler-dist/cli.js'), { label: 'wrangler/workerd', devServer: true });
  assert.equal(labelOf('/usr/local/bin/node --test src/a.test.ts').label, 'node a.test.ts');
  const chrome = Array.from({ length: 59 }, (_, i) => ({ pid: 1000 + i, ppid: 1, rssKb: 100 * 1024, command: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome Helper ${i}` }));
  const list = alsoRunning([...rows, ...chrome], { exclude: new Set([100, 101, 102, 103]) });
  assert.deepEqual(list.map((g) => [g.label, g.count, g.mb, g.devServer]), [['Google Chrome', 59, 5900, false], ['wrangler/workerd', 2, 1200, true]]);
  assert.equal(alsoRunning(rows, { minMb: 2000 }).length, 0);
  assert.equal(alsoRunningLine(list), 'also running: Google Chrome (59 processes, 5900 MB), wrangler/workerd [dev server] (2 processes, 1200 MB)');
  assert.equal(alsoRunningLine([]), '');
});

test('the refusal and the stop sentences carry what the callers look for: "memory pressure high, wait" with the reasons and "also running"; "stopped by the memory guard", the biggest process and "NOT a test failure"', () => {
  const r = refusalText({ reasons: ['compressed memory 9000 MB is over 8192 MB (FORGE_HEAVY_COMPRESSED_MB)'], also: 'also running: wrangler/workerd [dev server] (2 processes, 1200 MB)', what: 'drain-matrix' });
  assert.match(r.split('\n')[0], /^heavy-guard: memory pressure high, wait \(drain-matrix\): compressed memory 9000 MB/);
  assert.match(r, /heavy-guard: also running: wrangler\/workerd \[dev server\]/);
  assert.match(r, /nothing was started/);
  assert.ok(!/also running/.test(refusalText({ reasons: ['x'], also: '', what: 'w' })), 'no line when nothing is big');
  const tree = treeStats(rows, [100]);
  const s = stopText({ what: 'mutation pass', reason: 'its process tree holds 7000 MB, over the 6144 MB cap (FORGE_HEAVY_RSS_MB)', tree, mem: { compressedMb: 9000, swapUsedMb: null } });
  assert.match(s, /stopped by the memory guard \(mutation pass\)/);
  assert.match(s, /Biggest process in the tree: pid 103, 600 MB, \/usr\/local\/bin\/node -e hog/);
  assert.match(s, /compressed 9000 MB, swap used unknown/);
  assert.match(s, /NOT a test failure/);
  assert.match(s, /exit code 76/);
});

test('createGuard: feeds the rule from a process table the caller already has; the system numbers are read at most every sysEveryMs (not on every tick); a trip carries the text; the tree cap needs no system reading to fire', () => {
  let clock = 0, reads = 0, mem = { compressedMb: 1000, swapUsedMb: 0 };
  const g = createGuard({ readMem: () => { reads++; return mem; }, what: 'x', limits: limitsFromEnv({ FORGE_HEAVY_RSS_MB: '5000' }), now: () => clock });
  assert.equal(g.tick(rows, [100]), null);
  assert.equal(reads, 1);
  clock = 500; assert.equal(g.tick(rows, [100]), null); clock = 1000; assert.equal(g.tick(rows, [100]), null);
  assert.equal(reads, 1, 'not read again before 2000 ms');
  clock = 2000; mem = { compressedMb: 11000, swapUsedMb: 0 };
  const hit = g.tick(rows, [100]);
  assert.match(hit.reason, /compressed memory is 11000 MB/);
  assert.match(hit.text, /stopped by the memory guard \(x\)/);
  assert.equal(hit.tree.count, 4);
  const small = createGuard({ readMem: () => ({}), what: 'y', limits: limitsFromEnv({ FORGE_HEAVY_RSS_MB: '500' }), now: () => 0 });
  assert.match(small.tick(rows, [100]).reason, /process tree holds 1002 MB, over the 500 MB cap/);
});

test('the numbers in the header of scripts/heavy-guard.sh are the numbers of DEFAULT_LIMITS (one table, no drift)', () => {
  const header = fs.readFileSync(path.join(import.meta.dirname, 'heavy-guard.sh'), 'utf8').split('\n').filter((l) => l.startsWith('#')).join('\n');
  const rowFor = (label, value, variable) => assert.match(header, new RegExp(`${label}\\s+${value}\\s*(MB|%|ms|s|pages/s)\\s+${variable}`), `${label}: ${value} ${variable}`);
  rowFor('tree cap', DEFAULT_LIMITS.rssMb, 'FORGE_HEAVY_RSS_MB');
  rowFor('refuse: compressed', DEFAULT_LIMITS.compressedRefuseMb, 'FORGE_HEAVY_COMPRESSED_MB');
  rowFor('refuse: swap used', DEFAULT_LIMITS.swapRefuseMb, 'FORGE_HEAVY_SWAP_MB');
  rowFor('refuse: free percentage', DEFAULT_LIMITS.freePctMin, 'FORGE_HEAVY_FREE_PCT');
  rowFor('stop: compressed', DEFAULT_LIMITS.compressedKillMb, 'FORGE_HEAVY_KILL_COMPRESSED_MB');
  rowFor('stop: swap used', DEFAULT_LIMITS.swapKillMb, 'FORGE_HEAVY_KILL_SWAP_MB');
  rowFor('look every', DEFAULT_LIMITS.pollMs, 'FORGE_HEAVY_POLL_MS');
  rowFor('named in "also running"', DEFAULT_LIMITS.alsoRunningMb, 'FORGE_HEAVY_ALSO_MB');
  // 2026-11-26-1042z (deliberate): the four numbers of the new start rule, and the variable that names a sample log
  rowFor('refuse: swap growth', DEFAULT_LIMITS.swapGrowMb, 'FORGE_HEAVY_SWAP_GROW_MB');
  rowFor('swap growth window', DEFAULT_LIMITS.swapWindowS, 'FORGE_HEAVY_SWAP_WINDOW_S');
  rowFor('refuse: swap-ins', DEFAULT_LIMITS.swapinPagesPerS, 'FORGE_HEAVY_SWAPIN_PPS');
  rowFor('second sample after', DEFAULT_LIMITS.sampleGapS, 'FORGE_HEAVY_SAMPLE_GAP_S');
  assert.match(header, /FORGE_HEAVY_SAMPLE_LOG/);
});

// ---- 2026-11-26-1042z (deliberate): a swap LEVEL alone no longer refuses a start ------------------------------------------------------------------------------------------------------------------------------------------------
test('1042z: machineSnapshot reads the `Swapins:` counter of vm_stat (pages swapped in since the boot); a vm_stat without that line, or none, says null', () => {
  const withCounter = `${VM_STAT}Swapins:                                  613767.\nSwapouts:                                1050327.\n`;
  assert.equal(machineSnapshot({ vmStat: withCounter }).swapins, 613767);
  assert.equal(machineSnapshot({ vmStat: VM_STAT }).swapins, null, 'no such line: unknown, not 0');
  assert.equal(machineSnapshot({}).swapins, null);
});

const at = (h, m, s) => new Date(2026, 10, 26, h, m, s).getTime();   // the sampler writes the LOCAL time without a zone
const LOG = [
  'time\tcompressor_mb\tswap_used_mb\tfree_mb\tchrome_rss_mb',
  '2026-11-26T12:58:50\t2400\t900\t900\t1',
  '2026-11-26T12:59:10\t2400\t1700\t900\t1',
  '2026-11-26T12:59:30\t2400\t\t900\t1',
  '2026-11-26T12:59:50\t2400\t2000\t900\t1',
  '2026-11-26T13:00:30\t2400\t9999\t900\t1',
  '2026-11-26T13:00:00\t2400\t22',
].join('\n');
test('1042z: sampleLogPoints takes the time and the swap column of the sampler\'s file; the header, a row with no swap figure and a half-written last line are dropped', () => {
  assert.deepEqual(core.sampleLogPoints(LOG), [{ atMs: at(12, 58, 50), swapUsedMb: 900 }, { atMs: at(12, 59, 10), swapUsedMb: 1700 }, { atMs: at(12, 59, 50), swapUsedMb: 2000 }, { atMs: at(13, 0, 30), swapUsedMb: 9999 }]);
  assert.deepEqual(core.sampleLogPoints(''), []);
});

test('1042z: swapTrend: growth is the latest swap minus the LOWEST in the window; the log counts only with 2 or more samples inside the window; the threshold is scaled to the time the history covers; swap-ins per second come from the two readings', () => {
  const lim = limitsFromEnv({});
  const two = core.swapTrend({ first: { swapUsedMb: 2300, swapins: 1000 }, second: { swapUsedMb: 2300, swapins: 3000 }, gapS: 10, atMs: at(13, 0, 0) }, lim);
  assert.deepEqual([two.growMb, two.spanS, Math.floor(two.thresholdMb), two.swapinsPerS], [0, 10, 42, 200]);
  // the log: 12:59:10 and 12:59:50 are inside the 60 s before 13:00:10; 12:58:50 and 13:00:30 are not
  const logged = core.swapTrend({ first: { swapUsedMb: 2300 }, second: { swapUsedMb: 2300 }, gapS: 10, atMs: at(13, 0, 0), logPoints: core.sampleLogPoints(LOG) }, lim);
  assert.deepEqual([logged.growMb, logged.spanS, logged.thresholdMb, logged.swapinsPerS], [600, 60, 256, null]);
  // one sample inside the window is no log history: the two readings alone
  const one = core.swapTrend({ first: { swapUsedMb: 2300 }, second: { swapUsedMb: 2300 }, gapS: 10, atMs: at(13, 0, 0), logPoints: [{ atMs: at(12, 59, 50), swapUsedMb: 100 }] }, lim);
  assert.deepEqual([one.growMb, one.spanS], [0, 10]);
  // it fell: that is not growth. It dipped and came back: that is
  assert.equal(core.swapTrend({ first: { swapUsedMb: 2900 }, second: { swapUsedMb: 2300 }, gapS: 10, atMs: 0 }, lim).growMb, 0);
  const dip = core.swapTrend({ first: { swapUsedMb: 2300 }, second: { swapUsedMb: 2300 }, gapS: 10, atMs: at(13, 0, 0), logPoints: [{ atMs: at(12, 59, 20), swapUsedMb: 2300 }, { atMs: at(12, 59, 40), swapUsedMb: 1900 }] }, lim);
  assert.equal(dip.growMb, 400);
  // no second reading and no log: no history. A counter that went backwards (a reboot) is unknown
  assert.equal(core.swapTrend({ first: { swapUsedMb: 2300, swapins: 5 }, second: { swapUsedMb: null }, gapS: 10, atMs: 0 }, lim).growMb, null);
  assert.equal(core.swapTrend({ first: { swapUsedMb: 2300, swapins: 500 }, second: { swapUsedMb: 2300, swapins: 5 }, gapS: 10, atMs: 0 }, lim).swapinsPerS, null);
  // a gap longer than the window does not raise the threshold
  assert.equal(core.swapTrend({ first: { swapUsedMb: 2300 }, second: { swapUsedMb: 2300 }, gapS: 120, atMs: 0 }, lim).thresholdMb, 256);
});

test('1042z: refusalReasons with a history: a swap level refuses only with a sign (growth, swap-ins, compressor over half its limit, low free percentage); each sign is named; on a limit is not over it', () => {
  const lim = limitsFromEnv({});
  const flat = { growMb: 0, spanS: 60, thresholdMb: 256, swapinsPerS: 0 };
  const mem = { compressedMb: 2426, swapUsedMb: 2300, freePct: 81 };
  assert.deepEqual(refusalReasons(mem, lim, flat), []);
  assert.deepEqual(refusalReasons(mem, lim, { ...flat, growMb: 256, swapinsPerS: 200 }), [], 'exactly on the growth and swap-in limits');
  assert.deepEqual(refusalReasons({ ...mem, compressedMb: 4096, freePct: 35 }, lim, flat), [], 'exactly half the compressor limit, exactly the free minimum');
  assert.deepEqual(refusalReasons(mem, lim, { ...flat, growMb: 257 }), ['swap used 2300 MB is over 2048 MB (FORGE_HEAVY_SWAP_MB), and it grew +257 MB in 60 s (more than +256 MB: FORGE_HEAVY_SWAP_GROW_MB per FORGE_HEAVY_SWAP_WINDOW_S)']);
  assert.deepEqual(refusalReasons(mem, lim, { ...flat, swapinsPerS: 200.2 }), ['swap used 2300 MB is over 2048 MB (FORGE_HEAVY_SWAP_MB), and swap-ins run at 201 pages/s (more than 200: FORGE_HEAVY_SWAPIN_PPS)']);
  assert.deepEqual(refusalReasons({ ...mem, compressedMb: 4097 }, lim, flat), ['swap used 2300 MB is over 2048 MB (FORGE_HEAVY_SWAP_MB), and compressed memory 4097 MB is over 4096 MB (half of the FORGE_HEAVY_COMPRESSED_MB limit)']);
  assert.deepEqual(refusalReasons({ ...mem, freePct: 34 }, lim, flat), ['swap used 2300 MB is over 2048 MB (FORGE_HEAVY_SWAP_MB), and the free percentage 34 % is under 35 %', 'memory_pressure free percentage 34 % is under 35 % (FORGE_HEAVY_FREE_PCT)']);
  // half of the limit IN FORCE
  assert.deepEqual(refusalReasons({ ...mem, compressedMb: 4097 }, limitsFromEnv({ FORGE_HEAVY_COMPRESSED_MB: '9000' }), flat), []);
  // two signs, both named
  assert.match(refusalReasons({ ...mem, compressedMb: 5000 }, lim, { ...flat, growMb: 600 }).join(), /it grew \+600 MB in 60 s .*, and compressed memory 5000 MB is over 4096 MB/);
  // a history that says nothing: the level, as before, and why
  assert.deepEqual(refusalReasons(mem, lim, { growMb: null, swapinsPerS: null, why: 'nothing to compare with' }), ['swap used 2300 MB is over 2048 MB (FORGE_HEAVY_SWAP_MB), and nothing says whether it is growing (nothing to compare with): refused on the level']);
});

test('1042z (8): every KILL limit is what it was: tree 6144, compressor 10240, swap 4096, also with the new variables set and with the start level raised to 3072', () => {
  for (const env of [{}, { FORGE_HEAVY_SWAP_GROW_MB: '9999', FORGE_HEAVY_SWAP_WINDOW_S: '1', FORGE_HEAVY_SWAPIN_PPS: '999999', FORGE_HEAVY_SAMPLE_GAP_S: '1' }, { FORGE_HEAVY_SWAP_MB: '3072' }]) {
    const lim = limitsFromEnv(env);
    assert.deepEqual([lim.rssMb, lim.compressedKillMb, lim.swapKillMb], [6144, 10240, 4096], JSON.stringify(env));
    assert.deepEqual([lim.compressedRefuseMb, lim.freePctMin], [8192, 35]);
    assert.equal(stopReason({ treeMb: 6144, mem: { compressedMb: 10240, swapUsedMb: 4096 } }, lim), null);
    assert.match(stopReason({ treeMb: 6145, mem: {} }, lim), /over the 6144 MB cap/);
    assert.match(stopReason({ treeMb: 1, mem: { compressedMb: 10241 } }, lim), /over 10240 MB/);
    assert.match(stopReason({ treeMb: 1, mem: { swapUsedMb: 4097 } }, lim), /over 4096 MB/);
  }
});
