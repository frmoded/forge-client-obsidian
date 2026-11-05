#!/usr/bin/env node
// 2026-11-05-1184 - `npm test` (and the matrix's legs): everything runs as it always did in ONE `node --test`, EXCEPT the test files that spawn a nested runner (scripts/test-groups.mjs: the computed rule). Those run AFTER the rest,
// ONE AT A TIME, each in its OWN PROCESS GROUP under a hard timeout: on expiry the whole group is killed (`process.kill(-pid)`) - the file, the runner it spawned and every grandchild, including one holding a pipe, which `spawnSync` cannot
// kill - and the run says so ("<file>: ran 300 s: killed with its children") and goes on to the next file. A hang is a clear failure naming the file, never a stall.
//   node scripts/run-tests.mjs [--test-concurrency=N | other node --test flags] [files...]      (no files = src/*.test.ts then scripts/*.test.mjs, as `npm test` always ran)
//   FORGE_NESTED_TEST_TIMEOUT_S=300   the group timeout per nested file (seconds)
// The output keeps node's own: the rest of the suite, then the group, then ONE final summary block (ℹ tests / suites / pass / fail / cancelled / skipped / todo / duration_ms) summing both, because the matrix reads the LAST such lines.
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defaultTestFiles, partitionTestFiles } from './test-groups.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_NESTED_TIMEOUT_S = 300;
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

/** The nested-runner group: each file alone, in order, under `timeoutS`. Returns the per-file results and the failure lines. */
export async function runNestedGroup(files, { timeoutS = DEFAULT_NESTED_TIMEOUT_S, killMode = 'group', ...rest } = {}) {
  const results = [], failures = [];
  for (const file of files) {
    const r = await runNodeTest([file], { ...rest, timeoutMs: timeoutS * 1000, killMode });
    const summary = parseSummary(r.output);
    let counted = summary;
    if (r.timedOut) {
      failures.push(`${file}: ran ${timeoutS} s: killed with its children`);
      counted = { tests: 1, fail: 1 };
    } else if (summary === null) {
      failures.push(`${file}: exited ${r.code} and printed no summary (it did less than asked)`);
      counted = { tests: 1, fail: 1 };
    } else if (r.code !== 0 && (summary.fail ?? 0) === 0) {
      failures.push(`${file}: exited ${r.code} with no failing test reported`);
      counted = { ...summary, tests: (summary.tests ?? 0) + 1, fail: 1 };
    } else if ((summary.fail ?? 0) > 0) {
      failures.push(`${file}: ${summary.fail} failing test(s) (the details are above)`);      // node's own account of it is already in the output
    }
    results.push({ file, ...r, summary: counted });
  }
  return { results, failures };
}

export function parseArgs(argv) {
  const flags = [], files = [];
  for (const a of argv) (a.startsWith('-') ? flags : files).push(a);
  return { flags, files };
}

export async function main(argv = process.argv.slice(2), { root = ROOT, out = process.stdout, err = process.stderr } = {}) {
  const { flags, files: asked } = parseArgs(argv);
  const files = asked.length > 0 ? asked : defaultTestFiles(root);
  const { rest, nested } = partitionTestFiles(files, (f) => fs.readFileSync(path.resolve(root, f), 'utf8'));
  const timeoutS = Number(process.env.FORGE_NESTED_TEST_TIMEOUT_S) > 0 ? Number(process.env.FORGE_NESTED_TEST_TIMEOUT_S) : DEFAULT_NESTED_TIMEOUT_S;
  let current = null;
  const stop = (sig) => { if (current) killTree(current.pid, 'group'); process.exit(sig === 'SIGINT' ? 130 : 143); };
  process.on('SIGINT', () => stop('SIGINT')); process.on('SIGTERM', () => stop('SIGTERM'));
  const t0 = Date.now();
  out.write(`ℹ run-tests: ${rest.length} file(s) in one run, then ${nested.length} nested-runner file(s) one at a time, each under ${timeoutS} s (scripts/test-groups.mjs)\n`);
  const first = rest.length > 0 ? await runNodeTest(rest, { cwd: root, flags, out, err, onSpawn: (c) => { current = c; } }) : { code: 0, output: '' };
  const firstSummary = rest.length > 0 ? parseSummary(first.output) : { tests: 0 };
  const group = nested.length > 0 ? await runNestedGroup(nested, { cwd: root, flags: flags.filter((f) => !/^--test-concurrency/.test(f)), timeoutS, out, err, onSpawn: (c) => { current = c; } }) : { results: [], failures: [] };
  const summary = addUp([firstSummary, ...group.results.map((r) => r.summary)]);
  summary.duration_ms = Date.now() - t0;
  out.write(`\nℹ nested-runner group: ${nested.length} file(s), one at a time, each under ${timeoutS} s: ${nested.length - group.failures.length} ok, ${group.failures.length} failed\n`);
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
