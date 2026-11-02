#!/usr/bin/env node
// 2026-10-31-1125 - mem-watch: WHERE the memory goes while our own heavy tooling runs. Every 2 s it reads `ps` (resident memory summed by FAMILY: the mutation runner and its test children, the drain matrix and its legs, headless
// Chrome, pytest, any other node, Obsidian, Claude), `vm_stat` and `memory_pressure -Q`, appends ONE LINE to a CSV (so a machine that dies mid-run still leaves its evidence on disk) and, when the watched command ends, prints the
// peak per family with the minute it happened in.
//
//   node scripts/dev/mem-watch.mjs --out /tmp/mem.csv -- bash scripts/drain-matrix.sh
//   node scripts/dev/mem-watch.mjs --out /tmp/mem.csv -- node scripts/dev/mutate.mjs --file src/x.ts
//   node scripts/dev/mem-watch.mjs --out /tmp/mem.csv --until-pid 12345            (watch a process that is already running)
//   --interval <ms>           sampling period (default 2000)
//   --guard-free-mb <n>       a SAFETY NET for a measuring run: when available memory falls below n MB the watched command's process group is terminated (and the CSV says so) instead of taking the machine down
// The exit status is the watched command's.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { CSV_HEADER, csvLine, readPs, readSystemMemory, summarizeSamples, summaryLines, sumByFamily } from './mem-core.mjs';

const argv = process.argv.slice(2);
const dash = argv.indexOf('--');
const opts = dash >= 0 ? argv.slice(0, dash) : argv;
const command = dash >= 0 ? argv.slice(dash + 1) : [];
const arg = (name, dflt) => { const i = opts.indexOf(name); return i >= 0 ? opts[i + 1] : dflt; };
const out = arg('--out'), interval = Number(arg('--interval', 2000)), guard = arg('--guard-free-mb') !== undefined ? Number(arg('--guard-free-mb')) : null, untilPid = arg('--until-pid') !== undefined ? Number(arg('--until-pid')) : null;
if (!out || (command.length === 0 && untilPid === null)) { console.error('usage: mem-watch.mjs --out <file.csv> [--interval ms] [--guard-free-mb n] (-- <command...> | --until-pid <pid>)'); process.exit(2); }

fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, CSV_HEADER + '\n');
const samples = [];
const t0 = Date.now();
let child = null, finished = false, guardFired = false;
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

const sample = () => {
  const rows = readPs().filter((r) => r.pid !== process.pid);
  const { mb, count } = sumByFamily(rows);
  const sys = readSystemMemory();
  const s = { tSeconds: Math.round((Date.now() - t0) / 1000), mb, count, availableMb: sys.availableMb, freePercent: sys.freePercent };
  samples.push(s);
  fs.appendFileSync(out, csvLine(s) + '\n');
  if (guard !== null && !guardFired && sys.availableMb < guard) {
    guardFired = true;
    const note = `mem-watch: GUARD: available memory ${sys.availableMb} MB < ${guard} MB at ${s.tSeconds} s: terminating the watched command's process group`;
    console.error(note); fs.appendFileSync(out, `# ${note}\n`);
    try { if (child) process.kill(-child.pid, 'SIGTERM'); } catch { /* gone */ }
  }
};

const finish = (status) => {
  if (finished) return; finished = true; clearInterval(timer); sample();
  const sum = summarizeSamples(samples);
  for (const l of summaryLines(sum)) console.log(l);
  console.log(`mem-watch: csv ${path.resolve(out)}`);
  process.exit(status);
};
const timer = setInterval(() => { sample(); if (untilPid !== null && !alive(untilPid)) finish(0); }, interval);
sample();
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { try { if (child) process.kill(-child.pid, 'SIGTERM'); } catch { /* gone */ } finish(130); });
if (command.length > 0) {
  child = spawn(command[0], command.slice(1), { stdio: 'inherit', detached: true });
  child.on('exit', (code, signal) => finish(code ?? (signal ? 1 : 0)));
  child.on('error', (e) => { console.error(`mem-watch: could not start ${command[0]}: ${e.message}`); finish(127); });
}
