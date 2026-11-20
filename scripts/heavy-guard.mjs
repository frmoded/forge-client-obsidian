#!/usr/bin/env node
// 2026-11-20-1001z - the guard behind scripts/heavy-guard.sh (read its header: what it does, the numbers, the exit codes). This file is the part that runs a command: it refuses to start it on a machine under memory pressure, and while it runs
// kills its WHOLE process tree when the tree, the memory compressor or the swap pass their limits. The lock is taken by heavy-guard.sh (scripts/dev/heavy-lock.mjs), not here.
//   node scripts/heavy-guard.mjs [--what <label>] [--rss-mb <n>] -- <command...>
//   node scripts/heavy-guard.mjs --limits       the limits in force (defaults and what the environment changes), one per line
// As a module it gives the in-process tools (the real-Chrome helper, `npm test`'s runner, the mutation runner) the same three questions: `guardEnabled`, `checkStart`, and `createGuard` (heavy-mem-core.mjs) fed with a process table they already have.
import { spawn } from 'node:child_process';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { killTree } from './dev/proc-tree.mjs';
import { EXIT_REFUSED, EXIT_STOPPED, alsoRunning, alsoRunningLine, createGuard, limitsFromEnv, refusalReasons, refusalText, treeRows } from './heavy-mem-core.mjs';
import { readMachine, readProcesses, readProcessesForNaming } from './heavy-mem-read.mjs';

/**
 * Is the guard on? FORGE_HEAVY_GUARD=off: no. =on: yes. Otherwise (auto) yes, EXCEPT inside a test run (NODE_TEST_CONTEXT): the tests of the matrix, of the runners and of the mutation tool start these tools on scratch projects, and a guard that
 * refused them on a busy machine would make a test depend on the weather. The guard's own tests say FORGE_HEAVY_GUARD=on.
 */
export function guardEnabled(env = process.env) {
  const v = (env.FORGE_HEAVY_GUARD ?? 'auto').toLowerCase();
  if (v === 'off') return false;
  if (v === 'on') return true;
  return !env.NODE_TEST_CONTEXT;
}

/**
 * Should a tool that guards ITSELF (the real-Chrome helper, `npm test`'s runner, the mutation runner) do it now? When the guard is enabled AND no guard is already around it: heavy-guard.mjs marks everything it starts with FORGE_HEAVY_GUARDED, so a tool
 * started under it (the matrix's legs run `npm test`) does not watch the same tree a second time.
 */
export const guardWanted = (env = process.env) => guardEnabled(env) && !env.FORGE_HEAVY_GUARDED;

/** The start check: { refuse: false } or { refuse: true, text, reasons } (the text names the big programs that are running too: a report, never a reason to refuse on its own). */
export function checkStart({ env = process.env, what = 'heavy run', rssMb, readMem = () => readMachine(env), readRows = () => readProcessesForNaming(env), exclude = new Set([process.pid]) } = {}) {
  const limits = limitsFromEnv(env, { rssMb });
  const reasons = refusalReasons(readMem(), limits);
  if (reasons.length === 0) return { refuse: false, limits };
  const also = alsoRunningLine(alsoRunning(readRows(), { minMb: limits.alsoRunningMb, exclude }));
  return { refuse: true, limits, reasons, text: refusalText({ reasons, also, what }) };
}

/**
 * For a tool that is its own heavy command and has no process table of its own to read (the real-Chrome helper): look at the tree under `roots()` every limits.pollMs and call `onStop(hit)` once when the rule says stop (hit.text is the message).
 * The timer does not keep the process alive.
 */
export function watchTree({ env = process.env, what, rssMb, roots, onStop, readRows = readProcesses, readMem = () => readMachine(env) }) {
  const limits = limitsFromEnv(env, { rssMb });
  const guard = createGuard({ readMem, what, limits });
  const timer = setInterval(() => { const hit = guard.tick(readRows(), roots()); if (hit !== null) { clearInterval(timer); onStop(hit); } }, limits.pollMs);
  timer.unref();
  return timer;
}

/** Kill everything UNDER `pid` (not `pid` itself: for a tool that is its own tree's root and ends itself right after, e.g. the real-Chrome helper with its Chrome and the helpers of Chrome). Returns the pids signalled. */
export function killDescendants(pid, rows = readProcesses()) {
  const victims = treeRows(rows, [pid]).map((r) => r.pid).filter((p) => p !== pid && p > 1);
  for (const p of victims) { try { process.kill(p, 'SIGSTOP'); } catch { /* gone */ } }
  for (const p of victims) { try { process.kill(p, 'SIGKILL'); } catch { /* gone */ } }
  return victims;
}

/** Kill the tree led by `pid` (its group and every descendant: scripts/dev/proc-tree.mjs freezes them first, so nothing forks on the way out) and say which pids of the tree are still alive 300 ms later (a straggler is killed again). */
export async function killWholeTree(pid, { readRows = readProcesses, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const before = new Set(readRows().map((r) => r.pid));
  const victims = killTree(pid);
  await sleep(300);
  const alive = readRows().filter((r) => (victims.includes(r.pid) || r.pid === pid) && before.has(r.pid));
  for (const r of alive) { try { process.kill(r.pid, 'SIGKILL'); } catch { /* gone */ } }
  return alive.map((r) => r.pid);
}

function parseArgs(argv) {
  const dash = argv.indexOf('--');
  const opts = dash >= 0 ? argv.slice(0, dash) : argv, command = dash >= 0 ? argv.slice(dash + 1) : [];
  const get = (k) => { const i = opts.indexOf(k); return i >= 0 ? opts[i + 1] : undefined; };
  return { command, what: get('--what'), rssMb: get('--rss-mb') !== undefined ? Number(get('--rss-mb')) : undefined, limitsOnly: opts.includes('--limits') };
}

export async function main(argv, env = process.env) {
  const a = parseArgs(argv);
  if (a.limitsOnly) {
    for (const [k, v] of Object.entries(limitsFromEnv(env, { rssMb: a.rssMb }))) console.log(`${k} ${v}`);
    return 0;
  }
  if (a.command.length === 0) { console.error('usage: heavy-guard.mjs [--what label] [--rss-mb n] -- <command...>'); return 2; }
  const what = a.what ?? a.command.find((c) => !c.startsWith('-') && c !== 'node' && c !== 'bash') ?? a.command[0];
  const start = checkStart({ env, what, rssMb: a.rssMb });
  if (start.refuse) { console.error(start.text); return EXIT_REFUSED; }
  const { limits } = start;
  console.error(`heavy-guard: ${what}: stops its whole tree over ${limits.rssMb} MB, or at compressed memory ${limits.compressedKillMb} MB, or swap ${limits.swapKillMb} MB (node scripts/heavy-guard.mjs --limits)`);
  const guard = createGuard({ readMem: () => readMachine(env), what, limits });
  // its own process group: the guard kills the group and the descendants; a signal sent to us is handed on to the command (its own cleanup, e.g. the matrix removing its worktrees, runs first)
  const child = spawn(a.command[0], a.command.slice(1), { stdio: 'inherit', detached: true, env: { ...env, FORGE_HEAVY_GUARDED: String(process.pid) } });
  let stopping = false, done = false;
  return new Promise((resolve) => {
    const finish = (code) => { if (done) return; done = true; clearInterval(timer); resolve(code); };
    child.on('error', (e) => { console.error(`heavy-guard: could not start ${a.command[0]}: ${e.message}`); finish(127); });
    child.on('exit', (code, signal) => { if (!stopping) finish(code ?? (signal ? 128 + (os.constants.signals[signal] ?? 1) : 1)); });   // while the guard is killing the tree, ITS end is what finishes the run (after the check that nothing is left)
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { try { process.kill(child.pid, sig); } catch { /* gone */ } });
    const timer = setInterval(() => {
      if (stopping || done) return;
      const hit = guard.tick(readProcesses(), [child.pid]);
      if (hit === null) return;
      stopping = true;
      console.error(hit.text);
      killWholeTree(child.pid).then((left) => {
        if (left.length > 0) console.error(`heavy-guard: killed again after the first pass: pid ${left.join(', ')}`);
        finish(EXIT_STOPPED);
      });
    }, limits.pollMs);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e.stack ?? e); process.exit(1); });
