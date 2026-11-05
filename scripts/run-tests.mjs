#!/usr/bin/env node
// 2026-11-05-1184 - `npm test` (and the matrix's legs): everything runs as it always did in ONE `node --test`, EXCEPT the test files that spawn a nested runner (scripts/test-groups.mjs: the computed rule). Those run AFTER the rest,
// each in its OWN PROCESS GROUP under a hard timeout: on expiry the whole group is killed (`process.kill(-pid)`) - the file, the runner it spawned and every grandchild, including one holding a pipe, which `spawnSync` cannot
// kill - and the run says so ("<file>: ran 300 s: killed with its children") and goes on to the next file. A hang is a clear failure naming the file, never a stall.
// 2026-11-05-1186: the group runs THREE files at a time on a calm machine (one at a time cost about +170 s on `npm test` and +155 s on the matrix, measured on a calm minute) and ONE at a time when the machine is strained (the matrix's
// 1176 check: swap over 85 % used or load over 4 per core, scripts/dev/mem-core.mjs `machineStrain`); with more than one at a time each file's output is printed as one block when it ends, so the TAP of two files never mixes.
//   node scripts/run-tests.mjs [--test-concurrency=N | other node --test flags] [files...]      (no files = src/*.test.ts then scripts/*.test.mjs, as `npm test` always ran)
//   FORGE_NESTED_TEST_TIMEOUT_S=300   the group timeout per nested file (seconds)
//   FORGE_NESTED_CONCURRENCY=N        how many nested files at once (a whole number from 1); overrides the calm/strained choice
// The output keeps node's own: the rest of the suite, then the group, then ONE final summary block (ℹ tests / suites / pass / fail / cancelled / skipped / todo / duration_ms) summing both, because the matrix reads the LAST such lines.
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defaultTestFiles, partitionTestFiles } from './test-groups.mjs';
import { machineStrain, readMachine, readingsLine } from './dev/mem-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_NESTED_TIMEOUT_S = 300;
export const CALM_NESTED_CONCURRENCY = 3;
const FIELDS = ['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo', 'duration_ms'];

/** The last summary block of a run's output: { tests, suites, pass, fail, cancelled, skipped, todo, duration_ms } (null = the run printed none). */
export function parseSummary(output) {
  const got = {};
  for (const f of FIELDS) {
    const all = [...output.matchAll(new RegExp(`^ℹ ${f} ([0-9.]+)`, 'gm'))];
    if (all.length > 0) got[f] = Number(all[all.length - 1][1]);
  }
  return got.tests === undefined ? null : got;
}

const addUp = (parts) => Object.fromEntries(FIELDS.map((f) => [f, parts.reduce((n, p) => n + (p?.[f] ?? 0), 0)]));

/** Kill a process group (or just the process): never throws (it may already be gone). */
function killTree(pid, mode) {
  try { process.kill(mode === 'group' ? -pid : pid, 'SIGKILL'); } catch { /* gone */ }
}

/**
 * Run `node --test <flags> <files>` as ONE child in its own process group; forward its output as it comes; give up after `timeoutMs` by killing the group (mode 'group', the default; 'child' = only the child, kept so a test can show
 * what that leaves behind). Resolves { code, timedOut, ms, output } on the child's EXIT (not on the pipes closing: a grandchild may hold them), after which the stragglers of its group are killed too.
 */
export function runNodeTest(files, { cwd = ROOT, flags = [], timeoutMs, killMode = 'group', env = process.env, out = process.stdout, err = process.stderr, onSpawn } = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const childEnv = { ...env }; delete childEnv.NODE_TEST_CONTEXT;      // a run started inside a test file would otherwise think it is a child of that run and skip itself
    const child = spawn(process.execPath, ['--test', ...flags, ...files], { cwd, env: childEnv, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    onSpawn?.(child);
    let output = '', timedOut = false, settled = false;
    const keep = (chunk) => { output += chunk; if (output.length > 400_000) output = output.slice(-300_000); };
    child.stdout.on('data', (c) => { keep(c); out.write(c); });
    child.stderr.on('data', (c) => { keep(c); err.write(c); });
    const timer = timeoutMs === undefined ? null : setTimeout(() => { timedOut = true; killTree(child.pid, killMode); }, timeoutMs);
    const finish = (code) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (killMode === 'group') killTree(child.pid, 'group');               // whatever it left running in its group goes with it
      child.stdout.destroy(); child.stderr.destroy();
      resolve({ code, timedOut, ms: Date.now() - t0, output });
    };
    child.on('exit', (code) => finish(code ?? 1));
    child.on('error', () => finish(1));
  });
}

/**
 * How many nested files run at once, and why (pure: the machine's readings are passed in). FORGE_NESTED_CONCURRENCY (a whole number from 1) wins; otherwise one at a time when the machine is strained (the 1176 limits), else
 * CALM_NESTED_CONCURRENCY; never more than there are files. A machine that cannot be read is not called strained (machineStrain).
 */
export function nestedConcurrency({ env = process.env, machine = null, count = Infinity } = {}) {
  const asked = Number(env.FORGE_NESTED_CONCURRENCY);
  const cap = (n) => Math.max(1, Math.min(n, Number.isFinite(count) ? Math.max(count, 1) : n));
  if (env.FORGE_NESTED_CONCURRENCY !== undefined && env.FORGE_NESTED_CONCURRENCY !== '' && Number.isInteger(asked) && asked >= 1) return { n: cap(asked), why: 'FORGE_NESTED_CONCURRENCY' };
  const strain = machine ? machineStrain(machine) : { thrashing: false, reasons: [] };
  if (strain.thrashing) return { n: 1, why: `the machine is strained (${strain.reasons.join(' and ')})` };
  return { n: cap(CALM_NESTED_CONCURRENCY), why: 'the machine is calm' };
}

/** A stream that keeps what is written and hands it over in one piece. */
const buffered = () => { let text = ''; return { write: (c) => { text += c; return true; }, flushTo: (out) => { if (text) out.write(text); text = ''; } }; };

/**
 * The nested-runner group: each file in its own process group under `timeoutS`, `concurrency` at a time (default one). Returns the per-file results (in the order of `files`) and the failure lines. With more than one at a time a file's
 * output is kept and printed as one block when that file ends.
 */
export async function runNestedGroup(files, { timeoutS = DEFAULT_NESTED_TIMEOUT_S, killMode = 'group', concurrency = 1, out = process.stdout, err = process.stderr, ...rest } = {}) {
  const results = new Array(files.length);
  let next = 0;
  const one = async (i) => {
    const file = files[i];
    const mine = concurrency > 1 ? buffered() : null;
    const r = await runNodeTest([file], { ...rest, out: mine ?? out, err: mine ?? err, timeoutMs: timeoutS * 1000, killMode });
    mine?.flushTo(out);
    const summary = parseSummary(r.output);
    let counted = summary, failure = null;
    if (r.timedOut) {
      failure = `${file}: ran ${timeoutS} s: killed with its children`;
      counted = { tests: 1, fail: 1 };
    } else if (summary === null) {
      failure = `${file}: exited ${r.code} and printed no summary (it did less than asked)`;
      counted = { tests: 1, fail: 1 };
    } else if (r.code !== 0 && (summary.fail ?? 0) === 0) {
      failure = `${file}: exited ${r.code} with no failing test reported`;
      counted = { ...summary, tests: (summary.tests ?? 0) + 1, fail: 1 };
    } else if ((summary.fail ?? 0) > 0) {
      failure = `${file}: ${summary.fail} failing test(s) (the details are above)`;      // node's own account of it is already in the output
    }
    results[i] = { file, ...r, summary: counted, failure };
  };
  const worker = async () => { while (next < files.length) await one(next++); };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, files.length)) }, worker));
  return { results, failures: results.map((r) => r.failure).filter(Boolean) };
}

export function parseArgs(argv) {
  const flags = [], files = [];
  for (const a of argv) (a.startsWith('-') ? flags : files).push(a);
  return { flags, files };
}

export async function main(argv = process.argv.slice(2), { root = ROOT, out = process.stdout, err = process.stderr, env = process.env, machine } = {}) {
  const { flags, files: asked } = parseArgs(argv);
  const files = asked.length > 0 ? asked : defaultTestFiles(root);
  const { rest, nested } = partitionTestFiles(files, (f) => fs.readFileSync(path.resolve(root, f), 'utf8'));
  const timeoutS = Number(env.FORGE_NESTED_TEST_TIMEOUT_S) > 0 ? Number(env.FORGE_NESTED_TEST_TIMEOUT_S) : DEFAULT_NESTED_TIMEOUT_S;
  const live = new Set();
  const track = (c) => { live.add(c); c.on('exit', () => live.delete(c)); };
  const stop = (sig) => { for (const c of live) killTree(c.pid, 'group'); process.exit(sig === 'SIGINT' ? 130 : 143); };
  process.on('SIGINT', () => stop('SIGINT')); process.on('SIGTERM', () => stop('SIGTERM'));
  const t0 = Date.now();
  out.write(`ℹ run-tests: ${rest.length} file(s) in one run, then ${nested.length} nested-runner file(s) (scripts/test-groups.mjs), each under ${timeoutS} s\n`);
  const first = rest.length > 0 ? await runNodeTest(rest, { cwd: root, flags, out, err, onSpawn: track }) : { code: 0, output: '' };
  const firstSummary = rest.length > 0 ? parseSummary(first.output) : { tests: 0 };
  // the machine is read when the group is about to start: that is the moment the choice is about
  const reading = nested.length > 0 ? (machine ?? readMachine(env)) : null;
  const pick = nestedConcurrency({ env, machine: reading, count: nested.length });
  if (nested.length > 0) out.write(`ℹ nested-runner group: ${pick.n} at a time (${pick.why}); ${readingsLine(reading)}\n`);
  const group = nested.length > 0 ? await runNestedGroup(nested, { cwd: root, flags: flags.filter((f) => !/^--test-concurrency/.test(f)), timeoutS, concurrency: pick.n, out, err, onSpawn: track }) : { results: [], failures: [] };
  const summary = addUp([firstSummary, ...group.results.map((r) => r.summary)]);
  summary.duration_ms = Date.now() - t0;
  out.write(`\nℹ nested-runner group: ${nested.length} file(s), ${pick.n === 1 ? 'one at a time' : `${pick.n} at a time`}, each under ${timeoutS} s: ${nested.length - group.failures.length} ok, ${group.failures.length} failed\n`);
  if (group.failures.length > 0) {
    out.write('✖ failing tests:\n');
    for (const line of group.failures) out.write(`✖ ${line}\n`);
  }
  if (firstSummary === null) out.write('✖ the main run printed no summary (it did less than asked)\n');
  for (const f of FIELDS) out.write(`ℹ ${f} ${f === 'duration_ms' ? summary[f].toFixed(6) : summary[f]}\n`);
  return first.code === 0 && firstSummary !== null && group.failures.length === 0 ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code), (e) => { console.error('run-tests failed', e); process.exit(1); });
}
