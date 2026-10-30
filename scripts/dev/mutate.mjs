#!/usr/bin/env node
// A parallel, test-mapped, diff-seeded mutation runner (drain 2026-10-26-1300). See scripts/dev/README.md ("The mutation runner"). In short:
//
//   node scripts/dev/mutate.mjs --diff HEAD~1                      mutants from the lines the last commit changed
//   node scripts/dev/mutate.mjs --hand mutants.json --no-fail      hand-written mutants: [[file, name, from, to, tests?], ...]
//   node scripts/dev/mutate.mjs --diff HEAD~1 --hand m.json --equivalent eq.json --out result.json
//
// Every mutant runs in its OWN scratch copy of the tree (src, scripts, test, docs and the small assets copied; node_modules, main.js and assets/wheels, assets/pyodide
// symlinked), only the test files that can see the mutated file run, and several mutants run at once. The real working tree is never written: a mutant is a file in a
// scratch copy, so there is nothing to restore. Exit status: 0 nothing unexplained survived (or --no-fail), 1 an unexplained survivor, 2 usage or a red baseline,
// 3 the working tree changed while the tool ran (which would be a bug in this tool).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { startReaper } from './reaper.mjs';
import {
  parseChangedLines, isMutableSource, generateMutants, sample, parseHandList, resolveHand, applyMutant, capLoops, killedByLoopCap, DEFAULT_MAX_LOOP, buildMap, selectTests, hashTexts, parseTapSummary,
  orderTests, preferFirst, classifyRun, summarize, formatReport, runPool, confirmRedAlone, noTestMessage, importsOnlyNamers, importsOnlyNote,
} from './mutate-core.mjs';

const USAGE = `usage: node scripts/dev/mutate.mjs [--diff <git ref or range>] [--hand <mutants.json>]... [options]
  --root <dir>        the project (default: the current directory)
  --diff <ref>        mutate the lines 'git diff -U0 <ref>' says changed (e.g. HEAD~1, or a..b with that range checked out)
  --file <path>       mutate EVERY line of this source file (repeatable); for a new file, which a diff does not list
  --include <regexp>  also allow files matching this to be mutated (by default not tests, generated files, test-support or scripts/dev)
  --hand <file>       hand-written mutants, JSON: [[file, name, from, to, tests?], ...] or [{file, name, from, to, tests?}, ...]
  --map-only          ignore the tests a hand-written mutant lists; use the map
  --max <n>           at most n diff-seeded mutants (an even stride over all of them)
  --jobs <n>          mutants at once (default: half the cores, at most 8)
  --engine-jobs <n>   of those, mutants whose tests boot the Pyodide engine at once (default 4)
  --test-concurrency <n>  test files one mutant runs at once (default: the cores divided by --jobs, at least 2)
  --timeout <s>       per mutant; a hang is killed and counted as killed by timeout (default 90)
  --max-loop <n>      the mutated file's unbounded loops (while (true), for (;;), for (init; ; update)) throw after n iterations per site: a mutant that removes a loop exit dies in a second, as a kill 'by loop cap', instead of at the
                      timeout (default 5000000; 0 = off, the timeout alone)
  --equivalent <file> JSON { "<id or name>": "why it is equivalent" }: survivors listed there are reported as equivalent-explained
  --glue <regexp>     files whose mutants also run the engine tests that import them anywhere (default: pyodide-host, phrase-engine, the engine bundle)
  --list              print the mutants and the tests each would run; run nothing
  --out <file>        write the full result as JSON
  --baseline <when>   'after' (default): run the tests that KILLED mutants once on the unmutated tree after the mutants, so a kill by a test that fails anyway is caught for the cost of those few
                      files; 'first': run every test of the pool unmutated before any mutant (slower: the whole pool, every time)
  --no-fail           exit 0 even with unexplained survivors
  --no-verify-tree    skip the before/after check of the working tree
  --scratch <dir>     where the scratch copies go (default: a new directory in the system temp dir)
  --trace             print every test file's result (name, seconds, status) for every mutant, to see what a mutant spent its time on
  --keep              keep the scratch copies`;

function parseArgs(argv) {
  const a = { hand: [], file: [], jobs: Math.min(8, Math.max(2, Math.floor(os.cpus().length / 2))), engineJobs: 4, timeout: 90, maxLoop: DEFAULT_MAX_LOOP, glue: '(pyodide-host|phrase-engine|real-rhythm-engine|engine-bundle)\\.|^assets/engine/', root: process.cwd() };
  const need = (i, n) => { if (argv[i + 1] === undefined) throw new Error(`${n} needs a value`); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--root') a.root = path.resolve(need(i++, k));
    else if (k === '--diff') a.diff = need(i++, k);
    else if (k === '--hand') a.hand.push(need(i++, k));
    else if (k === '--file') a.file.push(need(i++, k));
    else if (k === '--include') a.include = new RegExp(need(i++, k));
    else if (k === '--map-only') a.mapOnly = true;
    else if (k === '--max') a.max = Number(need(i++, k));
    else if (k === '--jobs') a.jobs = Number(need(i++, k));
    else if (k === '--engine-jobs') a.engineJobs = Number(need(i++, k));
    else if (k === '--test-concurrency') a.testConcurrency = Number(need(i++, k));
    else if (k === '--timeout') a.timeout = Number(need(i++, k));
    else if (k === '--max-loop') a.maxLoop = Number(need(i++, k));
    else if (k === '--equivalent') a.equivalent = need(i++, k);
    else if (k === '--glue') a.glue = need(i++, k);
    else if (k === '--list') a.list = true;
    else if (k === '--out') a.out = need(i++, k);
    else if (k === '--baseline') a.baseline = need(i++, k);
    else if (k === '--no-fail') a.noFail = true;
    else if (k === '--no-verify-tree') a.noVerify = true;
    else if (k === '--scratch') a.scratch = path.resolve(need(i++, k));
    else if (k === '--keep') a.keep = true;
    else if (k === '--trace') a.trace = true;
    else if (k === '-h' || k === '--help') { console.log(USAGE); process.exit(0); }
    else throw new Error(`unknown option ${k}`);
  }
  if (!(a.maxLoop >= 0)) throw new Error('--max-loop must be a number of at least 0 (0 = off)');
  for (const k of ['jobs', 'engineJobs', 'timeout']) if (!(a[k] >= 1)) throw new Error(`--${k.replace('J', '-j')} must be a number of at least 1`);
  if (a.baseline === undefined) a.baseline = 'after';
  if (a.baseline !== 'after' && a.baseline !== 'first') throw new Error("--baseline is 'after' or 'first'");
  if (a.testConcurrency !== undefined && !(a.testConcurrency >= 1)) throw new Error('--test-concurrency must be a number of at least 1');
  if (a.max !== undefined && !(a.max >= 1)) throw new Error('--max must be a number of at least 1');
  if (a.diff === undefined && a.hand.length === 0 && a.file.length === 0) throw new Error('nothing to mutate: give --diff <ref>, --file <path> and/or --hand <file>');
  return a;
}

// ---- reading the project -----------------------------------------------------------------------------------------------------------------------------------------------

const SOURCE = /\.(ts|tsx|mjs|cjs|js)$/;
function walk(root, rel, out) {
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = rel + '/' + e.name;
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'dist' && !e.name.startsWith('.')) walk(root, r, out); }
    else if (e.isFile() && SOURCE.test(e.name)) out.push(r);
  }
}
function readTexts(root) {
  const files = [];
  for (const d of ['src', 'scripts']) if (fs.existsSync(path.join(root, d))) walk(root, d, files);
  return new Map(files.map((f) => [f, fs.readFileSync(path.join(root, f), 'utf8')]));
}

function loadMap(root, texts) {
  const hash = hashTexts(texts);
  const dir = path.join(os.tmpdir(), 'forge-mutate-cache');
  const cache = path.join(dir, crypto.createHash('sha1').update(root).digest('hex') + '.json');
  try {
    const c = JSON.parse(fs.readFileSync(cache, 'utf8'));
    if (c.hash === hash) {
      const tests = new Map(c.tests.map(([f, i]) => [f, { direct: new Set(i.direct), closure: new Set(i.closure), engine: i.engine, chrome: i.chrome }]));
      return { map: { tests }, cached: true };
    }
  } catch { /* no cache, or an old one */ }
  const { tests } = buildMap(texts);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(cache, JSON.stringify({ hash, tests: [...tests].map(([f, i]) => [f, { direct: [...i.direct], closure: [...i.closure], engine: i.engine, chrome: i.chrome }]) }));
  } catch { /* a cache that cannot be written is only slower */ }
  return { map: { tests }, cached: false };
}

const killsFile = (root) => path.join(os.tmpdir(), 'forge-mutate-cache', crypto.createHash('sha1').update(root).digest('hex') + '.kills.json');
const loadKills = (root) => { try { return JSON.parse(fs.readFileSync(killsFile(root), 'utf8')); } catch { return {}; } };
const saveKills = (root, k) => { try { fs.mkdirSync(path.dirname(killsFile(root)), { recursive: true }); fs.writeFileSync(killsFile(root), JSON.stringify(k)); } catch { /* ordering only */ } };
const durationsFile = (root) => path.join(os.tmpdir(), 'forge-mutate-cache', crypto.createHash('sha1').update(root).digest('hex') + '.durations.json');
const loadDurations = (root) => { try { return JSON.parse(fs.readFileSync(durationsFile(root), 'utf8')); } catch { return {}; } };
const saveDurations = (root, d) => { try { fs.mkdirSync(path.dirname(durationsFile(root)), { recursive: true }); fs.writeFileSync(durationsFile(root), JSON.stringify(d)); } catch { /* ordering only */ } };

// ---- the working tree must come out as it went in --------------------------------------------------------------------------------------------------------------------

function fingerprint(root) {
  let status = '';
  try { status = execFileSync('git', ['status', '--porcelain=v1', '-uall'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }); } catch { /* not a git repository */ }
  const h = crypto.createHash('sha256');
  let files = 0;
  const hashDir = (rel) => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true }).sort((x, y) => (x.name < y.name ? -1 : 1))) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'dist' && e.name !== '.git') hashDir(r); }
      else if (e.isFile()) { h.update(r + '\0'); h.update(fs.readFileSync(path.join(root, r))); files++; }
    }
  };
  for (const d of ['src', 'scripts', 'test', 'docs']) hashDir(d);
  for (const f of ['package.json', 'tsconfig.json', 'manifest.json', 'versions.json', 'styles.css']) if (fs.existsSync(path.join(root, f))) { h.update(f + '\0'); h.update(fs.readFileSync(path.join(root, f))); files++; }
  return { status, hash: h.digest('hex'), files };
}

// ---- the scratch copies --------------------------------------------------------------------------------------------------------------------------------------------------

const COPY = ['src', 'scripts', 'test', 'docs', 'package.json', 'package-lock.json', 'tsconfig.json', 'manifest.json', 'versions.json', 'styles.css', '.gitignore', 'data.json', 'eslint.config.mjs'];
const LINK = ['node_modules', 'main.js'];
const LINK_UNDER_ASSETS = ['wheels', 'pyodide'];

const cp = (from, to) => {
  // APFS clones the whole directory in one call (`cp -c`); anywhere else a plain recursive copy does the same job, slower.
  const flags = process.platform === 'darwin' ? ['-cR'] : ['-R'];
  try { execFileSync('cp', [...flags, from, to], { stdio: 'ignore' }); } catch { execFileSync('cp', ['-R', from, to], { stdio: 'ignore' }); }
};

function buildBase(root, scratch) {
  const base = path.join(scratch, 'base');
  fs.mkdirSync(base, { recursive: true });
  for (const n of COPY) if (fs.existsSync(path.join(root, n))) cp(path.join(root, n), path.join(base, n));
  for (const n of LINK) if (fs.existsSync(path.join(root, n))) fs.symlinkSync(fs.realpathSync(path.join(root, n)), path.join(base, n));
  const assets = path.join(root, 'assets');
  if (fs.existsSync(assets)) {
    fs.mkdirSync(path.join(base, 'assets'));
    for (const e of fs.readdirSync(assets)) {
      if (LINK_UNDER_ASSETS.includes(e)) fs.symlinkSync(fs.realpathSync(path.join(assets, e)), path.join(base, 'assets', e));
      else cp(path.join(assets, e), path.join(base, 'assets', e));
    }
  }
  // a few tests ask git (what is tracked; "the leak existed in this repo's own history"): the base carries a SMALL .git that answers like the real one: the real refs, packed-refs, HEAD and
  // index copied, the real object store reached through objects/info/alternates (read only, nothing is copied or written there). A mutant's copy is cloned from the base, so it has the same.
  const realGit = path.join(root, '.git');
  if (fs.existsSync(path.join(realGit, 'HEAD')) && fs.statSync(realGit).isDirectory()) {
    const g = path.join(base, '.git');
    fs.mkdirSync(path.join(g, 'objects', 'info'), { recursive: true });
    fs.mkdirSync(path.join(g, 'objects', 'pack'), { recursive: true });
    fs.mkdirSync(path.join(g, 'info'), { recursive: true });
    for (const f of ['HEAD', 'config', 'packed-refs', 'index']) if (fs.existsSync(path.join(realGit, f))) fs.copyFileSync(path.join(realGit, f), path.join(g, f));
    if (fs.existsSync(path.join(realGit, 'refs'))) fs.cpSync(path.join(realGit, 'refs'), path.join(g, 'refs'), { recursive: true });
    fs.writeFileSync(path.join(g, 'objects', 'info', 'alternates'), path.join(realGit, 'objects') + '\n');
    fs.writeFileSync(path.join(g, 'info', 'exclude'), [...LINK, ...LINK_UNDER_ASSETS.map((n) => `assets/${n}`)].join('\n') + '\n');
  }
  // sibling repositories some tests read through ../<name> (music-theory, music-core, ...): the scratch copies sit beside symlinks to them
  const rootName = path.basename(root);
  for (const e of fs.readdirSync(path.dirname(root), { withFileTypes: true })) {
    if (e.name === rootName || e.name === path.basename(scratch) || e.name.startsWith('.') || !(e.isDirectory() || e.isSymbolicLink())) continue;
    try { fs.symlinkSync(path.join(path.dirname(root), e.name), path.join(scratch, e.name)); } catch { /* a clash with base/m-* names cannot happen */ }
  }
  return base;
}

const liveGroups = new Set();
const killGroup = (pid) => { try { process.kill(-pid, 'SIGKILL'); } catch { /* already gone */ } };
const killAll = () => { for (const pid of liveGroups) killGroup(pid); };
// 2026-10-27-0715: a runner killed with -9 (or whose terminal closes) used to leave its `node --test` groups running for ever (a hung mutant at 100% CPU, --test-timeout=0). A signal handler cannot catch SIGKILL, so main() starts a reaper
// SIDECAR (reaper.mjs: its own session, a pipe on its stdin) that kills every registered group, and removes the scratch directory, when this process is gone for ANY reason. Until main() starts it, registering is a no-op.
let reaper = { add() {}, remove() {}, addPath() {}, removePath() {}, stop() {} };
/** What an EARLIER killed run left behind (orphaned test groups, stale scratch directories): scripts/dev/reap.sh, quiet, orphans only (parent pid 1, older than a minute). Never fails the run. */
const sweepLeftovers = () => { if (process.env.FORGE_REAP !== '1') return;       // OPT-IN: it sweeps shared temp space by name, which nothing should do unasked (run it by hand: bash scripts/dev/reap.sh --dry-run)
  try { execFileSync('bash', [path.join(path.dirname(fileURLToPath(import.meta.url)), 'reap.sh'), '--quiet'], { stdio: 'ignore', timeout: 30_000 }); } catch { /* a broom that cannot run is not a reason to stop */ } };
/** NODE_OPTIONS for a test child with a heap cap (a runaway mutant is killed by node at the cap instead of eating the machine); a cap already in NODE_OPTIONS wins. FORGE_TEST_HEAP_MB overrides the 2048. */
export const withHeapCap = (nodeOptions, mb = Number(process.env.FORGE_TEST_HEAP_MB) || 2048) => (/--max-old-space-size/.test(nodeOptions ?? '') ? nodeOptions : `${nodeOptions ? `${nodeOptions} ` : ''}--max-old-space-size=${mb}`);

/** Start one test file in its own `node --test` process (its own process group, so a hang or a spawned child can be killed whole). Returns { child, promise }. */
function startOne(cwd, file) {
  // NODE_TEST_CONTEXT is how a test file knows it is a child of a test runner; a tool that runs INSIDE `npm test` (its own tests) must not pass it on, or the runner it starts prints no summary
  const env = { ...process.env, FORCE_COLOR: '0', NODE_NO_WARNINGS: '1', NO_COLOR: '1', NODE_OPTIONS: withHeapCap(process.env.NODE_OPTIONS) };
  delete env.NODE_TEST_CONTEXT;
  const t0 = Date.now();
  const child = spawn(process.execPath, ['--test', '--test-reporter=tap', file], { cwd, detached: true, env, stdio: ['ignore', 'pipe', 'pipe'] });
  liveGroups.add(child.pid);
  reaper.add(child.pid);
  let out = '';
  const take = (d) => { out += d; if (out.length > 300_000) out = out.slice(-200_000); };
  child.stdout.on('data', take); child.stderr.on('data', take);
  const promise = new Promise((resolve) => {
    const done = (status, signal) => { killGroup(child.pid); liveGroups.delete(child.pid); reaper.remove(child.pid); resolve({ file, status: status ?? (signal ? 1 : 0), signal, secs: (Date.now() - t0) / 1000, output: out, summary: parseTapSummary(out) }); };
    child.on('close', done);
    child.on('error', (e) => { out += String(e); done(1, null); });
  });
  return { child, promise };
}

/**
 * The test files of one run, `concurrency` at a time, each in its own process, in the order given. failFast: the first file that fails ends the run (a mutant is killed by its first
 * failure; the files still running are killed with it). Returns { status, timedOut, output, summary, files } where `files` has every file that finished (with its seconds, its
 * own summary and, for a failing one, its output); a file cut short by the stop or the timeout is not counted as a result.
 */
async function runFiles(cwd, tests, { timeoutMs, concurrency, failFast }) {
  const files = [], running = new Set();
  let next = 0, stop = false, timedOut = false;
  const abortAll = () => { stop = true; for (const c of running) killGroup(c.pid); };
  const timer = setTimeout(() => { timedOut = true; abortAll(); }, timeoutMs);
  const worker = async () => {
    for (;;) {
      if (stop || next >= tests.length) return;
      const file = tests[next++];
      const { child, promise } = startOne(cwd, file);
      running.add(child);
      const r = await promise;
      running.delete(child);
      if (stop && r.status !== 0 && r.signal) continue;                 // cut short by the stop: not a verdict
      files.push(r);
      if (r.status !== 0 && failFast) abortAll();
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, tests.length)) }, worker));
  clearTimeout(timer);
  const failed = files.filter((f) => f.status !== 0);
  const sum = { tests: 0, pass: 0, fail: 0, skipped: 0 };
  for (const f of files) if (f.summary) for (const k of Object.keys(sum)) sum[k] += f.summary[k] ?? 0;
  const noSummary = files.some((f) => f.status === 0 && !f.summary);
  return {
    status: failed.length || timedOut ? 1 : 0, timedOut, files, failed,
    summary: noSummary ? null : sum,
    output: failed.map((f) => f.output).join('\n'),
  };
}

class Semaphore {
  constructor(n) { this.n = n; this.q = []; }
  async take() { if (this.n > 0) { this.n--; return; } await new Promise((r) => this.q.push(r)); }
  give() { const r = this.q.shift(); if (r) r(); else this.n++; }
}

// ---- main ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------

export async function main(argv) {
  let a;
  try { a = parseArgs(argv); } catch (e) { console.error(`mutate: ${e.message}\n${USAGE}`); return 2; }
  const started = Date.now();
  const root = a.root;
  const texts = readTexts(root);
  const before = a.noVerify ? null : fingerprint(root);
  const { map, cached } = loadMap(root, texts);
  const glue = new RegExp(a.glue);

  // 1. the mutants
  const mutants = [];
  if (a.diff !== undefined) {
    const diff = execFileSync('git', ['diff', '-U0', '--no-color', ...a.diff.split(/\s+/).filter(Boolean), '--', 'src', 'scripts'], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    const changed = parseChangedLines(diff);
    const seeded = [];
    for (const [file, lines] of changed) if ((isMutableSource(file) || a.include?.test(file)) && texts.has(file)) seeded.push(...generateMutants(file, texts.get(file), lines));
    mutants.push(...sample(seeded, a.max ?? Infinity));
  }
  if (a.file.length > 0) {
    const whole = [];
    for (const f of a.file) {
      const rel = path.relative(root, path.resolve(root, f)).split(path.sep).join('/');
      if (!texts.has(rel)) { console.error(`mutate: --file ${f}: not a source file of this project (src/ and scripts/ .ts .mjs .js .cjs)`); return 2; }
      whole.push(...generateMutants(rel, texts.get(rel), null));
    }
    mutants.push(...sample(whole, a.max ?? Infinity));
  }
  for (const h of a.hand) {
    for (const m of parseHandList(JSON.parse(fs.readFileSync(path.resolve(h), 'utf8')))) {
      if (!texts.has(m.file)) { mutants.push({ ...m, id: m.name, op: 'hand', status: 'n/a', why: `${m.file} is not a source file of this project` }); continue; }
      mutants.push(resolveHand(m, texts.get(m.file)));
    }
  }

  // 2. the tests each one runs
  const chromeSeen = new Set();
  for (const m of mutants) {
    if (m.status === 'n/a') continue;
    const sel = selectTests(map, m.file, glue);
    sel.chrome.forEach((c) => chromeSeen.add(c));
    m.listed = !a.mapOnly && Array.isArray(m.tests);
    m.tests = m.listed ? m.tests : sel.run;
    m.heavy = m.tests.some((t) => map.tests.get(t)?.engine);
  }
  const runnable = mutants.filter((m) => m.status !== 'n/a');
  const pool = [...new Set(runnable.flatMap((m) => m.tests))].sort();
  const equivalent = a.equivalent ? JSON.parse(fs.readFileSync(path.resolve(a.equivalent), 'utf8')) : {};

  console.error(`mutate: ${mutants.length} mutants over ${new Set(mutants.map((m) => m.file)).size} file(s); the map has ${map.tests.size} test files (${cached ? 'cached' : 'built'}); ${pool.length} of them in the pool`);
  if (a.list) {
    for (const m of mutants) console.log(`${m.status === 'n/a' ? 'n/a ' : '    '} ${m.id}  ${m.file}:${m.line ?? '?'}  ${JSON.stringify(m.from.slice(0, 60))} -> ${JSON.stringify(m.to.slice(0, 60))}  tests: ${m.tests ? m.tests.length : 0}${m.tests && m.tests.length === 0 ? ' (NO TEST)' : ''}`);
    return 0;
  }
  if (mutants.length === 0) { console.error('mutate: no mutants (the diff changed no mutable source line)'); return 0; }

  // 3. the scratch copies and the baseline
  const scratch = a.scratch ?? fs.mkdtempSync(path.join(os.tmpdir(), 'forge-mutate-'));
  fs.mkdirSync(scratch, { recursive: true });
  const cleanup = () => { if (!a.keep) try { fs.rmSync(scratch, { recursive: true, force: true }); } catch { /* the temp dir is cleaned by the system anyway */ } };
  sweepLeftovers();
  reaper = startReaper();
  if (!a.keep) reaper.addPath(scratch);                                    // removed by the sidecar too if this process dies by SIGKILL
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(sig, () => { killAll(); cleanup(); process.exit(130); });
  process.once('exit', killAll);                                           // any other way out of the process: no group outlives it
  process.once('uncaughtException', (e) => { console.error(e); killAll(); cleanup(); process.exit(1); });
  try {
    const base = buildBase(root, scratch);
    const durations = loadDurations(root);
    const redNames = (r) => r.failed.flatMap((f) => [f.file, ...f.output.split('\n').filter((l) => /^\s*not ok \d+ - /.test(l)).slice(0, 6).map((l) => '    ' + l.trim())]).slice(0, 60).join('\n');
    const unmutated = (files) => runFiles(base, files, { timeoutMs: 15 * 60_000, concurrency: Math.max(2, os.cpus().length - 1), failFast: false });
    // A file that fails among others is re-run ALONE before it is called red (CC saw 22 of 23 'red' files pass alone and in the matrix): only a file that fails alone is named.
    const alone = (files) => confirmRedAlone(files, (f) => runFiles(base, [f], { timeoutMs: 15 * 60_000, concurrency: 1, failFast: false }));
    const flakyNote = (flaky) => (flaky.length ? `mutate: ${flaky.length} file(s) failed in the batch but pass alone (load, not a red baseline): ${flaky.join(', ')}\n` : '');
    let baselineRed = [];
    if (a.baseline === 'first' && pool.length > 0) {
      const t0 = Date.now();
      const r = await unmutated(pool);
      const sum = r.summary;
      let flaky = [];
      let red = r.status !== 0 || !sum || sum.pass === 0 || sum.fail;
      if (red && sum && sum.pass > 0 && r.failed.length > 0) {
        const c = await alone(r.failed.map((f) => f.file));
        flaky = c.flaky;
        if (c.redAlone.length === 0) red = false;
        else r.failed = r.failed.filter((f) => c.redAlone.includes(f.file));
      }
      if (red) {
        console.error(`mutate: the baseline is not green (the unmutated tests of the pool: ${sum ? `${sum.pass} pass, ${sum.fail} fail, ${sum.skipped} skipped` : 'no summary'}); a mutation run on a red baseline proves nothing\n${flakyNote(flaky)}${redNames(r)}`);
        return 2;
      }
      if (flaky.length) console.error(flakyNote(flaky).trimEnd());
      for (const f of r.files) durations[f.file] = Math.round(f.secs * 10) / 10;
      saveDurations(root, durations);
      console.error(`mutate: baseline green: ${sum.tests} tests, ${sum.pass} pass, ${sum.skipped} skipped (${Math.round((Date.now() - t0) / 1000)} s)`);
    }
    const kills = loadKills(root);
    for (const m of runnable) if (!m.listed) m.tests = preferFirst(orderTests(map, m.file, m.tests, durations, glue.test(m.file)), kills[m.id]);

    // 4. the mutants, several at once
    const heavy = new Semaphore(a.engineJobs);
    const concurrency = a.testConcurrency ?? Math.max(2, Math.floor(os.cpus().length / a.jobs));
    let done = 0;
    const order = runnable.map((m, i) => i).sort((x, y) => Number(runnable[y].heavy) - Number(runnable[x].heavy));
    const outcomes = new Array(runnable.length);
    const capped = new Array(runnable.length).fill(false);
    const seconds = new Array(runnable.length);
    const killers = new Array(runnable.length).fill(null).map(() => []);
    const runMutant = async (m, i, timeoutS) => {
      const dir = path.join(scratch, `m-${i}-${Math.random().toString(36).slice(2, 6)}`);
      const t0 = Date.now();
      try {
        cp(base, dir);
        const file = path.join(dir, m.file);
        fs.rmSync(file, { force: true });
        fs.writeFileSync(file, capLoops(applyMutant(texts.get(m.file), m), a.maxLoop));      // 2026-10-29-0840: unbounded loops of the mutated file count their iterations (--max-loop)
        const r = await runFiles(dir, m.tests, { timeoutMs: timeoutS * 1000, concurrency, failFast: true });
        if (a.trace) for (const f of r.files) console.error(`  trace ${m.id}: ${f.status === 0 ? 'ok  ' : 'FAIL'} ${f.secs.toFixed(1).padStart(5)} s  ${f.file}`);
        const outcome = classifyRun(r);
        return { outcome, loopCap: outcome === 'killed' && killedByLoopCap(r.output), secs: (Date.now() - t0) / 1000, killers: r.failed.map((f) => f.file), files: r.files };
      } catch (e) { console.error(`mutate: ${m.id}: ${e.message}`); return { outcome: 'not-run', loopCap: false, secs: (Date.now() - t0) / 1000, killers: [], files: [] }; } finally {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* cleaned with the scratch dir */ }
      }
    };
    await runPool(order, a.jobs, async (i) => {
      const m = runnable[i];
      if (m.tests.length === 0) { outcomes[i] = 'uncovered'; seconds[i] = 0; done++; console.error(`[${done}/${runnable.length}] uncovered ${m.id}: ${noTestMessage(m.file)}`); return; }
      if (m.heavy) await heavy.take();
      try { const r = await runMutant(m, i, a.timeout); outcomes[i] = r.outcome; capped[i] = r.loopCap; seconds[i] = r.secs; killers[i] = r.killers; for (const f of r.files) if (outcomes[i] === 'survived') durations[f.file] = Math.round(f.secs * 10) / 10; } finally { if (m.heavy) heavy.give(); }
      done++;
      console.error(`[${done}/${runnable.length}] ${outcomes[i].padEnd(8)} ${String(Math.round(seconds[i])).padStart(3)} s  ${m.id}`);
    });
    // A timeout under load is not a hang: a survivor that is merely slow because several mutants share the machine looks exactly like one. Every timeout is run again ALONE, with nothing
    // else running; only a mutant that times out in the quiet is reported as killed by timeout, and the rest get their real outcome.
    for (const i of runnable.keys()) {
      if (outcomes[i] !== 'timeout') continue;
      console.error(`mutate: ${runnable[i].id} timed out with ${a.jobs} running at once; running it again alone to tell a hang from a slow run`);
      const r = await runMutant(runnable[i], i, a.timeout);
      outcomes[i] = r.outcome; capped[i] = r.loopCap; seconds[i] = r.secs; killers[i] = r.killers; runnable[i].retriedAlone = true;
      console.error(`[again] ${r.outcome.padEnd(8)} ${String(Math.round(r.secs)).padStart(3)} s  ${runnable[i].id}`);
    }

    // 4b. the baseline AFTER: a mutant is killed by a test that fails with the mutant and passes without it. The mutant run proved the first half; this runs every test that killed anything on the
    // unmutated tree (a handful of files, not the whole pool) for the second. A killer that fails there makes every mutant it alone killed 'baseline-red', and the run is not trusted.
    if (a.baseline === 'after') {
      const killing = [...new Set(runnable.flatMap((m, i) => (outcomes[i] === 'killed' ? killers[i] : [])))];
      if (killing.length > 0) {
        const t0 = Date.now();
        const r = await unmutated(killing);
        for (const f of r.files) if (f.status === 0) durations[f.file] = Math.round(f.secs * 10) / 10;
        const c = r.failed.length > 0 ? await alone(r.failed.map((f) => f.file)) : { redAlone: [], flaky: [] };
        const red = new Set(c.redAlone);
        if (c.flaky.length) console.error(flakyNote(c.flaky).trimEnd());
        if (red.size > 0) {
          // The run is NOT thrown away: the report is printed below under a loud header, and the exit status is 2 (a red baseline is never trusted).
          baselineRed = [...red].sort();
          console.error(`mutate: the baseline is not green: ${red.size} of the ${killing.length} test file(s) that killed mutants also fail on the UNMUTATED tree (alone, too), so their kills prove nothing; the report follows anyway\n${redNames({ failed: r.failed.filter((f) => red.has(f.file)) })}`);
        } else console.error(`mutate: baseline after: the ${killing.length} test file(s) that killed mutants pass on the unmutated tree (${Math.round((Date.now() - t0) / 1000)} s)`);
      }
    }
    saveDurations(root, durations);
    if (baselineRed.length === 0) { runnable.forEach((m, i) => { if (outcomes[i] === 'killed' && killers[i].length) kills[m.id] = killers[i]; }); saveKills(root, kills); }

    // 5. the report
    runnable.forEach((m, i) => { m.outcome = outcomes[i]; m.seconds = seconds[i]; m.loopCap = capped[i]; });
    const results = mutants.map((m) => ({ id: m.id, name: m.op === 'hand' ? m.name : undefined, file: m.file, line: m.line, op: m.op, from: m.from, to: m.to, status: m.status, why: m.why, outcome: m.outcome, loopCap: m.loopCap, seconds: m.seconds, retriedAlone: m.retriedAlone, tests: m.tests }));
    const s = summarize(results, equivalent);
    let treeUnchanged = null;
    if (before) {
      const after = fingerprint(root);
      treeUnchanged = after.status === before.status && after.hash === before.hash ? { ok: true, files: after.files } : { ok: false, why: after.hash !== before.hash ? 'file bytes differ' : 'git status differs' };
    }
    // 2026-10-29-0930: a mutated file that a CLI test names but whose test is marked imports-only is not covered by it; say so, once per file
    const notes = [...new Set(mutants.map((m) => m.file))].sort().flatMap((f) => { const t = importsOnlyNamers(texts, map, f); return t.length ? [importsOnlyNote(f, t)] : []; });
    console.log(formatReport(s, { wallMs: Date.now() - started, jobs: a.jobs, testCount: pool.length, chromeSkipped: [...chromeSeen], treeUnchanged, baselineRed, notes }));
    if (a.out) fs.writeFileSync(path.resolve(a.out), JSON.stringify({ summary: { generated: s.generated, killed: s.killed, timeout: s.timeout, loopCap: s.loopCap, survived: s.survived.length, uncovered: s.uncovered.length, explained: s.explained.length, invalid: s.invalid.length, notApplicable: s.notApplicable.length, notRun: s.notRun.length, wallMs: Date.now() - started }, results }, null, 2));
    if (treeUnchanged && !treeUnchanged.ok) return 3;
    if (baselineRed.length > 0) return 2;
    return s.unexplained > 0 && !a.noFail ? 1 : 0;
  } finally { cleanup(); sweepLeftovers(); }
}

if (import.meta.url === new URL(process.argv[1], 'file:').href || process.argv[1]?.endsWith('mutate.mjs')) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(e.stack ?? e); process.exit(2); });
}
