#!/usr/bin/env node
// 2026-11-20-1001z - MEASURE a heavy command's memory: what did the whole process tree hold at its peak, who was biggest, is the memory still rising when the command ends (a leak)?
//
//   node scripts/heavy-mem-report.mjs [--out <file.tsv>] [--interval-ms <n>] -- <command...>
//   node scripts/heavy-mem-report.mjs -- bash scripts/drain-matrix.sh --quiet-only
//
// It starts the command (its output untouched, its exit code is OURS), reads `ps -Ao pid,ppid,rss,command` every 5 s (--interval-ms, or FORGE_HEAVY_REPORT_INTERVAL_MS) and adds up the resident memory of the tree under the command's pid.
// At the start it prints the machine (hw.memsize, vm.swapusage, the compressor, vm_stat's free/active/inactive/wired pages, memory_pressure's free percentage); at the end the PEAK in MB, the five biggest processes at the peak, whether the
// tail is RISING (the last 25 % of the samples, at least 3, trend up by more than 10 % of the peak: a leak or a runaway) and the machine again. The report goes to stderr (the command's stdout stays its own) and to <samples>.report.txt.
// Every sample is appended to a TSV AS IT IS TAKEN (so the last seconds before a freeze are on disk): default ~/forge-logs/heavy-mem/heavy-mem-<yyyymmdd-hhmmss>.tsv (not /tmp: a restart clears it; FORGE_HEAVY_REPORT_DIR changes the directory).
// This script only measures. It never stops anything: heavy-guard.sh is the one that does. Wrap the measure in the guard, not the other way: `bash scripts/heavy-guard.sh node scripts/heavy-mem-report.mjs -- <command>` takes the lock for the whole measure.
// The peak is the highest of the samples, so it is a floor: a spike that begins and ends between two samples is not seen (use a smaller --interval-ms for a short command).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TSV_HEADER, formatReport, machineLines, sampleOf, tsvLine } from './heavy-mem-core.mjs';
import { readMachine, readProcesses } from './heavy-mem-read.mjs';

const pad = (n) => String(n).padStart(2, '0');
/** heavy-mem-<yyyymmdd-hhmmss>.tsv in the report directory. */
export function defaultTsvPath(env = process.env, now = new Date()) {
  const dir = env.FORGE_HEAVY_REPORT_DIR || path.join(os.homedir(), 'forge-logs', 'heavy-mem');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return path.join(dir, `heavy-mem-${stamp}.tsv`);
}

function parseArgs(argv) {
  const dash = argv.indexOf('--');
  const opts = dash >= 0 ? argv.slice(0, dash) : argv, command = dash >= 0 ? argv.slice(dash + 1) : [];
  const get = (k) => { const i = opts.indexOf(k); return i >= 0 ? opts[i + 1] : undefined; };
  return { command, out: get('--out'), intervalMs: get('--interval-ms') !== undefined ? Number(get('--interval-ms')) : undefined };
}

export async function main(argv, env = process.env) {
  const a = parseArgs(argv);
  if (a.command.length === 0) { console.error('usage: heavy-mem-report.mjs [--out file.tsv] [--interval-ms n] -- <command...>'); return 2; }
  const intervalMs = [a.intervalMs, Number(env.FORGE_HEAVY_REPORT_INTERVAL_MS), 5000].find((v) => Number.isFinite(v) && v > 0);
  const tsvPath = path.resolve(a.out ?? defaultTsvPath(env));
  fs.mkdirSync(path.dirname(tsvPath), { recursive: true });
  fs.writeFileSync(tsvPath, `${TSV_HEADER}\n`);
  const start = readMachine(env);
  for (const l of machineLines(start, 'machine at start')) console.error(l);       // hw.memsize and vm.swapusage first, before anything runs
  const t0 = Date.now();
  const child = spawn(a.command[0], a.command.slice(1), { stdio: 'inherit' });
  const samples = [];
  const sample = () => {
    const s = sampleOf(readProcesses(), [child.pid], (Date.now() - t0) / 1000);
    if (s === null) return;
    samples.push(s);
    try { fs.appendFileSync(tsvPath, `${tsvLine(s)}\n`); } catch { /* the samples are a record, not the job */ }
  };
  return new Promise((resolve) => {
    let timer = null;
    child.on('error', (e) => { console.error(`heavy-mem-report: could not start ${a.command[0]}: ${e.message}`); clearInterval(timer); resolve(127); });
    child.on('exit', (code, signal) => {
      clearInterval(timer);
      const exitCode = code ?? (signal ? 128 + (os.constants.signals[signal] ?? 1) : 1);
      const text = formatReport({ command: a.command.join(' '), exitCode, seconds: (Date.now() - t0) / 1000, intervalMs, samples, start, end: readMachine(env), tsvPath });
      console.error(`\n${text}`);
      try { fs.writeFileSync(`${tsvPath.replace(/\.tsv$/, '')}.report.txt`, `${text}\n`); } catch { /* printed above */ }
      resolve(exitCode);
    });
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { try { child.kill(sig); } catch { /* gone */ } });
    sample();
    timer = setInterval(sample, intervalMs);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e.stack ?? e); process.exit(1); });
