// 2026-11-20-1001z - where the memory guard (scripts/heavy-guard.sh / heavy-guard.mjs) is wired in, proved by RUNNING each of them with the machine faked (FORGE_HEAVY_FAKE_MEM: a JSON file the test rewrites while the tool runs), on tiny scratch projects:
//   * the mutation runner (scripts/dev/mutate.mjs): refuses to start on a bad machine (75), and stops the whole pass (76, no test process left) when the machine turns bad while its test processes run: it reuses its own RSS watchdog's process table;
//   * `npm test`'s runner (scripts/run-tests.mjs started from the command line): the same two, and no guard inside a call of main() from a test or under heavy-guard.sh;
//   * the real-Chrome helper (scripts/dev/cdp.mjs openPage): refuses BEFORE Chrome starts, and stops the measure (and its Chrome stand-in) when the machine turns bad;
//   * the matrix (scripts/drain-matrix.sh): starts through heavy-guard.sh with its own tree cap; inside a test run it is only the lock, as before (the matrix tests need that).
// The tests clear NODE_TEST_CONTEXT (the guard is off inside a test run by default) and set FORGE_HEAVY_GUARD=on. Light: each run is a second or two, nothing allocates memory.
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const SCRIPTS = import.meta.dirname;
const MUTATE = path.join(SCRIPTS, 'dev', 'mutate.mjs');
const RUN_TESTS = path.join(SCRIPTS, 'run-tests.mjs');
const FINE = { compressedMb: 1000, swapUsedMb: 0, freePct: 80 }, BAD = { compressedMb: 11000, swapUsedMb: 0, freePct: 50 };
const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'heavy-guard-wiring-'));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const until = async (cond, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await new Promise((r) => setTimeout(r, 50)); } return cond(); };
/** The environment of a guarded tool: the guard ON, not in a test run, not under another guard, the machine faked from `mem` (a file), a lock of its own, the mutation runner's own memory gate told the machine has room. */
function envFor(dir, mem, extra = {}) {
  const e = { ...process.env };
  for (const k of ['NODE_TEST_CONTEXT', 'FORGE_HEAVY_GUARDED', 'FORGE_HEAVY_LOCK_HELD', 'FORGE_HEAVY_RSS_MB']) delete e[k];
  const room = path.join(dir, 'room.json'); fs.writeFileSync(room, JSON.stringify({ availableMb: 9000, freePercent: 60 }));
  return { ...e, FORGE_HEAVY_GUARD: 'on', FORGE_HEAVY_FAKE_MEM: mem, FORGE_HEAVY_LOCK: path.join(dir, 'forge-heavy.lock'), FORGE_HEAVY_SYS_MS: '100', FORGE_HEAVY_POLL_MS: '100', FORGE_MEM_READ_FILE: room, FORGE_MEM_BUDGET_MB: '', FORGE_TEST_HEAP_MB: '', ...extra };
}
const writeMem = (dir, m) => { const f = path.join(dir, 'mem.json'); fs.writeFileSync(f, JSON.stringify(m)); return f; };
/** A test file that records its pid and then waits for ever (30 s at most): a heavy thing in flight. */
const SLEEPER = (pidFile) => `import { test } from 'node:test'; import fs from 'node:fs';
test('sleeper', async () => { fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); await new Promise((r) => setTimeout(r, 30000)); });
`;
const collect = (child) => { const o = { err: '', out: '' }; child.stderr.on('data', (d) => { o.err += d; }); child.stdout.on('data', (d) => { o.out += d; }); o.ended = new Promise((r) => child.on('close', (code) => r(code))); return o; };

// ---- the mutation runner ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const git = (cwd, ...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
function mutateProject(pidFile) {
  const root = mk(), proj = path.join(root, 'proj');
  const files = { 'src/lib.ts': 'export function twice(n: number): number {\n  return n * 2;\n}\n', 'src/lib.test.ts': pidFile ? `import { twice } from './lib.ts';\n${SLEEPER(pidFile).replace("async () => {", "async () => { twice(1);")}` : "import { test } from 'node:test'; import assert from 'node:assert/strict'; import { twice } from './lib.ts'; test('twice', () => { assert.equal(twice(4), 8); });\n", 'package.json': '{"type":"module"}' };
  for (const [f, t] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(proj, f)), { recursive: true }); fs.writeFileSync(path.join(proj, f), t); }
  git(proj, 'init', '-q'); git(proj, 'add', '-A'); git(proj, 'commit', '-qm', 'one');
  const hand = path.join(root, 'hand.json');
  fs.writeFileSync(hand, JSON.stringify([['src/lib.ts', 'twice is off by one', 'return n * 2;', 'return n * 2 + 1;']]));
  return { root, proj, hand };
}

test('the mutation runner REFUSES to start on a bad machine (exit 75, "memory pressure high, wait", no test process, no scratch directory); on a fine machine the same run completes and kills its mutant', () => {
  const { root, proj, hand } = mutateProject(null);
  try {
    const mem = writeMem(root, BAD);
    const refused = spawnSync(process.execPath, [MUTATE, '--root', proj, '--hand', hand, '--jobs', '1', '--timeout', '60'], { encoding: 'utf8', timeout: 120_000, env: envFor(root, mem, { TMPDIR: root }) });
    assert.equal(refused.status, 75, refused.stdout + refused.stderr);
    assert.match(refused.stderr, /memory pressure high, wait \(mutation pass\): compressed memory 11000 MB is over 8192 MB/);
    assert.ok(!fs.readdirSync(root).some((n) => /^forge-mutate-(?!cache)/.test(n)), 'no scratch directory was made');
    const mem2 = writeMem(root, FINE);
    const ok = spawnSync(process.execPath, [MUTATE, '--root', proj, '--hand', hand, '--jobs', '1', '--timeout', '60'], { encoding: 'utf8', timeout: 120_000, env: envFor(root, mem2, { TMPDIR: root }) });
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /killed 1/);
    assert.ok(!/memory guard|memory pressure/.test(ok.stderr), 'a fine machine: the guard says nothing');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the mutation runner is STOPPED when the machine turns bad while its test processes run: exit 76, "stopped by the memory guard", the biggest process named, every test process gone', async () => {
  const root0 = mk(); const pidFile = path.join(root0, 'test.pid');
  const { root, proj, hand } = mutateProject(pidFile);
  try {
    const mem = writeMem(root, FINE);
    const child = spawn(process.execPath, [MUTATE, '--root', proj, '--hand', hand, '--jobs', '1', '--timeout', '120'], { env: envFor(root, mem, { TMPDIR: root }), stdio: ['ignore', 'pipe', 'pipe'] });
    const o = collect(child);
    assert.ok(await until(() => fs.existsSync(pidFile)), `the test process started: ${o.err}`);
    const testPid = Number(fs.readFileSync(pidFile, 'utf8'));
    await new Promise((r) => setTimeout(r, 600));
    assert.equal(child.exitCode, null, 'running happily on a fine machine');
    writeMem(root, BAD);
    const code = await o.ended;
    assert.equal(code, 76, o.err);
    assert.match(o.err, /stopped by the memory guard \(mutation pass\): compressed memory is 11000 MB, over 10240 MB/);
    assert.match(o.err, /Biggest process in the tree: pid \d+,/);
    assert.ok(await until(() => !alive(testPid)), `the test process ${testPid} is dead`);
    assert.ok(await until(() => !fs.readdirSync(root).some((n) => /^forge-mutate-(?!cache)/.test(n))), `the scratch directory was removed: ${fs.readdirSync(root).join(' ')}`);
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(root0, { recursive: true, force: true }); }
});

// ---- npm test's runner ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('run-tests.mjs from the command line: REFUSES on a bad machine (75, no test file ran); STOPPED when the machine turns bad mid-run (76, every test tree gone); a call of main() from a test, and a run under another guard, are not guarded', async () => {
  const dir = mk();
  try {
    const marker = path.join(dir, 'ran'), pidFile = path.join(dir, 'test.pid');
    const quick = path.join(dir, 'quick.test.mjs');
    fs.writeFileSync(quick, `import { test } from 'node:test'; import fs from 'node:fs'; test('quick', () => { fs.writeFileSync(${JSON.stringify(marker)}, 'x'); });\n`);
    const bad = writeMem(dir, BAD);
    const refused = spawnSync(process.execPath, [RUN_TESTS, quick], { encoding: 'utf8', timeout: 60_000, env: envFor(dir, bad) });
    assert.equal(refused.status, 75, refused.stdout + refused.stderr);
    assert.match(refused.stderr, /memory pressure high, wait \(npm test\)/);
    assert.ok(!fs.existsSync(marker), 'no test file ran');
    // under another guard (heavy-guard.mjs sets FORGE_HEAVY_GUARDED for what it starts) the runner does not guard a second time
    const under = spawnSync(process.execPath, [RUN_TESTS, quick], { encoding: 'utf8', timeout: 60_000, env: envFor(dir, bad, { FORGE_HEAVY_GUARDED: '1' }) });
    assert.equal(under.status, 0, under.stdout + under.stderr); assert.ok(fs.existsSync(marker));
    fs.rmSync(marker);
    const sleeper = path.join(dir, 'sleeper.test.mjs'); fs.writeFileSync(sleeper, SLEEPER(pidFile));
    const mem = writeMem(dir, FINE);
    const child = spawn(process.execPath, [RUN_TESTS, sleeper], { env: envFor(dir, mem), stdio: ['ignore', 'pipe', 'pipe'] });
    const o = collect(child);
    assert.ok(await until(() => fs.existsSync(pidFile)), `the test process started: ${o.err}`);
    const testPid = Number(fs.readFileSync(pidFile, 'utf8'));
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(child.exitCode, null);
    writeMem(dir, BAD);
    assert.equal(await o.ended, 76, o.err);
    assert.match(o.err, /stopped by the memory guard \(npm test\)/);
    assert.ok(await until(() => !alive(testPid)), `the test process ${testPid} is dead`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- the real-Chrome helper ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('cdp.mjs openPage: REFUSES before Chrome starts (75); STOPPED when the machine turns bad while the measure runs (76) and the Chrome stand-in dies with it', async () => {
  const dir = mk();
  try {
    const fakeChrome = path.join(dir, 'fake-chrome.sh');
    fs.writeFileSync(fakeChrome, `#!/bin/bash\necho $$ > ${JSON.stringify(path.join(dir, 'chrome.pid'))}\nexec sleep 30\n`, { mode: 0o755 });
    const script = path.join(dir, 'measure.mjs');
    fs.writeFileSync(script, `import { openPage } from ${JSON.stringify(path.join(SCRIPTS, 'dev', 'cdp.mjs'))};\nawait openPage({ dir: ${JSON.stringify(dir)}, pageHtml: '<p>x</p>' });\n`);
    const refused = spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 60_000, env: envFor(dir, writeMem(dir, BAD), { CHROME: fakeChrome }) });
    assert.equal(refused.status, 75, refused.stdout + refused.stderr);
    assert.match(refused.stderr, /memory pressure high, wait \(real-Chrome measure\)/);
    assert.ok(!fs.existsSync(path.join(dir, 'chrome.pid')), 'Chrome was never started');
    const mem = writeMem(dir, FINE);
    const child = spawn(process.execPath, [script], { env: envFor(dir, mem, { CHROME: fakeChrome }), stdio: ['ignore', 'pipe', 'pipe'] });
    const o = collect(child);
    assert.ok(await until(() => fs.existsSync(path.join(dir, 'chrome.pid'))), `the Chrome stand-in started: ${o.err}`);
    const chromePid = Number(fs.readFileSync(path.join(dir, 'chrome.pid'), 'utf8'));
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(child.exitCode, null);
    writeMem(dir, BAD);
    assert.equal(await o.ended, 76, o.err);
    assert.match(o.err, /stopped by the memory guard \(real-Chrome measure\)/);
    assert.ok(await until(() => !alive(chromePid)), `the Chrome stand-in ${chromePid} is dead`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- the matrix --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('the matrix starts through heavy-guard.sh with its own tree cap (FORGE_MATRIX_RSS_MB, default 12288) and keeps the lock it always took; the guard script is where the lock is taken, and it falls back to the plain lock inside a test run', () => {
  const m = fs.readFileSync(path.join(SCRIPTS, 'drain-matrix.sh'), 'utf8');
  assert.match(m, /exec bash "\$SCRIPT_DIR\/heavy-guard\.sh" --what drain-matrix --rss-mb "\$\{FORGE_MATRIX_RSS_MB:-12288\}" -- bash "\$0" "\$@"/);
  assert.match(m, /\[ -z "\$\{FORGE_HEAVY_LOCK_HELD:-\}" \] && \[ "\$\{FORGE_HEAVY_LOCK:-\}" != "off" \]/, 'the same condition as before: not when a holder started it, not with the lock off');
  const g = fs.readFileSync(path.join(SCRIPTS, 'heavy-guard.sh'), 'utf8');
  assert.match(g, /exec node "\$DIR\/dev\/heavy-lock\.mjs" run --what "\$WHAT" -- "\$\{CMD\[@\]\}"/, 'the SAME lock, scripts/dev/heavy-lock.mjs');
  assert.match(g, /\*\) \[ -z "\$\{NODE_TEST_CONTEXT:-\}" \] \|\| guard_on=0 ;;/, 'inside a test run: only the lock (the matrix tests run the real script)');
});

test('the matrix, fake bad machine, outside a test run: REFUSED at once with exit 75 and "memory pressure high, wait", before any worktree exists; the same matrix inside a test run (NODE_TEST_CONTEXT) is not touched by the guard', () => {
  const dir = mk();
  try {
    // a scratch copy of scripts/ and a PROJECTS directory with nothing in it: if the guard let the run start, it would die on "repo ... is missing" instead of refusing, which is how the test tells the two apart
    const scripts = path.join(fs.realpathSync(dir), 'scripts'); fs.cpSync(SCRIPTS, scripts, { recursive: true });
    const base = envFor(dir, writeMem(dir, BAD), { PROJECTS: path.join(dir, 'projects'), TMPDIR: dir, FORGE_POWER_GUARD: 'off', FORGE_CAFFEINATE: 'off', FORGE_MATRIX_SELF_COPY: 'off' });
    const refused = spawnSync('bash', [path.join(scripts, 'drain-matrix.sh'), '--no-forge'], { encoding: 'utf8', timeout: 60_000, env: base });
    assert.equal(refused.status, 75, refused.stdout + refused.stderr);
    assert.match(refused.stderr, /memory pressure high, wait \(drain-matrix\)/);
    assert.ok(!fs.readdirSync(dir).some((n) => n.startsWith('drain-matrix.')), 'no worktree directory was made');
    const inTest = spawnSync('bash', [path.join(scripts, 'drain-matrix.sh'), '--no-forge'], { encoding: 'utf8', timeout: 60_000, env: { ...base, NODE_TEST_CONTEXT: 'child-v8', FORGE_HEAVY_GUARD: 'auto' } });
    assert.notEqual(inTest.status, 75, 'inside a test run the guard does not refuse');
    assert.match(inTest.stderr, /repo .* is missing/, inTest.stderr);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
