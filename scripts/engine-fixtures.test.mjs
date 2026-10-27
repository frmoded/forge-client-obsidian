// Drain 2026-10-27-0710 §4 — `npm run rerecord-engine-fixtures`: ONE command that re-records both pinned engine fixtures when the bundled engine changes, and a check that fails with that command's NAME
// when either is stale. The fixtures: test/fixtures/engine-transpile/shipped-notes.json (recorded by scripts/record-engine-transpile.py; carries the digest of the engine it was recorded against) and
// rederive-comparison.json (scripts/compare-rederived-output.py --rev music-theory=baf108d; carries the engine commit, which must equal the recording's, src/rederive-comparison.test.ts).
// Everything here runs against STUB fixtures in temp directories and a STUB python (the injected runner writes what the real scripts would); the real scripts are exercised by the drain's own re-record.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { engineBundleDigest } from './engine-recording.mjs';
import { RERECORD_COMMAND, fixtureProblems, differsOnlyInEngineSha, rerecord } from './engine-fixtures-core.mjs';

const CHECK = path.resolve(import.meta.dirname, 'check-engine-fixtures.mjs');
const FIX = 'test/fixtures/engine-transpile';

/** A scratch client + forge. The engine files are identical in both unless `bundleDiffers`; the fixtures start fresh unless `shippedStale` / `comparisonStale`. */
function world({ bundleDiffers = false, shippedStale = false, comparisonStale = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'engfix-'));
  const client = path.join(root, 'client'), forge = path.join(root, 'forge');
  for (const [dir, body] of [[path.join(client, 'assets/engine/forge'), 'X = 1\n'], [path.join(forge, 'forge'), bundleDiffers ? 'X = 2\n' : 'X = 1\n']]) {
    fs.mkdirSync(path.join(dir, 'core'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'core', 'engine.py'), body);
  }
  const digest = engineBundleDigest(path.join(client, 'assets/engine/forge'));
  const shipped = { engine_sha: 'aaaa', engine_bundle_digest: shippedStale ? 'f'.repeat(64) : digest, notes: { 'v/n': { recipe: 'r', python: 'p' } }, unavailable: {} };
  const comparison = { engine_sha: comparisonStale ? 'bbbb' : 'aaaa', seeds: [1, 2], notes: { 'v/n': { verdict: 'identical', new: { 1: { digest: 'd' } } } } };
  fs.mkdirSync(path.join(client, FIX), { recursive: true });
  fs.writeFileSync(path.join(client, FIX, 'shipped-notes.json'), JSON.stringify(shipped, null, 1) + '\n');
  fs.writeFileSync(path.join(client, FIX, 'rederive-comparison.json'), JSON.stringify(comparison, null, 1) + '\n');
  return { root, client, forge, digest, shipped, comparison };
}
const read = (client, name) => JSON.parse(fs.readFileSync(path.join(client, FIX, name), 'utf8'));
/** The stub python: what the two real scripts would write, for a forge now at sha 'cccc'. `newComparison` shapes the comparison output. */
function stubPython(w, { newComparison = (c) => ({ ...c, engine_sha: 'cccc' }), calls = [] } = {}) {
  return async (script, args) => {
    calls.push({ script, args });
    const out = args[args.indexOf('--out') + 1];
    if (script === 'record-engine-transpile.py') fs.writeFileSync(out, JSON.stringify({ ...w.shipped, engine_sha: 'cccc', engine_bundle_digest: w.digest }) + '\n');
    else if (script === 'compare-rederived-output.py') fs.writeFileSync(out, JSON.stringify(newComparison(w.comparison)) + '\n');
    else return { status: 2, stderr: `unexpected script ${script}` };
    return { status: 0, stderr: '' };
  };
}

test('the re-record command is `npm run rerecord-engine-fixtures`, and package.json defines it', () => {
  assert.equal(RERECORD_COMMAND, 'npm run rerecord-engine-fixtures');
  const pkg = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../package.json'), 'utf8'));
  assert.match(pkg.scripts['rerecord-engine-fixtures'] ?? '', /rerecord-engine-fixtures\.mjs/);
  assert.match(pkg.scripts['check-engine-fixtures'] ?? '', /check-engine-fixtures\.mjs/);
});

test('fixtureProblems: fresh is empty; a recording made against another engine bundle is stale; a comparison of another engine commit than the recording is stale; each names its file', () => {
  const w = world();
  try {
    assert.deepEqual(fixtureProblems({ shipped: w.shipped, comparison: w.comparison, bundledDigest: w.digest }), []);
    const s = fixtureProblems({ shipped: { ...w.shipped, engine_bundle_digest: 'f'.repeat(64) }, comparison: w.comparison, bundledDigest: w.digest });
    assert.equal(s.length, 1);
    assert.equal(s[0].fixture, 'shipped-notes.json');
    assert.match(s[0].why, /recorded against engine bundle ffffffffffff… but the bundled engine is now/);
    const c = fixtureProblems({ shipped: w.shipped, comparison: { ...w.comparison, engine_sha: 'bbbb' }, bundledDigest: w.digest });
    assert.deepEqual(c.map((p) => p.fixture), ['rederive-comparison.json']);
    assert.match(c[0].why, /engine commit bbbb but the recording is of aaaa/);
    assert.equal(fixtureProblems({ shipped: { ...w.shipped, engine_bundle_digest: 'f'.repeat(64) }, comparison: { ...w.comparison, engine_sha: 'bbbb' }, bundledDigest: w.digest }).length, 2);
  } finally { fs.rmSync(w.root, { recursive: true, force: true }); }
});

test('check-engine-fixtures: exit 0 when fresh; exit 1 when stale, naming the stale file AND the command that fixes it', () => {
  const run = (client) => spawnSync(process.execPath, ['--no-warnings', CHECK, '--client', client], { encoding: 'utf8' });
  const fresh = world();
  const stale = world({ shippedStale: true });
  const staleCmp = world({ comparisonStale: true });
  try {
    const ok = run(fresh.client);
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /check-engine-fixtures: ok/);
    for (const [w, file] of [[stale, 'shipped-notes.json'], [staleCmp, 'rederive-comparison.json']]) {
      const r = run(w.client);
      assert.equal(r.status, 1, r.stdout + r.stderr);
      assert.match(r.stderr, new RegExp(`STALE: ${file.replace('.', '\\.')}`));
      assert.match(r.stderr, /npm run rerecord-engine-fixtures/, 'the failure names the command');
    }
  } finally { for (const w of [fresh, stale, staleCmp]) fs.rmSync(w.root, { recursive: true, force: true }); }
});

test('differsOnlyInEngineSha: only the top-level engine_sha may differ; anything else names its path', () => {
  // a value that is an object on one side and a scalar/array on the other is a difference at that path, never a crash or a silent pass
  assert.deepEqual(differsOnlyInEngineSha({ engine_sha: '1', n: { a: 1 } }, { engine_sha: '1', n: 5 }).paths, ['n']);
  assert.deepEqual(differsOnlyInEngineSha({ engine_sha: '1', n: [1] }, { engine_sha: '1', n: { 0: 1 } }).paths, ['n']);
  assert.deepEqual(differsOnlyInEngineSha({ engine_sha: '1', n: null }, { engine_sha: '1', n: { a: 1 } }).paths, ['n']);
  const a = { engine_sha: '1', seeds: [1, 2], notes: { n: { new: { 1: { digest: 'x' } } } } };
  assert.deepEqual(differsOnlyInEngineSha(a, { ...a, engine_sha: '2' }), { only: true, paths: [] });
  const r = differsOnlyInEngineSha(a, { ...a, engine_sha: '2', notes: { n: { new: { 1: { digest: 'y' } } } } });
  assert.equal(r.only, false);
  assert.deepEqual(r.paths, ['notes.n.new.1.digest']);
  assert.deepEqual(differsOnlyInEngineSha(a, { ...a, extra: 1 }).paths, ['extra']);
});

test('rerecord: a stale recording re-records BOTH fixtures (the recorder, then the comparison at music-theory=baf108d) and only engine_sha changes in the comparison', async () => {
  const w = world({ shippedStale: true, comparisonStale: true });
  try {
    const calls = [];
    const r = await rerecord({ client: w.client, forge: w.forge, runPython: stubPython(w, { calls }) });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(calls.map((c) => c.script), ['record-engine-transpile.py', 'compare-rederived-output.py']);
    assert.ok(calls[1].args.join(' ').includes('--rev music-theory=baf108d'), 'the comparison is run at the commit BEFORE the notes were re-derived');
    assert.ok(calls.every((c) => c.args.includes('--forge') && c.args[c.args.indexOf('--forge') + 1] === w.forge));
    assert.equal(read(w.client, 'shipped-notes.json').engine_sha, 'cccc');
    assert.deepEqual(read(w.client, 'rederive-comparison.json'), { ...w.comparison, engine_sha: 'cccc' }, 'only engine_sha changed');
    assert.deepEqual(fixtureProblems({ shipped: read(w.client, 'shipped-notes.json'), comparison: read(w.client, 'rederive-comparison.json'), bundledDigest: w.digest }), [], 'and the check is green afterwards');
  } finally { fs.rmSync(w.root, { recursive: true, force: true }); }
});

test('rerecord: fresh fixtures are left alone (no python runs, nothing written); --force re-records anyway', async () => {
  const w = world();
  try {
    const before = fs.readFileSync(path.join(w.client, FIX, 'shipped-notes.json'), 'utf8');
    const calls = [];
    const r = await rerecord({ client: w.client, forge: w.forge, runPython: stubPython(w, { calls }) });
    assert.equal(r.ok, true); assert.equal(r.changed, false);
    assert.equal(calls.length, 0);
    assert.equal(fs.readFileSync(path.join(w.client, FIX, 'shipped-notes.json'), 'utf8'), before);
    const forced = await rerecord({ client: w.client, forge: w.forge, runPython: stubPython(w, { calls }), force: true });
    assert.equal(forced.ok, true); assert.equal(forced.changed, true); assert.equal(calls.length, 2);
  } finally { fs.rmSync(w.root, { recursive: true, force: true }); }
});

test('rerecord refuses to record against an engine the plugin does not bundle (the bundle lags forge): it names the sync command and runs nothing', async () => {
  const w = world({ bundleDiffers: true, shippedStale: true });
  try {
    const calls = [];
    const r = await rerecord({ client: w.client, forge: w.forge, runPython: stubPython(w, { calls }) });
    assert.equal(r.ok, false);
    assert.match(r.message, /node scripts\/sync-engine-bundle\.mjs/);
    assert.equal(calls.length, 0);
    assert.equal(read(w.client, 'shipped-notes.json').engine_bundle_digest, 'f'.repeat(64), 'untouched');
  } finally { fs.rmSync(w.root, { recursive: true, force: true }); }
});

test('rerecord is all-or-nothing: if the re-recorded comparison differs in anything but engine_sha, NEITHER fixture is replaced, the paths that moved are named, and the candidate is kept for review', async () => {
  const w = world({ shippedStale: true, comparisonStale: true });
  try {
    const moved = (c) => ({ ...c, engine_sha: 'cccc', notes: { 'v/n': { verdict: 'DIFFERENT', new: { 1: { digest: 'd' } } } } });
    const r = await rerecord({ client: w.client, forge: w.forge, runPython: stubPython(w, { newComparison: moved }) });
    assert.equal(r.ok, false);
    assert.match(r.message, /notes\.v\/n\.verdict/);
    assert.ok(r.candidate && fs.existsSync(r.candidate), 'the candidate comparison is kept at ' + r.candidate);
    fs.rmSync(r.candidate, { force: true });
    assert.equal(read(w.client, 'shipped-notes.json').engine_bundle_digest, 'f'.repeat(64), 'the recording was not replaced either');
    assert.deepEqual(read(w.client, 'rederive-comparison.json'), w.comparison, 'the comparison was not replaced');
  } finally { fs.rmSync(w.root, { recursive: true, force: true }); }
});

test('rerecord reports a python script that failed, and replaces nothing', async () => {
  const w = world({ shippedStale: true });
  try {
    const r = await rerecord({ client: w.client, forge: w.forge, runPython: async () => ({ status: 1, stderr: 'ModuleNotFoundError: yaml' }) });
    assert.equal(r.ok, false);
    assert.match(r.message, /record-engine-transpile\.py failed.*ModuleNotFoundError: yaml/s);
    assert.equal(read(w.client, 'shipped-notes.json').engine_bundle_digest, 'f'.repeat(64));
  } finally { fs.rmSync(w.root, { recursive: true, force: true }); }
});

// The CLI wrapper (scripts/rerecord-engine-fixtures.mjs): its two refusals, as a subprocess, against a scratch forge. Neither reads the real fixtures (it refuses before), so neither depends on whether they are fresh today.
const REREC = path.resolve(import.meta.dirname, 'rerecord-engine-fixtures.mjs');
const rerec = (...args) => spawnSync(process.execPath, ['--no-warnings', REREC, ...args], { encoding: 'utf8' });

test('rerecord-engine-fixtures (CLI): a forge without a .venv is exit 2 naming the python it looked for; nothing is run', () => {
  const forge = fs.mkdtempSync(path.join(os.tmpdir(), 'engfix-novenv-'));
  try {
    const r = rerec('--forge', forge);
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, new RegExp(`no ${path.join(forge, '.venv', 'bin', 'python').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(r.stderr, /virtualenv/);
  } finally { fs.rmSync(forge, { recursive: true, force: true }); }
});

test('rerecord-engine-fixtures (CLI): a forge whose engine is not the bundled one is exit 1 with the sync command named, prefixed "rerecord-engine-fixtures:"', () => {
  const forge = fs.mkdtempSync(path.join(os.tmpdir(), 'engfix-lag-'));
  try {
    fs.mkdirSync(path.join(forge, '.venv', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(forge, '.venv', 'bin', 'python'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    fs.mkdirSync(path.join(forge, 'forge', 'core'), { recursive: true });
    fs.writeFileSync(path.join(forge, 'forge', 'core', 'engine.py'), 'NOT_THE_BUNDLED_ENGINE = 1\n');
    const r = rerec('--forge', forge);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /^rerecord-engine-fixtures: the bundled engine \(assets\/engine\/forge, [0-9a-f]{12}…\) is not the engine at /);
    assert.match(r.stdout, /node scripts\/sync-engine-bundle\.mjs first/);
  } finally { fs.rmSync(forge, { recursive: true, force: true }); }
});

test('rerecord: exact messages and no litter — the success line names both files and the engine, the fresh line says nothing to re-record, a refusal names 12 characters of each digest, more than 8 moved paths are cut to 8 with "..."; a script that exits 0 but wrote no file is a failure; no scratch directory is left behind on any path', async () => {
  const scratchDirs = () => fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('rerecord-engine-fixtures-')).length;
  const before = scratchDirs();
  const w = world({ shippedStale: true, comparisonStale: true });
  try {
    const ok = await rerecord({ client: w.client, forge: w.forge, runPython: stubPython(w) });
    assert.equal(ok.message, 're-recorded shipped-notes.json and rederive-comparison.json (engine cccc); commit both');
    assert.equal(scratchDirs(), before, 'success leaves no scratch directory');
    const fresh = await rerecord({ client: w.client, forge: w.forge, runPython: stubPython(w) });
    assert.equal(fresh.message, 'both engine fixtures are fresh; nothing to re-record');
    // exits 0 but writes nothing
    const w2 = world({ shippedStale: true });
    const silent = await rerecord({ client: w2.client, forge: w2.forge, runPython: async () => ({ status: 0, stderr: '' }) });
    assert.equal(silent.ok, false); assert.match(silent.message, /record-engine-transpile\.py failed \(exit 0\)/);
    assert.equal(scratchDirs(), before, 'a failed script leaves no scratch directory');
    // a refusal for a lagging bundle prints 12 characters of each digest, not 11 or 13
    const w3 = world({ bundleDiffers: true, shippedStale: true });
    const lag = await rerecord({ client: w3.client, forge: w3.forge, runPython: stubPython(w3) });
    assert.match(lag.message, new RegExp('\\(assets/engine/forge, ' + engineBundleDigest(path.join(w3.client, 'assets/engine/forge')).slice(0, 12) + '…\\) is not the engine at .* \\(' + engineBundleDigest(path.join(w3.forge, 'forge')).slice(0, 12) + '…\\)'));
    // ten moved paths: the message shows eight and "..."; exactly eight shows no "..."
    const many = (n) => (c) => ({ ...c, engine_sha: 'cccc', notes: Object.fromEntries(Array.from({ length: n }, (_, i) => ['n' + i, { v: i }])) });
    const w4 = world({ shippedStale: true, comparisonStale: true });
    w4.comparison.notes = {};
    fs.writeFileSync(path.join(w4.client, FIX, 'rederive-comparison.json'), JSON.stringify(w4.comparison));
    const ten = await rerecord({ client: w4.client, forge: w4.forge, runPython: stubPython(w4, { newComparison: many(10) }) });
    assert.match(ten.message, /\(notes\.n0, notes\.n1, notes\.n2, notes\.n3, notes\.n4, notes\.n5, notes\.n6, notes\.n7, \.\.\.\)/);
    const eight = await rerecord({ client: w4.client, forge: w4.forge, runPython: stubPython(w4, { newComparison: many(8) }) });
    assert.doesNotMatch(eight.message, /\.\.\./); assert.match(eight.message, /notes\.n7\)/);
    fs.rmSync(ten.candidate, { force: true }); fs.rmSync(eight.candidate, { force: true });
    assert.equal(scratchDirs(), before, 'a refused comparison leaves no scratch directory either (only the kept candidate, which lives elsewhere)');
    for (const x of [w2, w3, w4]) fs.rmSync(x.root, { recursive: true, force: true });
  } finally { fs.rmSync(w.root, { recursive: true, force: true }); }
});
