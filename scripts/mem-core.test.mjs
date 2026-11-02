// 2026-10-31-1125 - the memory model of the tooling (scripts/dev/mem-core.mjs): parsing of the three system readings, the process families, the budget, the concurrency cap and the gate that pauses new work. Stub readings and a
// fake clock: no test here allocates memory or runs a command. (The sampler and the lock run real processes in mem-watch.test.mjs and heavy-lock.test.mjs.)
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_TEST_HEAP_MB, capConcurrency, createMemoryGate, familyOf, groupsOverCap, matrixFileConcurrency, memBudgetMb, parseMemoryPressure, parsePs, parseVmStat, sumByFamily, testHeapMb, testRssCapMb } from './dev/mem-core.mjs';

const PS = `  PID  PPID    RSS COMMAND
    1     0  20864 /sbin/launchd
  500     1  60000 /usr/local/bin/node scripts/dev/mutate.mjs --file src/a.ts
  501   500 900000 /usr/local/bin/node --test --test-reporter=tap src/a.test.ts
  502   501 400000 /usr/local/bin/node --test-child-worker
  600     1  50000 bash scripts/drain-matrix.sh
  601   600 800000 node --test src/b.test.ts
  700     1 300000 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --headless=new --user-data-dir=/var/folders/x/cdp-AbC123
  800     1 123456 /Library/Frameworks/Python.framework/bin/python3 -m pytest tests/music -q
  900     1 700000 /Applications/Obsidian.app/Contents/MacOS/Obsidian
  901     1 950000 /Applications/Claude.app/Contents/Frameworks/Claude Helper
  950     1  40000 node /somewhere/else.js
  960     1  10000 /usr/bin/ssh-agent`;

test('parsePs reads pid, ppid, rss (kB) and the whole command; the header and junk lines are dropped', () => {
  const rows = parsePs(PS + '\nnot a row\n');
  assert.equal(rows.length, 12);
  assert.deepEqual(rows[1], { pid: 500, ppid: 1, rssKb: 60000, command: '/usr/local/bin/node scripts/dev/mutate.mjs --file src/a.ts' });
});

test('families: the runner and what it started, the matrix and what it started, headless Chrome, pytest, Obsidian, Claude, any other node, the rest', () => {
  const rows = parsePs(PS), byPid = new Map(rows.map((r) => [r.pid, r]));
  const f = (pid) => familyOf(byPid.get(pid), byPid);
  assert.equal(f(500), 'runner'); assert.equal(f(501), 'runner', 'a test child of the runner'); assert.equal(f(502), 'runner', 'and ITS child');
  assert.equal(f(600), 'matrix'); assert.equal(f(601), 'matrix');
  assert.equal(f(700), 'chrome'); assert.equal(f(800), 'pytest'); assert.equal(f(900), 'obsidian'); assert.equal(f(901), 'claude');
  assert.equal(f(950), 'node-other'); assert.equal(f(960), 'other');
});

test('sumByFamily adds resident memory per family in MB and counts the processes', () => {
  const s = sumByFamily(parsePs(PS));
  assert.equal(s.mb.runner, Math.round((60000 + 900000 + 400000) / 1024)); assert.equal(s.count.runner, 3);
  assert.equal(s.mb.matrix, Math.round((50000 + 800000) / 1024)); assert.equal(s.mb.chrome, Math.round(300000 / 1024));
  assert.equal(s.mb.claude, Math.round(950000 / 1024)); assert.equal(s.count.other, 2);
});

test('vm_stat: pages become MB by the page size it states; available = free + speculative + purgeable + HALF the file-backed pages - inactive anonymous memory is not available when swap is off (the 2026-11-02 crash: 6.4 GB "available", desktop apps killed)', () => {
  const text = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                               43636.
Pages active:                            513558.
Pages inactive:                          543529.
Pages speculative:                        15319.
Pages wired down:                        157842.
Pages purgeable:                           4289.
File-backed pages:                       362420.
Anonymous pages:                         709986.
Pages occupied by compressor:            236863.`;
  const vm = parseVmStat(text);
  const mb = (n) => Math.round((n * 16384) / 1048576);
  assert.equal(vm.freeMb, mb(43636)); assert.equal(vm.inactiveMb, mb(543529)); assert.equal(vm.compressorMb, mb(236863)); assert.equal(vm.anonymousMb, mb(709986));
  assert.equal(vm.availableMb, mb(43636) + mb(15319) + mb(4289) + Math.floor(mb(362420) / 2));
  assert.ok(vm.availableMb < 4500 && vm.cachedInclusiveMb > 9000, `${vm.availableMb} honest vs ${vm.cachedInclusiveMb} counting inactive anonymous memory`);
  assert.equal(parseVmStat(text.replace(/File-backed pages:.*\n/, '')).availableMb, mb(43636) + mb(15319) + mb(4289) + Math.floor(mb(543529) / 2), 'an old vm_stat without the file-backed line falls back to half of inactive');
  assert.equal(parseVmStat('nothing').availableMb, 0);
});

test('memory_pressure -Q: the system-wide free percentage, or null when it says nothing', () => {
  assert.equal(parseMemoryPressure('The system has 25769803776 (1572864 pages with a page size of 16384).\nSystem-wide memory free percentage: 86%\n'), 86);
  assert.equal(parseMemoryPressure('garbage'), null);
});

test('the budget: FORGE_MEM_BUDGET_MB when given, else half of physical RAM, never below 2048; the heap cap of a mutation child defaults to 1024', () => {
  const GB = 1073741824;
  assert.equal(memBudgetMb({}, 24 * GB), 12288); assert.equal(memBudgetMb({}, 2 * GB), 2048, 'a small machine still gets the floor');
  assert.equal(memBudgetMb({}, 24 * GB, 20000), 12288, 'plenty free: half the RAM'); assert.equal(memBudgetMb({}, 24 * GB, 3800), 2776, 'apps open: what can really be had, less 1 GB'); assert.equal(memBudgetMb({}, 24 * GB, 1500), 2048, 'the floor still holds'); assert.equal(memBudgetMb({ FORGE_MEM_BUDGET_MB: '9000' }, 24 * GB, 1500), 9000, 'the override wins');
  assert.equal(memBudgetMb({ FORGE_MEM_BUDGET_MB: '6000' }, 24 * GB), 6000); assert.equal(memBudgetMb({ FORGE_MEM_BUDGET_MB: 'x' }, 24 * GB), 12288, 'a bad value is ignored');
  assert.equal(DEFAULT_TEST_HEAP_MB, 1024); assert.equal(testHeapMb({}), 1024); assert.equal(testHeapMb({ FORGE_TEST_HEAP_MB: '512' }), 512); assert.equal(testHeapMb({ FORGE_TEST_HEAP_MB: '0' }), 1024);
});

test('capConcurrency: children (jobs x testConcurrency) x heap cap fit the budget; the pair that keeps the most children that fit (more mutants at once on a tie); never below one of each; nothing lowered when it already fits', () => {
  assert.deepEqual(capConcurrency({ budgetMb: 12288, heapMb: 1024, jobs: 8, testConcurrency: 2 }), { jobs: 6, testConcurrency: 2, children: 12, fit: 12, lowered: true }, '16 children do not fit 12 GB at 1 GB each');
  assert.equal(capConcurrency({ budgetMb: 12288, heapMb: 1024, jobs: 4, testConcurrency: 2 }).lowered, false);
  assert.deepEqual(capConcurrency({ budgetMb: 4096, heapMb: 1024, jobs: 8, testConcurrency: 2 }), { jobs: 4, testConcurrency: 1, children: 4, fit: 4, lowered: true }, '4 children fit: 4 x 1 and 2 x 2 tie, more mutants at once wins');
  assert.deepEqual(capConcurrency({ budgetMb: 100, heapMb: 1024, jobs: 8, testConcurrency: 2 }), { jobs: 1, testConcurrency: 1, children: 1, fit: 1, lowered: true }, 'at least one');
});

test('matrixFileConcurrency: node\'s own default is every core minus one; the budget, shared by the legs that run together, lowers it', () => {
  assert.equal(matrixFileConcurrency({ budgetMb: 12288, heapMb: 1024, legs: 2, cores: 18 }), 6);
  assert.equal(matrixFileConcurrency({ budgetMb: 65536, heapMb: 1024, legs: 2, cores: 18 }), 17, 'plenty of room: node\'s default');
  assert.equal(matrixFileConcurrency({ budgetMb: 512, heapMb: 1024, legs: 3, cores: 18 }), 1);
});

function fakeClock() { let now = 0; return { sleep: async (ms) => { now += ms; }, now: () => now }; }
test('the gate: no pause when there is room; a pause (said ONCE) while available memory or the free percentage is short, a resume when it comes back, and the pause is counted', async () => {
  const c = fakeClock(); const said = [];
  const readings = [{ availableMb: 500, freePercent: 40 }, { availableMb: 500, freePercent: 40 }, { availableMb: 3000, freePercent: 5 }, { availableMb: 3000, freePercent: 40 }];
  let i = 0;
  const gate = createMemoryGate({ read: async () => readings[Math.min(i++, readings.length - 1)], thresholdMb: 1024, minFreePercent: 8, sleep: c.sleep, say: (s) => said.push(s), pollMs: 1000 });
  assert.equal(await gate.wait(), true, 'it paused');
  assert.equal(c.now(), 3000, 'three polls of 1 s: short, short (low percentage), then room');
  assert.equal(said.length, 2); assert.match(said[0], /^mem-gate: paused, 500 MB available \(need 1024\), system free 40%/); assert.match(said[1], /^mem-gate: resumed after 3 s \(3000 MB available\)/);
  assert.deepEqual(gate.stats, { pauses: 1, waitedMs: 3000, gaveUp: 0 });
  const roomy = createMemoryGate({ read: async () => ({ availableMb: 9000, freePercent: 80 }), thresholdMb: 1024, sleep: c.sleep, say: (s) => said.push(s) });
  const before = said.length; assert.equal(await roomy.wait(), false); assert.equal(said.length, before, 'nothing said, nothing waited');
});

test('the gate never hangs a run: after maxWaitMs it goes on and says so', async () => {
  const c = fakeClock(); const said = [];
  const gate = createMemoryGate({ read: async () => ({ availableMb: 10, freePercent: null }), thresholdMb: 1024, sleep: c.sleep, say: (s) => said.push(s), pollMs: 1000, maxWaitMs: 5000 });
  await gate.wait();
  assert.equal(c.now(), 5000); assert.deepEqual(gate.stats, { pauses: 1, waitedMs: 5000, gaveUp: 1 });
  assert.match(said.at(-1), /^mem-gate: still short after 5 s; going on/);
});

test('testRssCapMb: 1.5 x the heap cap by default (the heap cap does not bound memory outside the JS heap), FORGE_TEST_RSS_MB overrides', () => {
  assert.equal(testRssCapMb({}), 1536);
  assert.equal(testRssCapMb({ FORGE_TEST_HEAP_MB: '512' }), 768);
  assert.equal(testRssCapMb({ FORGE_TEST_HEAP_MB: '64' }), 512, 'a floor: a plain node test tree is 115-200 MB, a 96 MB cap killed the unmutated baseline run'); assert.equal(testRssCapMb({ FORGE_TEST_HEAP_MB: '64', FORGE_TEST_RSS_MB: '96' }), 96, 'an explicit value is taken as given');
  assert.equal(testRssCapMb({ FORGE_TEST_HEAP_MB: '512', FORGE_TEST_RSS_MB: '3000' }), 3000);
  assert.equal(testRssCapMb({ FORGE_TEST_RSS_MB: 'x' }), 1536);
});

test('groupsOverCap: a test group is a root and EVERYTHING under it; the sum of the tree is compared with the cap; groups under the cap and unrelated processes are left alone', () => {
  const rows = [
    { pid: 10, ppid: 1, rssKb: 40_000, command: 'node --test a' }, { pid: 11, ppid: 10, rssKb: 1_800_000, command: 'node child of a' }, { pid: 12, ppid: 11, rssKb: 300_000, command: 'grandchild of a' },
    { pid: 20, ppid: 1, rssKb: 40_000, command: 'node --test b' }, { pid: 21, ppid: 20, rssKb: 200_000, command: 'node child of b' },
    { pid: 30, ppid: 1, rssKb: 9_000_000, command: 'something else' },
  ];
  assert.deepEqual(groupsOverCap(rows, [10, 20], 1536), [{ root: 10, mb: Math.round((40_000 + 1_800_000 + 300_000) / 1024) }]);
  assert.deepEqual(groupsOverCap(rows, [10, 20], 3000), []);
  assert.deepEqual(groupsOverCap(rows, [99], 1), [], 'a root that is gone has no tree');
  assert.deepEqual(groupsOverCap(rows, [], 1), []);
});
