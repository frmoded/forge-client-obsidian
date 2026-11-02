// 2026-10-31-1125 - the memory model of our own heavy tooling (the mutation runner, the drain matrix, the real-Chrome measures). The driver ran out of application memory while CC was draining, again, after the orphan leak was fixed:
// the suspect is the tools' OWN PEAK, so this file is the one place that reads memory (ps, vm_stat, memory_pressure), sorts processes into families, turns a budget into concurrency, and decides when to pause. Pure functions over text
// and numbers, so every rule is tested with stub readings; the thin readers at the bottom are the only functions that run a command.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';

// ---- processes ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

/** `ps -Ao pid,ppid,rss,command` -> [{pid, ppid, rssKb, command}] (the header line and anything unparsable are dropped). */
export function parsePs(text) {
  const rows = [];
  for (const line of String(text).split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (m) rows.push({ pid: Number(m[1]), ppid: Number(m[2]), rssKb: Number(m[3]), command: m[4] });
  }
  return rows;
}

export const FAMILIES = ['runner', 'matrix', 'chrome', 'pytest', 'obsidian', 'claude', 'node-other', 'other'];

/** Which family a process belongs to. `rows` (all processes) lets a child be counted with the tool that started it: a `node --test` below mutate.mjs is the RUNNER's, below drain-matrix.sh the MATRIX's. */
export function familyOf(row, byPid = new Map()) {
  const c = row.command;
  if (/\bheadless\b/.test(c) && /Google Chrome|chrome|chromium/i.test(c) || /cdp-[A-Za-z0-9]+/.test(c) && /Chrome/i.test(c)) return 'chrome';
  if (/pytest|python.* -m pytest/.test(c)) return 'pytest';
  if (/Obsidian/.test(c)) return 'obsidian';
  if (/Claude\.app|\/claude\b|claude-code|\bclaude$/i.test(c)) return 'claude';
  if (/scripts\/dev\/mutate\.mjs|forge-mutate-/.test(c)) return 'runner';
  if (/drain-matrix/.test(c)) return 'matrix';
  // a child counts with the nearest tool above it
  let p = byPid.get(row.ppid), hops = 0;
  while (p && hops++ < 12) {
    if (/scripts\/dev\/mutate\.mjs|forge-mutate-/.test(p.command)) return 'runner';
    if (/drain-matrix/.test(p.command)) return 'matrix';
    p = byPid.get(p.ppid);
  }
  if (/\bnode\b/.test(c)) return 'node-other';
  return 'other';
}

/** One sample: MB per family (kilobytes of resident memory summed, rounded). */
export function sumByFamily(rows) {
  const byPid = new Map(rows.map((r) => [r.pid, r]));
  const out = Object.fromEntries(FAMILIES.map((f) => [f, 0]));
  const count = Object.fromEntries(FAMILIES.map((f) => [f, 0]));
  for (const r of rows) { const f = familyOf(r, byPid); out[f] += r.rssKb; count[f] += 1; }
  return { mb: Object.fromEntries(FAMILIES.map((f) => [f, Math.round(out[f] / 1024)])), count };
}

// ---- the system's own reading ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------

/** `vm_stat` -> { pageBytes, freeMb, inactiveMb, speculativeMb, wiredMb, availableMb }. macOS counts cached pages as used: what a new process can really have is free + inactive + speculative + purgeable. */
export function parseVmStat(text) {
  const t = String(text);
  const page = Number(/page size of (\d+) bytes/.exec(t)?.[1] ?? 16384);
  const pages = (name) => Number(new RegExp(`${name}:\\s+(\\d+)`).exec(t)?.[1] ?? 0);
  const mb = (n) => Math.round((n * page) / 1048576);
  const free = mb(pages('Pages free')), inactive = mb(pages('Pages inactive')), speculative = mb(pages('Pages speculative')), purgeable = mb(pages('Pages purgeable')), wired = mb(pages('Pages wired down'));
  const fileBacked = mb(pages('File-backed pages')), anonymous = mb(pages('Anonymous pages')), compressor = mb(pages('Pages occupied by compressor'));
  // 2026-11-02-1125: "free + inactive + speculative" (what this said until the machine died with 6.4 GB of it 'available') counts INACTIVE ANONYMOUS memory, which with swap off (the driver's machine: `vm.swapusage` 0) can only
  // be compressed, never evicted: measured idle 2026-11-02, 9.4 GB by that sum against about 3.8 GB that could really be had. What can be given back without paging is free + speculative + purgeable + file-backed pages
  // (half of them: the other half is in use); an old vm_stat without the file-backed line falls back to half of inactive.
  const evictable = Math.floor((fileBacked > 0 ? fileBacked : inactive) / 2);
  return { pageBytes: page, freeMb: free, inactiveMb: inactive, speculativeMb: speculative, purgeableMb: purgeable, wiredMb: wired, fileBackedMb: fileBacked, anonymousMb: anonymous, compressorMb: compressor, availableMb: free + speculative + purgeable + evictable, cachedInclusiveMb: free + inactive + speculative };
}

/** `memory_pressure -Q` -> the system-wide free percentage (0..100), or null. */
export function parseMemoryPressure(text) {
  const m = /free percentage:\s*(\d+)%/.exec(String(text));
  return m ? Number(m[1]) : null;
}

// ---- the budget -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

/**
 * FORGE_MEM_BUDGET_MB, else half of physical RAM - but never more than what the machine can give back right now (`availableMb`, the honest figure of parseVmStat) minus 1 GB to spare - and never below 2048.
 * 2026-11-02: half of the RAM (12 GB) was more than this machine had free with its apps open (about 4 GB), which is how a pass that kept to "its budget" still took the desktop apps and the machine down.
 */
export function memBudgetMb(env = process.env, totalBytes = os.totalmem(), availableMb = 0) {
  const given = Number(env.FORGE_MEM_BUDGET_MB);
  if (Number.isFinite(given) && given > 0) return Math.max(256, Math.floor(given));
  const half = Math.floor(totalBytes / 1048576 / 2);
  return Math.max(2048, availableMb > 0 ? Math.min(half, availableMb - 1024) : half);
}

/** The heap cap of a mutation test child: FORGE_TEST_HEAP_MB, else 1024 (a mutant that needs more is killed and REPORTED as such). */
export const DEFAULT_TEST_HEAP_MB = 1024;
export const testHeapMb = (env = process.env) => (Number(env.FORGE_TEST_HEAP_MB) > 0 ? Number(env.FORGE_TEST_HEAP_MB) : DEFAULT_TEST_HEAP_MB);
/**
 * The most resident memory (MB) one test process tree may hold. --max-old-space-size bounds only the JS heap: a mutant that grows memory outside it (buffers, DOM-like object graphs in a harness, wasm) was measured at 3.7 GB and
 * still growing under a 1 GB heap cap (2026-10-31, description-apply.ts line 82); six of those at once is what froze this machine. The runner kills such a tree at this cap and reports it as killed by the memory cap.
 * Default 1.5 x the heap cap; FORGE_TEST_RSS_MB overrides.
 */
export const MIN_DERIVED_RSS_CAP_MB = 512;
// the derived cap has a floor: a plain `node --test` tree weighs 115-200 MB by itself (measured 2026-11-02, when FORGE_TEST_HEAP_MB=64 derived a 96 MB cap and the watchdog killed even the unmutated baseline run); an explicit FORGE_TEST_RSS_MB is taken as given
export const testRssCapMb = (env = process.env) => (Number(env.FORGE_TEST_RSS_MB) > 0 ? Number(env.FORGE_TEST_RSS_MB) : Math.max(MIN_DERIVED_RSS_CAP_MB, Math.round(testHeapMb(env) * 1.5)));

/** Of the process trees led by `roots` (pids), those whose summed resident memory is over `capMb`: [{ root, mb }]. `rows` come from parsePs (the root's own row, its descendants). */
export function groupsOverCap(rows, roots, capMb) {
  const children = new Map(), byPid = new Map();
  for (const r of rows) { byPid.set(r.pid, r); (children.get(r.ppid) ?? children.set(r.ppid, []).get(r.ppid)).push(r.pid); }
  const over = [];
  for (const root of roots) {
    if (!byPid.has(root)) continue;
    let kb = 0;
    const seen = new Set([root]);
    for (const queue = [root]; queue.length > 0;) {
      const pid = queue.shift();
      kb += byPid.get(pid)?.rssKb ?? 0;
      for (const c of children.get(pid) ?? []) if (c > 1 && !seen.has(c)) { seen.add(c); queue.push(c); }
    }
    const mb = Math.round(kb / 1024);
    if (mb > capMb) over.push({ root, mb });
  }
  return over;
}

/**
 * `jobs` mutants at once, each running `testConcurrency` test files at once, each a child that may grow to `heapMb`: the children are what costs memory, so the pair (j, t) with j <= jobs and t <= testConcurrency is chosen to
 * keep as many children as FIT in `budgetMb` (most of the throughput that the budget allows), preferring more mutants at once on a tie (a mutant dies at its first red file: parallel mutants kill sooner than parallel
 * files). Never below one of each. Returns the numbers to use and whether anything was lowered.
 */
export function capConcurrency({ budgetMb, heapMb, jobs, testConcurrency }) {
  const fit = Math.max(1, Math.floor(budgetMb / heapMb));
  const J = Math.max(1, jobs), T = Math.max(1, testConcurrency);
  let best = { j: 1, t: 1 };
  for (let j = J; j >= 1; j--) for (let t = T; t >= 1; t--) if (j * t <= fit && (j * t > best.j * best.t || (j * t === best.j * best.t && j > best.j))) best = { j, t };
  return { jobs: best.j, testConcurrency: best.t, children: best.j * best.t, fit, lowered: best.j !== jobs || best.t !== testConcurrency };
}

/** How many `node --test` files one matrix leg may run at once, given the budget, the heap cap, and how many legs run together (node's own default is every core minus one). */
export function matrixFileConcurrency({ budgetMb, heapMb, legs, cores }) {
  const own = Math.max(1, cores - 1);
  const fit = Math.max(1, Math.floor(budgetMb / heapMb / Math.max(1, legs)));
  return Math.min(own, fit);
}

// ---- the gate: do not START more work while the machine is short of memory ------------------------------------------------------------------------------------------------------------------------------------

/**
 * `read()` answers { availableMb, freePercent } now. `wait()` resolves at once when there is room (available >= thresholdMb and, when known, the free percentage >= minFreePercent) and otherwise polls, saying so
 * ONCE per pause on `say`, until there is. `sleep(ms)` is injected (the tests use a fake clock). It never rejects; `maxWaitMs` ends a pause that never lifts (a machine that is always short must not hang the run: the
 * run goes on and says so).
 */
export function createMemoryGate({ read, thresholdMb, minFreePercent = 8, sleep, say = () => {}, pollMs = 2000, maxWaitMs = 10 * 60_000 }) {
  const short = (r) => r.availableMb < thresholdMb || (r.freePercent !== null && r.freePercent !== undefined && r.freePercent < minFreePercent);
  const stats = { pauses: 0, waitedMs: 0, gaveUp: 0 };
  return {
    stats,
    async wait() {
      let r = await read();
      if (!short(r)) return false;
      stats.pauses++;
      say(`mem-gate: paused, ${r.availableMb} MB available (need ${thresholdMb})${r.freePercent != null ? `, system free ${r.freePercent}%` : ''}: not starting new test processes until memory comes back`);
      let waited = 0;
      while (short(r) && waited < maxWaitMs) { await sleep(pollMs); waited += pollMs; r = await read(); }
      stats.waitedMs += waited;
      if (short(r)) { stats.gaveUp++; say(`mem-gate: still short after ${Math.round(waited / 1000)} s; going on (the run is slower than it should be, not stuck)`); }
      else say(`mem-gate: resumed after ${Math.round(waited / 1000)} s (${r.availableMb} MB available)`);
      return true;
    },
  };
}

// ---- samples: a CSV line each, a summary at the end -----------------------------------------------------------------------------------------------------------------------------------------------------------

export const CSV_HEADER = ['t_s', 'minute', ...FAMILIES.map((f) => `${f}_mb`), ...FAMILIES.map((f) => `${f}_n`), 'tools_mb', 'available_mb', 'free_pct'].join(',');
/** The families that are OUR tooling's footprint (the runner, the matrix, Chrome for the measures, pytest and any other node we started). */
export const TOOL_FAMILIES = ['runner', 'matrix', 'chrome', 'pytest', 'node-other'];
/** One sample: { tSeconds, mb:{family}, count:{family}, availableMb, freePercent } -> a CSV line (no newline). */
export function csvLine(sample) {
  const tools = TOOL_FAMILIES.reduce((n, f) => n + (sample.mb[f] ?? 0), 0);
  return [sample.tSeconds, Math.floor(sample.tSeconds / 60), ...FAMILIES.map((f) => sample.mb[f] ?? 0), ...FAMILIES.map((f) => sample.count[f] ?? 0), tools, sample.availableMb ?? '', sample.freePercent ?? ''].join(',');
}
/** The peak of each family (MB), the minute it happened in, the peak of the tools together, and the lowest available memory seen. */
export function summarizeSamples(samples) {
  const peak = {}, at = {};
  for (const f of FAMILIES) { peak[f] = 0; at[f] = null; }
  let toolsPeak = 0, toolsAt = null, minAvailable = null, minAt = null;
  for (const s of samples) {
    const minute = Math.floor(s.tSeconds / 60);
    for (const f of FAMILIES) if ((s.mb[f] ?? 0) > peak[f]) { peak[f] = s.mb[f]; at[f] = minute; }
    const tools = TOOL_FAMILIES.reduce((n, f) => n + (s.mb[f] ?? 0), 0);
    if (tools > toolsPeak) { toolsPeak = tools; toolsAt = minute; }
    if (s.availableMb != null && (minAvailable === null || s.availableMb < minAvailable)) { minAvailable = s.availableMb; minAt = minute; }
  }
  return { samples: samples.length, peak, at, toolsPeak, toolsAt, minAvailable, minAt };
}
/** The summary as the lines a report quotes. */
export function summaryLines(sum) {
  const lines = [`mem-watch: ${sum.samples} samples`];
  for (const f of FAMILIES) if (sum.peak[f] > 0) lines.push(`  ${f.padEnd(10)} peak ${String(sum.peak[f]).padStart(6)} MB at minute ${sum.at[f]}`);
  lines.push(`  tools together  peak ${sum.toolsPeak} MB at minute ${sum.toolsAt}`);
  lines.push(`  lowest available memory ${sum.minAvailable ?? 'unknown'} MB${sum.minAt !== null ? ` at minute ${sum.minAt}` : ''}`);
  return lines;
}

// ---- the readers: the only functions here that run a command -------------------------------------------------------------------------------------------------------------------------------------------------

const run = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, maxBuffer: 32 << 20 }); } catch { return ''; } };
export const readPs = () => parsePs(run('ps', ['-Ao', 'pid,ppid,rss,command']));
/** The machine's memory now: { availableMb, freePercent } (macOS: vm_stat + memory_pressure; elsewhere os.freemem and no percentage). */
export function readSystemMemory(env = process.env) {
  // a test hook: FORGE_MEM_READ_FILE names a JSON file { availableMb, freePercent } that stands in for the machine (a fake low-memory reading)
  if (env.FORGE_MEM_READ_FILE) { try { const j = JSON.parse(fs.readFileSync(env.FORGE_MEM_READ_FILE, 'utf8')); return { availableMb: Number(j.availableMb), freePercent: j.freePercent ?? null }; } catch { /* unreadable: the real reading */ } }
  if (process.platform === 'darwin') {
    const vm = parseVmStat(run('vm_stat'));
    if (vm.availableMb > 0) return { availableMb: vm.availableMb, freePercent: parseMemoryPressure(run('memory_pressure', ['-Q'])) };
  }
  return { availableMb: Math.round(os.freemem() / 1048576), freePercent: null };
}
