// 2026-11-20-1001z - the readers of the memory tools: the only code that runs `sysctl`, `vm_stat`, `memory_pressure` and `ps` for scripts/heavy-mem-report.mjs and scripts/heavy-guard.mjs (the rules are in heavy-mem-core.mjs).
// Two stand-ins, so that no test depends on the machine it runs on:
//   FORGE_HEAVY_FAKE_MEM  a JSON object (starts with `{`) or the path of a JSON file, re-read on EVERY reading (a test changes the file while a command runs): { compressedMb, swapUsedMb, swapTotalMb, freePct, memsizeMb, ... }.
//                         When it is set the machine is not read at all; a figure it does not give is unknown (null), and an unknown figure never refuses and never stops a run.
//   FORGE_HEAVY_FAKE_PS   the path of a text file in `ps -Ao pid,ppid,rss,command` form: the process table the "also running" line of a refusal is made from.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { machineSnapshot, parsePs } from './heavy-mem-core.mjs';

const run = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, maxBuffer: 32 << 20 }); } catch { return ''; } };

const EMPTY = { memsizeMb: null, swapTotalMb: null, swapUsedMb: null, compressedMb: null, freeMb: null, activeMb: null, inactiveMb: null, wiredMb: null, pages: null, freePct: null };

/** The machine now, as a machineSnapshot (heavy-mem-core.mjs). `env` may carry FORGE_HEAVY_FAKE_MEM. */
export function readMachine(env = process.env) {
  const fake = env.FORGE_HEAVY_FAKE_MEM;
  if (fake) {
    try { return { ...EMPTY, ...JSON.parse(fake.trim().startsWith('{') ? fake : fs.readFileSync(fake, 'utf8')) }; } catch { return { ...EMPTY }; }
  }
  if (process.platform !== 'darwin') return { ...EMPTY };
  return machineSnapshot({ memsize: run('sysctl', ['-n', 'hw.memsize']), swap: run('sysctl', ['-n', 'vm.swapusage']), vmStat: run('vm_stat'), pressure: run('memory_pressure', ['-Q']) });
}

/** The process table now: [{ pid, ppid, rssKb, command }] (empty when `ps` cannot be run). */
export const readProcesses = () => parsePs(run('ps', ['-Ao', 'pid,ppid,rss,command']));
/** The table a refusal names the big programs from: FORGE_HEAVY_FAKE_PS when set, else the real one. */
export function readProcessesForNaming(env = process.env) {
  if (env.FORGE_HEAVY_FAKE_PS) { try { return parsePs(fs.readFileSync(env.FORGE_HEAVY_FAKE_PS, 'utf8')); } catch { return []; } }
  return readProcesses();
}
