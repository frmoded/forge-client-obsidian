// 2026-11-20-1001z - the pure half of the memory tools (scripts/heavy-mem-report.mjs measures a heavy command, scripts/heavy-guard.sh refuses and stops one). Text in, numbers and sentences out: nothing here runs a
// command or reads the machine, so every rule is tested on fixture text. The readers are scripts/heavy-mem-read.mjs.
//
// WHY (2026-11-20, 13:29): the Mac ran out of application memory and had to be hard restarted. The cron logger's last block: compressed memory 10738 MB (11179 MB a minute before), the free percentage said 42 % (so it is NOT a gate:
// the compressor and the swap are), chrome 5.9 GB in 59 processes, claude 3.1 GB, node 1.4 GB, two bare `node --test ... instant-apply-wiring.test.ts` runs, a wrangler dev server of another project.
//
// THE NUMBERS (every one is overridden by the variable named beside it; the same numbers are in the header of scripts/heavy-guard.sh, and scripts/heavy-guard.test.mjs fails when the two disagree):
import { parsePs, parseSwapUsage, parseMemoryPressure, parseVmStat } from './dev/mem-core.mjs';

export const DEFAULT_LIMITS = Object.freeze({
  rssMb: 6144,                // FORGE_HEAVY_RSS_MB            stop the run when its whole process tree holds more than this (6 GB)
  compressedRefuseMb: 8192,   // FORGE_HEAVY_COMPRESSED_MB     do not START while the memory compressor holds more than this (8 GB)
  swapRefuseMb: 2048,         // FORGE_HEAVY_SWAP_MB           do not START while more swap than this is used (2 GB)
  freePctMin: 35,             // FORGE_HEAVY_FREE_PCT          do not START while `memory_pressure` says the free percentage is under this (one extra signal, never the only one)
  compressedKillMb: 10240,    // FORGE_HEAVY_KILL_COMPRESSED_MB stop the run when the compressor passes this (10 GB: the freeze of 2026-11-20 happened at 10.7 to 11.2 GB, so a limit of 12 GB would never have fired)
  swapKillMb: 4096,           // FORGE_HEAVY_KILL_SWAP_MB      stop the run when used swap passes this (4 GB)
  pollMs: 500,                // FORGE_HEAVY_POLL_MS           how often the tree is looked at (a runaway grows 1 to 3 GB a second)
  sysEveryMs: 2000,           // FORGE_HEAVY_SYS_MS            how often the system numbers (compressor, swap) are read while a run is going
  alsoRunningMb: 500,         // FORGE_HEAVY_ALSO_MB           a program (or family of programs) at least this big is named in the refusal message
});
export const EXIT_REFUSED = 75;     // the guard did not start the command (memory pressure high, wait)
export const EXIT_STOPPED = 76;     // the guard started the command and stopped it (memory): not a test failure

const positive = (v, d) => { const n = Number(v); return v !== undefined && v !== '' && Number.isFinite(n) && n > 0 ? n : d; };
/** The limits in force: the defaults, then the environment, `rssMb` (what a caller wants as ITS tree cap: the matrix, a mutation pass) in between; FORGE_HEAVY_RSS_MB is the user's word and wins over a caller's default. */
export function limitsFromEnv(env = process.env, { rssMb } = {}) {
  const d = DEFAULT_LIMITS;
  const compressedRefuseMb = positive(env.FORGE_HEAVY_COMPRESSED_MB, d.compressedRefuseMb), swapRefuseMb = positive(env.FORGE_HEAVY_SWAP_MB, d.swapRefuseMb);
  return {
    rssMb: positive(env.FORGE_HEAVY_RSS_MB, positive(rssMb, d.rssMb)),
    compressedRefuseMb, swapRefuseMb,
    freePctMin: positive(env.FORGE_HEAVY_FREE_PCT, d.freePctMin),
    // a run that was allowed to start is not stopped by the very limit that let it in
    compressedKillMb: Math.max(positive(env.FORGE_HEAVY_KILL_COMPRESSED_MB, d.compressedKillMb), compressedRefuseMb),
    swapKillMb: Math.max(positive(env.FORGE_HEAVY_KILL_SWAP_MB, d.swapKillMb), swapRefuseMb),
    pollMs: positive(env.FORGE_HEAVY_POLL_MS, d.pollMs), sysEveryMs: positive(env.FORGE_HEAVY_SYS_MS, d.sysEveryMs), alsoRunningMb: positive(env.FORGE_HEAVY_ALSO_MB, d.alsoRunningMb),
  };
}

// ---- processes -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

export { parsePs, parseSwapUsage, parseMemoryPressure };
const mb = (kb) => Math.round(kb / 1024);

/** Every process under the pids `roots` (the roots too), one row each: [{ pid, ppid, rssKb, command }]. A root that is not in `rows` (it has ended) contributes nothing. Pid 1 is never walked through. */
export function treeRows(rows, roots) {
  const byPid = new Map(rows.map((r) => [r.pid, r])), children = new Map();
  for (const r of rows) (children.get(r.ppid) ?? children.set(r.ppid, []).get(r.ppid)).push(r.pid);
  const out = [], seen = new Set();
  for (const root of roots) {
    if (!byPid.has(root) || seen.has(root)) continue;
    seen.add(root);
    for (const queue = [root]; queue.length > 0;) {
      const pid = queue.shift();
      out.push(byPid.get(pid));
      for (const c of children.get(pid) ?? []) if (c > 1 && !seen.has(c)) { seen.add(c); queue.push(c); }
    }
  }
  return out;
}

/** What the tree under `roots` holds: { count, totalMb, procs: [{ pid, ppid, mb, command }] biggest first }. */
export function treeStats(rows, roots) {
  const t = treeRows(rows, roots);
  const procs = t.map((r) => ({ pid: r.pid, ppid: r.ppid, mb: mb(r.rssKb), rssKb: r.rssKb, command: r.command })).sort((a, b) => b.rssKb - a.rssKb || a.pid - b.pid);
  return { count: procs.length, totalMb: mb(t.reduce((n, r) => n + r.rssKb, 0)), procs };
}

// ---- samples: the peak, the five biggest, the tail --------------------------------------------------------------------------------------------------------------------------------------------------------

/** One sample from a process table: { tSec, totalMb, count, top: [five biggest] } (null when the tree is gone). */
export function sampleOf(rows, roots, tSec, keep = 5) {
  const s = treeStats(rows, roots);
  return s.count === 0 ? null : { tSec, totalMb: s.totalMb, count: s.count, top: s.procs.slice(0, keep).map(({ pid, mb: m, command }) => ({ pid, mb: m, command })) };
}
/** The sample with the highest total (the first one on a tie), and its index; null for no samples. */
export function peakOf(samples) {
  let best = null, at = -1;
  samples.forEach((s, i) => { if (best === null || s.totalMb > best.totalMb) { best = s; at = i; } });
  return best === null ? null : { ...best, index: at };
}
/**
 * Is the tree's memory still RISING at the end of the run? The rule: take the last 25 % of the samples (at least 3), fit a straight line through their totals (least squares: one noisy sample does not decide) and read the rise over
 * that stretch; rising = the rise is more than 10 % of the peak. Fewer than 4 samples cannot say (tooFew). A tail that falls is never rising.
 */
export function tailTrend(samples, { fraction = 0.25, risePct = 10, minSamples = 4 } = {}) {
  const n = samples.length;
  if (n < minSamples) return { rising: false, tooFew: true, tailLen: n, riseMb: 0, risePctOfPeak: 0, peakMb: peakOf(samples)?.totalMb ?? 0 };
  const len = Math.min(n, Math.max(3, Math.ceil(n * fraction))), tail = samples.slice(n - len);
  const xs = tail.map((s) => s.tSec), ys = tail.map((s) => s.totalMb);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const mx = mean(xs), my = mean(ys);
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const slope = den === 0 ? 0 : xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / den;       // MB per second
  const riseMb = Math.round(slope * (xs[xs.length - 1] - xs[0]));
  const peakMb = peakOf(samples).totalMb, risePctOfPeak = peakMb > 0 ? Math.round((riseMb / peakMb) * 100) : 0;
  return { rising: riseMb > (risePct / 100) * peakMb, tooFew: false, tailLen: len, riseMb, risePctOfPeak, peakMb, slopeMbPerSec: Math.round(slope * 10) / 10 };
}

// ---- the machine ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const pageCount = (t, name) => Number(new RegExp(`${name}:\\s+(\\d+)`).exec(String(t))?.[1] ?? 0);
/**
 * One reading of the machine from the text of its commands: { memsizeMb, swapTotalMb, swapUsedMb, compressedMb, freeMb, activeMb, inactiveMb, wiredMb, pages: { free, active, inactive, wired, compressor }, freePct }.
 * `compressedMb` is `Pages occupied by compressor` (what the cron logger prints as `compressed`): the RAM the compressor itself holds. A figure the text does not give is null.
 */
export function machineSnapshot({ memsize = '', swap = '', vmStat = '', pressure = '' } = {}) {
  const bytes = Number(String(memsize).trim());
  const sw = parseSwapUsage(swap), hasVm = /page size of/.test(String(vmStat));
  const vm = hasVm ? parseVmStat(vmStat) : null;
  const pages = hasVm ? { free: pageCount(vmStat, 'Pages free'), active: pageCount(vmStat, 'Pages active'), inactive: pageCount(vmStat, 'Pages inactive'), wired: pageCount(vmStat, 'Pages wired down'), compressor: pageCount(vmStat, 'Pages occupied by compressor') } : null;
  const toMb = (n) => (vm ? Math.round((n * vm.pageBytes) / 1048576) : null);
  return {
    memsizeMb: Number.isFinite(bytes) && bytes > 0 ? Math.round(bytes / 1048576) : null,
    swapTotalMb: sw ? Math.round(sw.totalMb) : null, swapUsedMb: sw ? Math.round(sw.usedMb) : null,
    compressedMb: vm ? vm.compressorMb : null, freeMb: vm ? vm.freeMb : null, activeMb: pages ? toMb(pages.active) : null, inactiveMb: vm ? vm.inactiveMb : null, wiredMb: vm ? vm.wiredMb : null,
    pages, freePct: parseMemoryPressure(pressure),
  };
}
const show = (v, unit = 'MB') => (v === null || v === undefined ? 'unknown' : `${v} ${unit}`);
/** The lines that say what the machine is doing (the report prints them at its start and at its end). */
export function machineLines(m, label) {
  const p = m.pages;
  const pg = (name, pages, megs) => (pages === undefined || megs === null ? `${name} unknown` : `${name} ${pages} pages (${megs} MB)`);
  return [
    `${label}: hw.memsize ${show(m.memsizeMb)}; vm.swapusage total ${show(m.swapTotalMb)}, used ${show(m.swapUsedMb)}; compressed ${show(m.compressedMb)}; memory_pressure free percentage ${show(m.freePct, '%')}`,
    `${' '.repeat(label.length)}  vm_stat: ${[pg('free', p?.free, m.freeMb), pg('active', p?.active, m.activeMb), pg('inactive', p?.inactive, m.inactiveMb), pg('wired', p?.wired, m.wiredMb)].join(', ')}`,
  ];
}

// ---- the report --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const clip = (s, w) => (s.length > w ? `${s.slice(0, w - 1)}~` : s);
/** The text the report script prints at the end. `samples` are sampleOf results; `start`/`end` machine snapshots. */
export function formatReport({ command, exitCode, seconds, intervalMs, samples, start, end, tsvPath, stoppedBy = null }) {
  const peak = peakOf(samples), tail = tailTrend(samples);
  const out = ['==== heavy-mem-report ====', `command: ${command}`, `exit code ${exitCode}${stoppedBy ? ` (${stoppedBy})` : ''}; ran ${seconds.toFixed(1)} s; ${samples.length} samples, one every ${(intervalMs / 1000).toFixed(intervalMs % 1000 === 0 ? 0 : 1)} s (a spike shorter than that can be missed: the peak is a floor)`];
  if (peak === null) out.push('peak: no sample saw the command running (it ended before the first look)');
  else {
    out.push(`PEAK ${peak.totalMb} MB (the whole tree: ${peak.count} process${peak.count === 1 ? '' : 'es'}) at ${peak.tSec.toFixed(1)} s`);
    out.push(`the ${peak.top.length === 1 ? 'biggest process' : `${peak.top.length} biggest processes`} at the peak (pid, MB, command):`);
    for (const t of peak.top) out.push(`  ${String(t.pid).padStart(7)}  ${String(t.mb).padStart(6)} MB  ${clip(t.command, 110)}`);
    const last = samples[samples.length - 1];
    if (tail.tooFew) out.push(`tail: cannot say (${samples.length} samples; the rule needs 4 or more)`);
    else out.push(`tail: ${tail.rising ? 'RISING (a leak or a runaway)' : 'flat or falling'}: the last ${tail.tailLen} samples (25 % of the run, at least 3) moved by ${tail.riseMb >= 0 ? '+' : ''}${tail.riseMb} MB = ${tail.risePctOfPeak} % of the peak (rising means more than +10 %); last sample ${last.totalMb} MB`);
  }
  out.push(...machineLines(start, 'machine at start'), ...machineLines(end, 'machine at end'));
  if (tsvPath) out.push(`samples: ${tsvPath}`);
  return out.join('\n');
}
export const TSV_HEADER = ['t_s', 'total_mb', 'processes', 'biggest_pid', 'biggest_mb', 'biggest_command'].join('\t');
/** One sample as a TSV line (no newline). */
export const tsvLine = (s) => [s.tSec.toFixed(1), s.totalMb, s.count, s.top[0]?.pid ?? '', s.top[0]?.mb ?? '', (s.top[0]?.command ?? '').replace(/[\t\n]/g, ' ')].join('\t');

// ---- the guard: refuse, stop ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

/** Why a run must not START now: [] when the machine is fine. `mem` is a machineSnapshot (any figure may be null: an unknown figure never refuses). */
export function refusalReasons(mem, limits) {
  const why = [];
  if (mem.compressedMb != null && mem.compressedMb > limits.compressedRefuseMb) why.push(`compressed memory ${mem.compressedMb} MB is over ${limits.compressedRefuseMb} MB (FORGE_HEAVY_COMPRESSED_MB)`);
  if (mem.swapUsedMb != null && mem.swapUsedMb > limits.swapRefuseMb) why.push(`swap used ${mem.swapUsedMb} MB is over ${limits.swapRefuseMb} MB (FORGE_HEAVY_SWAP_MB)`);
  if (mem.freePct != null && mem.freePct < limits.freePctMin) why.push(`memory_pressure free percentage ${mem.freePct} % is under ${limits.freePctMin} % (FORGE_HEAVY_FREE_PCT)`);
  return why;
}
/** Why a run that is going must STOP now (null = carry on): the tree is over its cap, or the machine's compressor or swap is past its limit. */
export function stopReason({ treeMb, mem }, limits) {
  if (treeMb > limits.rssMb) return `its process tree holds ${treeMb} MB, over the ${limits.rssMb} MB cap (FORGE_HEAVY_RSS_MB)`;
  if (mem?.compressedMb != null && mem.compressedMb > limits.compressedKillMb) return `compressed memory is ${mem.compressedMb} MB, over ${limits.compressedKillMb} MB (FORGE_HEAVY_KILL_COMPRESSED_MB)`;
  if (mem?.swapUsedMb != null && mem.swapUsedMb > limits.swapKillMb) return `swap used is ${mem.swapUsedMb} MB, over ${limits.swapKillMb} MB (FORGE_HEAVY_KILL_SWAP_MB)`;
  return null;
}

/** A short name for a process: the app (`Google Chrome`), the dev server (`wrangler/workerd`), `node <script>`, or the program. */
export function labelOf(command) {
  const app = /([^/]+)\.app\//.exec(command);
  if (app) return { label: app[1], devServer: false };
  const dev = /\b(wrangler|workerd|vite|nodemon|webpack-dev-server|webpack serve|next dev|next-server|storybook|astro dev|live-server|http-server|ts-node-dev|tsx watch|esbuild --serve|miniflare)\b/.exec(command);
  if (dev) return { label: dev[1] === 'wrangler' || dev[1] === 'workerd' || dev[1] === 'miniflare' ? 'wrangler/workerd' : dev[1], devServer: true };
  const words = command.trim().split(/\s+/);
  const prog = (words[0] ?? '').split('/').pop();
  if (prog === 'node') { const script = words.slice(1).find((w) => !w.startsWith('-')); return { label: script ? `node ${script.split('/').pop()}` : 'node', devServer: false }; }
  return { label: prog || 'unknown', devServer: false };
}
/** The programs (grouped by label) that hold at least `minMb` between them, outside `exclude` (a set of pids): [{ label, devServer, count, mb }] biggest first. */
export function alsoRunning(rows, { minMb = DEFAULT_LIMITS.alsoRunningMb, exclude = new Set() } = {}) {
  const groups = new Map();
  for (const r of rows) {
    if (exclude.has(r.pid)) continue;
    const { label, devServer } = labelOf(r.command);
    const g = groups.get(label) ?? groups.set(label, { label, devServer, count: 0, kb: 0 }).get(label);
    g.count += 1; g.kb += r.rssKb; g.devServer = g.devServer || devServer;
  }
  return [...groups.values()].map((g) => ({ label: g.label, devServer: g.devServer, count: g.count, mb: mb(g.kb) })).filter((g) => g.mb >= minMb).sort((a, b) => b.mb - a.mb || a.label.localeCompare(b.label));
}
/** "also running: Google Chrome (59 processes, 5969 MB), wrangler/workerd [dev server] (2 processes, 900 MB)" ('' when nothing is that big). */
export function alsoRunningLine(list, max = 8) {
  if (list.length === 0) return '';
  const part = (g) => `${g.label}${g.devServer ? ' [dev server]' : ''} (${g.count} process${g.count === 1 ? '' : 'es'}, ${g.mb} MB)`;
  return `also running: ${list.slice(0, max).map(part).join(', ')}${list.length > max ? `, and ${list.length - max} more` : ''}`;
}
/** The refusal, as printed: the first line carries the sentence the callers look for. */
export function refusalText({ reasons, also, what }) {
  return [`heavy-guard: memory pressure high, wait (${what}): ${reasons.join('; ')}`, ...(also ? [`heavy-guard: ${also}`] : []), 'heavy-guard: nothing was started. Close what you can and run it again (FORGE_HEAVY_GUARD=off runs it anyway; the limits: node scripts/heavy-guard.mjs --limits).'].join('\n');
}
/** The stop, as printed: names the reason and the biggest process of the tree. Not a test failure: the run was ended on purpose, exit code 76. */
export function stopText({ what, reason, tree, mem }) {
  const big = tree.procs[0];
  return `heavy-guard: stopped by the memory guard (${what}): ${reason}. Biggest process in the tree: ${big ? `pid ${big.pid}, ${big.mb} MB, ${clip(big.command, 120)}` : 'none left'}. The tree held ${tree.totalMb} MB in ${tree.count} process${tree.count === 1 ? '' : 'es'}; the machine: compressed ${show(mem?.compressedMb)}, swap used ${show(mem?.swapUsedMb)}. This is NOT a test failure: the whole tree was killed to keep the Mac alive (exit code ${EXIT_STOPPED}).`;
}

/**
 * The stop rule as an object a long-running tool can feed: `tick(rows, roots)` looks at the process table the tool already has (the mutation runner's watchdog reads one four times a second), reads the system numbers through `readMem()` at most every
 * `limits.sysEveryMs`, and answers null (carry on) or { reason, text, tree, mem } (stop now). It kills nothing itself.
 */
export function createGuard({ readMem, what = 'heavy run', limits = limitsFromEnv(), now = Date.now }) {
  let last = null, lastAt = -Infinity;
  return {
    limits,
    tick(rows, roots) {
      const tree = treeStats(rows, roots);
      const t = now();
      if (last === null || t - lastAt >= limits.sysEveryMs) { last = readMem(); lastAt = t; }
      const reason = stopReason({ treeMb: tree.totalMb, mem: last }, limits);
      if (reason === null) return null;
      const mem = readMem();
      return { reason, tree, mem, text: stopText({ what, reason, tree, mem }) };
    },
  };
}
